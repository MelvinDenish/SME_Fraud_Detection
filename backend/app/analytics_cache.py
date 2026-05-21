"""Startup-precomputed analytics cache — backing store for M10 + M11.

Both modules need a *population view* of the company pool to fire usefully:

* M10 (hypergraph shell) groups companies by shared attribute (address /
  auditor DIN / phone / IFSC). One CIN's contribution depends on whether
  other CINs share its attribute. Per-request scoring with just one CIN
  would never fire. We run the batch once at startup and cache the
  per-CIN ModuleResult dict.
* M11 (anomaly) trains IsolationForest + LOF against a background sample.
  Per-request scoring without a background returns abstained. We pre-build
  the 20-D financial matrix and the 7-D L0.5 graph-feature matrix from
  the fixture pool once.

Both caches are loaded lazily on first /analyse request via
`get_or_build()`. Subsequent requests hit the in-memory dict. Tests can
call `reset_for_tests()` to clear between runs.

LOCAL_TEST_REPORT §3.2: this closes the M10/M11 deferral.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING

import networkx as nx
import numpy as np

from backend.app.ingest.schemas import CompanyBundle
from backend.app.modules.m10_hypergraph_shell import HypergraphInputs
from backend.app.modules.m10_hypergraph_shell import run as m10_run
from backend.app.modules.m11_anomaly import (
    financial_feature_row,
    graph_feature_row,
)
from ml.detectors.d4_lof import D4LOF
from ml.detectors.d6_combined_ae import D6Artifacts, train_d6
from ml.l05_graph_features import GraphFeatures, extract_features

if TYPE_CHECKING:  # pragma: no cover
    from backend.app.modules.base import ModuleResult

logger = logging.getLogger(__name__)


@dataclass
class AnalyticsCache:
    """All population-view artefacts the per-request scorer needs."""

    # M11 cache
    graph_feature_by_cin: dict[str, GraphFeatures] = field(default_factory=dict)
    financial_row_by_cin: dict[str, np.ndarray] = field(default_factory=dict)
    background_graph: np.ndarray = field(default_factory=lambda: np.zeros((0, 7)))
    background_financials: np.ndarray = field(default_factory=lambda: np.zeros((0, 20)))

    # M10 cache — full batch result, indexed by CIN
    m10_results: dict[str, "ModuleResult"] = field(default_factory=dict)

    # Detector outputs cached at build time. D3 (TGN) + D5 (Mamba) deferred —
    # they need event-stream / sequence-builder pipelines that don't exist
    # yet (see LOCAL_TEST_REPORT §3.1). D4 + D6 fit the existing 20+7 feature
    # rows and integrate cleanly here.
    d4_scores_by_cin: dict[str, float] = field(default_factory=dict)
    d6_artifacts: D6Artifacts | None = None
    d6_scores_by_cin: dict[str, float] = field(default_factory=dict)


_cache: AnalyticsCache | None = None
_build_lock = asyncio.Lock()


def _build_global_graph(
    bundles: list[CompanyBundle],
) -> tuple[nx.DiGraph, dict[str, int], dict[str, date]]:
    """Construct the Company×Director bipartite graph used for L0.5 features.

    Edges: (company_cin -> director_din) for every IS_DIRECTOR_OF relationship
    in the fixture pool. Directors that direct multiple companies become hubs;
    L0.5 PageRank + betweenness pick them up, which is the actual signal we
    want M11 (LOF) to learn against.
    """
    g: nx.DiGraph = nx.DiGraph()
    director_counts: dict[str, int] = {}
    incorporation_dates: dict[str, date] = {}
    for b in bundles:
        cin = b.company.cin
        g.add_node(cin, kind="company")
        director_counts[cin] = len(b.directors)
        incorporation_dates[cin] = b.company.incorporation_date
        for d in b.directors:
            g.add_node(d.din, kind="director")
            g.add_edge(cin, d.din)
    return g, director_counts, incorporation_dates


def build_cache(
    bundles: list[CompanyBundle], *, as_of: date | None = None,
) -> AnalyticsCache:
    """Synchronous builder — exposed for scripts/training that want offline
    access. The async `get_or_build()` wraps this via to_thread."""
    cache = AnalyticsCache()
    if not bundles:
        return cache

    # ---- M11: graph features over the fixture-pool bipartite graph --------
    g, director_counts, incorporation_dates = _build_global_graph(bundles)
    feat_map = extract_features(
        g,
        director_counts=director_counts,
        incorporation_dates=incorporation_dates,
        as_of=as_of,
    )

    graph_rows: list[np.ndarray] = []
    financial_rows: list[np.ndarray] = []

    for b in bundles:
        cin = b.company.cin
        gf = feat_map.get(cin)
        if gf is not None:
            cache.graph_feature_by_cin[cin] = gf
            graph_rows.append(graph_feature_row(gf))
        fs_sorted = sorted(b.financials, key=lambda f: f.year)
        if fs_sorted:
            row = financial_feature_row(fs_sorted[-1])
            cache.financial_row_by_cin[cin] = row
            financial_rows.append(row)

    cache.background_graph = (
        np.vstack(graph_rows) if graph_rows else np.zeros((0, 7))
    )
    cache.background_financials = (
        np.vstack(financial_rows) if financial_rows else np.zeros((0, 20))
    )

    # ---- M10: one-shot batch over all (companies + charges) ---------------
    companies = [b.company for b in bundles]
    charges = [c for b in bundles for c in b.charges]
    cache.m10_results = m10_run(HypergraphInputs(companies=companies, charges=charges))

    # ---- D4 (LOF) + D6 (Combined AE): batch-fit-and-score on backgrounds --
    # These match M11's LOF + IsoForest in spirit but expose normalised
    # scores in [0, 1] for direct concatenation onto the meta-learner
    # feature vector. Done here once at startup so per-request inference is
    # a dict lookup.
    rows_cin_order = list(cache.graph_feature_by_cin.keys())
    if rows_cin_order and cache.background_graph.shape[0] >= 2:
        d4 = D4LOF(n_neighbors=20)
        d4_scores = d4.fit_score(cache.background_graph)
        for cin, s in zip(rows_cin_order, d4_scores):
            cache.d4_scores_by_cin[cin] = float(s)

    # D6 needs row-aligned (tabular, graph) pairs. Some fixtures only have
    # one or the other — intersect the CINs that carry both, then build
    # aligned matrices in CIN order.
    both = [
        c for c in cache.financial_row_by_cin
        if c in cache.graph_feature_by_cin
    ]
    if len(both) >= 2:
        d6_tab = np.vstack([cache.financial_row_by_cin[c] for c in both]).astype(np.float32)
        d6_graph = np.vstack(
            [graph_feature_row(cache.graph_feature_by_cin[c]) for c in both]
        ).astype(np.float32)
        cache.d6_artifacts = train_d6(d6_tab, d6_graph, epochs=20, seed=42)
        d6_scores = cache.d6_artifacts.anomaly_scores(d6_tab, d6_graph)
        for cin, s in zip(both, d6_scores):
            cache.d6_scores_by_cin[cin] = float(s)

    logger.info(
        "analytics_cache: built from %d bundles — graph_bg=%d financial_bg=%d "
        "m10_hits=%d d4=%d d6=%d",
        len(bundles),
        cache.background_graph.shape[0],
        cache.background_financials.shape[0],
        len(cache.m10_results),
        len(cache.d4_scores_by_cin),
        len(cache.d6_scores_by_cin),
    )
    return cache


def compute_target_detector_scores(
    cin: str, bundle: CompanyBundle, cache: AnalyticsCache,
) -> tuple[float, float]:
    """Return (d4_score, d6_score) for a CIN.

    Fast-path: dict lookup when the CIN was in the cache build set. Slow-path
    (uploads / new CINs): compute fresh against the cached background. Zeros
    when the cache or target rows are missing — never raises.
    """
    pre_d4 = cache.d4_scores_by_cin.get(cin)
    pre_d6 = cache.d6_scores_by_cin.get(cin)
    if pre_d4 is not None and pre_d6 is not None:
        return pre_d4, pre_d6

    d4_out: float = pre_d4 if pre_d4 is not None else 0.0
    d6_out: float = pre_d6 if pre_d6 is not None else 0.0

    # Slow-path D6 only — D4 needs a (background + target) refit which is
    # 100x slower than the cached lookup; skipping per-request is honest.
    if pre_d6 is None and cache.d6_artifacts is not None and bundle.financials:
        gf = cache.graph_feature_by_cin.get(cin)
        if gf is not None:
            fs_sorted = sorted(bundle.financials, key=lambda f: f.year)
            tab = financial_feature_row(fs_sorted[-1]).astype(np.float32).reshape(1, -1)
            graph = graph_feature_row(gf).astype(np.float32).reshape(1, -1)
            try:
                d6_out = float(cache.d6_artifacts.anomaly_scores(tab, graph)[0])
            except Exception as exc:  # pragma: no cover — defensive
                logger.warning("analytics_cache: D6 slow-path failed for %s (%s)", cin, exc)
    return d4_out, d6_out


async def get_or_build(bundles_provider) -> AnalyticsCache:
    """Return the cached analytics, building it lazily on first call.

    bundles_provider is an async callable that returns list[CompanyBundle] —
    typically `lambda: _fixture_source.fetch_all_bundles()` from the analyse
    handler. Passing a thunk (not the list itself) avoids loading bundles on
    every request after the cache is warm.
    """
    global _cache
    if _cache is not None:
        return _cache
    async with _build_lock:
        if _cache is not None:
            return _cache
        bundles = await bundles_provider()
        # CPU-bound: extract_features + IsolationForest fit later use it.
        _cache = await asyncio.to_thread(build_cache, bundles)
        return _cache


def reset_for_tests() -> None:
    """Clear the module-level cache so tests can rebuild between runs."""
    global _cache
    _cache = None
