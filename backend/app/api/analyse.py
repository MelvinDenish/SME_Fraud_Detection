"""/analyse — PRD §10 Day 15.

The dual-output endpoint. Looks up a CIN, builds the ScoringContext from
fixture sources, fans the bundle out across Tier-1 modules via RiskScorer,
and returns the PRD §7.1 payload verbatim.

Phase 1 (Day 15) reads from the fixture sources so the demo path is
deterministic and offline-friendly. Day-17 wires the live MCA21 + CERSAI
scrapers so /analyse can take an unknown CIN.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from backend.app.ingest.benchmarks import BSEFixtureBenchmark
from backend.app.ingest.nclt import NCLTFixtureSource
from backend.app.ingest.sources import FixtureSource
from backend.app.ingest.wilful_defaulter import WilfulDefaulterFixtureSource
from backend.app.scorer import ScoringContext, score

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analyse", tags=["analyse"])

# Module-level singletons for the demo path so each /analyse call doesn't
# re-read JSON seeds from disk.
_fixture_source = FixtureSource()
_benchmark_source = BSEFixtureBenchmark()
_nclt_source = NCLTFixtureSource()
_wilful_source = WilfulDefaulterFixtureSource()


async def _build_scoring_context() -> ScoringContext:
    return ScoringContext(
        benchmarks=await _benchmark_source.fetch_all(),
        nclt=await _nclt_source.fetch_all(),
        wilful=await _wilful_source.fetch_all(),
    )


@router.get("/{cin}")
async def analyse(cin: str) -> dict:
    """PRD §7.1 dual-output payload for one CIN."""
    bundle = await _fixture_source.fetch_bundle(cin)
    if bundle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CIN {cin} not found in fixture source",
        )
    ctx = await _build_scoring_context()
    report = await score(bundle, ctx)
    return report.to_dict()
