"""Tier-1 module-score feature builder (PRD §5.2 + §10 Day 13).

Converts a CompanyBundle into a fixed-width numeric feature vector by running
every Tier-1 module that can score the bundle deterministically and emitting
each module's score, its max-severity ordinal, and its signal count.

This is the L2 stack input to F1a (LightGBM OOF). Keeping the builder in one
place means the OOF retrain in Day 13 and the production scorer in Day 15 see
the same feature schema — drift = label leakage.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from backend.app.ingest.benchmarks import BenchmarkPoint
from backend.app.ingest.nclt import RawNCLTProceeding
from backend.app.ingest.schemas import CompanyBundle
from backend.app.ingest.wilful_defaulter import RawWilfulDefaulter
from backend.app.modules import (
    m01_beneish,
    m02_cross_statement,
    m05_peer_deviation,
    m06_temporal,
    m07_auditor_nlp,
    m08_document_forensics,
    m09_nclt_defaulter,
)
from backend.app.modules.base import ModuleResult, Severity
from backend.app.modules.m02_cross_statement import CrossStatementInputs
from backend.app.modules.m06_temporal import TemporalInputs
from backend.app.modules.m09_nclt_defaulter import NCLTDefaulterInputs


# Three features per module: score, max severity ordinal, signal count.
_PER_MODULE_FEATURES = ("score", "max_severity", "signal_count")

MODULE_KEYS: tuple[str, ...] = ("m1", "m2", "m5", "m6", "m7", "m8", "m9")

FEATURE_NAMES: tuple[str, ...] = tuple(
    f"{mod}_{feat}" for mod in MODULE_KEYS for feat in _PER_MODULE_FEATURES
) + (
    "fs_count",
    "has_gst_upload",
    "has_bank_upload",
    "director_count",
    "active_director_count",
    "charge_count",
    "total_borrowings",
    "revenue_latest",
    "pat_latest",
    "going_concern_any",
    "adverse_any",
)


@dataclass
class FeatureContext:
    """Shared lookups that every bundle needs."""

    benchmarks: list[BenchmarkPoint]
    nclt: list[RawNCLTProceeding]
    wilful: list[RawWilfulDefaulter]


def _module_triplet(result: ModuleResult | None) -> tuple[float, float, float]:
    if result is None or result.skipped:
        return (0.0, 0.0, 0.0)
    max_sev = result.max_severity
    sev_ord = float(max_sev.numeric) if max_sev is not None else 0.0
    return (float(result.score), sev_ord, float(len(result.signals)))


def _bundle_triplets(
    bundle: CompanyBundle, ctx: FeatureContext,
) -> dict[str, tuple[float, float, float]]:
    """Run each module on the bundle. Modules that can't score abstain."""
    triplets: dict[str, tuple[float, float, float]] = {}
    fs_sorted = sorted(bundle.financials, key=lambda f: f.year)

    if len(fs_sorted) >= 2:
        triplets["m1"] = _module_triplet(m01_beneish.run(fs_sorted[-1], fs_sorted[-2]))
    else:
        triplets["m1"] = (0.0, 0.0, 0.0)

    if fs_sorted:
        curr = fs_sorted[-1]
        prev = fs_sorted[-2] if len(fs_sorted) >= 2 else None
        cwip_hist = fs_sorted[-3:] if len(fs_sorted) >= 3 else None
        m2 = m02_cross_statement.run(CrossStatementInputs(
            current=curr, previous=prev, cwip_history=cwip_hist,
        ))
        triplets["m2"] = _module_triplet(m2)

        m5 = m05_peer_deviation.run(
            curr, prev,
            nic_code=bundle.company.nic_code,
            benchmarks=ctx.benchmarks,
        )
        triplets["m5"] = _module_triplet(m5)

        triplets["m6"] = _module_triplet(m06_temporal.run(TemporalInputs(
            financials=fs_sorted,
            directors=list(bundle.directors),
        )))

        triplets["m7"] = _module_triplet(m07_auditor_nlp.run(fs_sorted))
        triplets["m8"] = _module_triplet(m08_document_forensics.run_for_fs_list(fs_sorted))
    else:
        for key in ("m2", "m5", "m6", "m7", "m8"):
            triplets[key] = (0.0, 0.0, 0.0)

    triplets["m9"] = _module_triplet(m09_nclt_defaulter.run(NCLTDefaulterInputs(
        cin=bundle.company.cin,
        nclt_proceedings=ctx.nclt,
        wilful_declarations=ctx.wilful,
    )))

    return triplets


def build_feature_vector(bundle: CompanyBundle, ctx: FeatureContext) -> np.ndarray:
    """Return one row of the feature matrix for this bundle."""
    triplets = _bundle_triplets(bundle, ctx)
    flat: list[float] = []
    for mod in MODULE_KEYS:
        flat.extend(triplets[mod])

    fs_sorted = sorted(bundle.financials, key=lambda f: f.year)
    curr = fs_sorted[-1] if fs_sorted else None
    flat.extend([
        float(len(fs_sorted)),
        1.0 if bundle.has_gst_upload else 0.0,
        1.0 if bundle.has_bank_upload else 0.0,
        float(len(bundle.directors)),
        float(sum(1 for d in bundle.directors if d.cessation_date is None)),
        float(len(bundle.charges)),
        float((curr.long_term_borrowings + curr.short_term_borrowings) if curr else 0.0),
        float(curr.revenue if curr else 0.0),
        float(curr.pat if curr else 0.0),
        1.0 if any(f.going_concern_flag for f in fs_sorted) else 0.0,
        1.0 if any(f.adverse_flag for f in fs_sorted) else 0.0,
    ])
    return np.asarray(flat, dtype=np.float32)


def build_feature_matrix(
    bundles: list[CompanyBundle], ctx: FeatureContext,
) -> tuple[np.ndarray, list[str]]:
    """Stack feature rows for every bundle. Returns (X, cins_in_row_order)."""
    rows = [build_feature_vector(b, ctx) for b in bundles]
    cins = [b.company.cin for b in bundles]
    X = np.vstack(rows) if rows else np.zeros((0, len(FEATURE_NAMES)), dtype=np.float32)
    return X, cins


# Severity legend exported so downstream consumers don't have to import the enum.
SEVERITY_NUMERIC = {s.value: s.numeric for s in Severity}
