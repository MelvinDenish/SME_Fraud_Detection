"""/analyse — PRD §10 Day 15 + Day 16 extensions.

The dual-output endpoint. Looks up a CIN, applies any /upload/* overlay,
fans the bundle out across Tier-1 modules via RiskScorer, then lifts the
score using belief propagation across same-cluster CINs (PRD §5.3).

Day-16 additions:
  - Upload overlay merged onto the FixtureSource bundle (GST + bank +
    extra financials).
  - propagation_band / propagation_score fields surfaced in the payload.
  - GET /analyse/{cin}/provenance returns the FraudSignal -> TRIGGERED_BY
    chain so the React UI can render the evidence graph.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from backend.app.api.upload_store import get_upload_store
from backend.app.ingest.benchmarks import BSEFixtureBenchmark
from backend.app.ingest.composite import CompositeCompanySource
from backend.app.ingest.nclt import NCLTFixtureSource
from backend.app.ingest.sources import FixtureSource
from backend.app.ingest.wilful_defaulter import WilfulDefaulterFixtureSource
from backend.app.scorer import ScoringContext, score
from ml.belief_propagation import SharedAttributeEdge, propagate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analyse", tags=["analyse"])

# Day-17 switches /analyse to the CompositeCompanySource which tries MCA21
# V3 first and falls back to the FixtureSource seeds on key absence / 404.
# Belief-propagation edges still come from the FixtureSource list (it's the
# only enumerable surface — MCA21 has no "list all CINs" endpoint).
_company_source = CompositeCompanySource()
_fixture_source = FixtureSource()
_benchmark_source = BSEFixtureBenchmark()
_nclt_source = NCLTFixtureSource()
_wilful_source = WilfulDefaulterFixtureSource()


async def _build_scoring_context(overlay) -> ScoringContext:
    return ScoringContext(
        benchmarks=await _benchmark_source.fetch_all(),
        nclt=await _nclt_source.fetch_all(),
        wilful=await _wilful_source.fetch_all(),
        gst_entity=overlay.gst_entity,
        bank_credits_total=overlay.bank_credits_total,
    )


async def _propagation_lift(cin: str, seed_score: float) -> tuple[str, float]:
    """Build SharedAttribute edges across all fixture CINs + this seed, then
    run loopy belief propagation. Returns (lifted_band, lifted_score)."""
    all_cins = await _fixture_source.list_available_cins()
    edges: list[SharedAttributeEdge] = []
    for other_cin in all_cins:
        b = await _fixture_source.fetch_bundle(other_cin)
        if b is None:
            continue
        c = b.company
        if c.registered_address:
            edges.append(SharedAttributeEdge(
                cin=c.cin, attribute_type="registered_address",
                attribute_value=c.registered_address.strip().lower(),
            ))
        if c.auditor_din:
            edges.append(SharedAttributeEdge(
                cin=c.cin, attribute_type="auditor_din",
                attribute_value=c.auditor_din,
            ))
        if c.contact_phone:
            edges.append(SharedAttributeEdge(
                cin=c.cin, attribute_type="contact_phone",
                attribute_value=c.contact_phone.strip(),
            ))
    seeds = {cin: seed_score} if cin in all_cins else {}
    if not seeds:
        return ("LOW", 0.0)
    result = propagate(seed_scores=seeds, edges=edges)
    return (result.bands.get(cin, "LOW"), float(result.lifted_scores.get(cin, 0.0)))


@router.get("/{cin}")
async def analyse(cin: str) -> dict:
    """PRD §7.1 dual-output payload for one CIN, with upload overlay folded in."""
    bundle = await _company_source.fetch_bundle(cin)
    if bundle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CIN {cin} not found in fixture source",
        )
    overlay = get_upload_store().get(cin)
    bundle = overlay.merge_into(bundle)
    ctx = await _build_scoring_context(overlay)
    report = await score(bundle, ctx)
    band, lifted = await _propagation_lift(cin, report.fraud_risk_score)
    report.propagation_band = band
    report.propagation_score = lifted
    return report.to_dict()


@router.get("/{cin}/provenance")
async def provenance(cin: str) -> dict:
    """Return the evidence chain in graph form: nodes + TRIGGERED_BY edges.

    Output shape:
      {
        "cin": "U…",
        "signals": [FraudSignal node payload, …],
        "triggered_by": [{signal_id, label, ref}, …]
      }
    Day-16 wires this from the live RiskScorer output. Day-20 swaps in
    Neo4j-backed traversal once the scorer writes FraudSignal nodes.
    """
    bundle = await _company_source.fetch_bundle(cin)
    if bundle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CIN {cin} not found in fixture source",
        )
    overlay = get_upload_store().get(cin)
    bundle = overlay.merge_into(bundle)
    ctx = await _build_scoring_context(overlay)
    report = await score(bundle, ctx)

    signals = []
    triggered_by = []
    for s in report.evidence_chain:
        signals.append({
            "signal_id": s.signal_id,
            "signal_type": s.signal_type,
            "severity": s.severity.value,
            "module_name": s.module_name,
            "score_contribution": s.score_contribution,
            "evidence_string": s.evidence_string,
        })
        for ref in s.triggered_by:
            triggered_by.append({
                "signal_id": s.signal_id,
                "label": ref.get("label"),
                "ref": {k: v for k, v in ref.items() if k != "label"},
            })

    return {
        "cin": cin,
        "signal_count": len(signals),
        "signals": signals,
        "triggered_by": triggered_by,
    }
