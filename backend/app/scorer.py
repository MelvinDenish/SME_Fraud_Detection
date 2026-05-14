"""RiskScorer — orchestrates Tier-1 modules + ML detectors (PRD §7).

Async fan-out across M1-M11 via asyncio.gather, applies PRD §7.3 override
rules, computes the ensemble-disagreement flag, and emits the dual-output
payload PRD §7.1 mandates.

Output schema (verbatim):

    {
      "cin": "U…",
      "fraud_risk_score": 0–100,                  # Tier-1 weighted aggregate
      "risk_band": "LOW|MEDIUM|HIGH|CRITICAL",
      "p_fraud_calibrated": 0.0–1.0 | null,       # populated when F1b artefact loaded
      "p_fraud_interval": [low, high] | null,      # populated when F1c artefact loaded
      "data_confidence": 0–100,                   # DataCompletenessScore
      "ensemble_disagreement_flag": bool,         # True when any 2 module scores diverge > 30pts
      "evidence_chain": [FraudSignal…],           # with TRIGGERED_BY provenance
      "module_breakdown": {module_name: score, …},# per-module Tier-1 contributions
      "override_applied": bool,                   # PRD §7.3 NCLT/WD override
      "skipped_modules": [{"module": …, "reason": …}, …],
    }

PRD §7 invariants:
  - Never emit fraud_risk_score without data_confidence (and vice-versa).
  - Any CRITICAL flag forces fraud_risk_score >= 60.
  - NCLT/WD match forces fraud_risk_score >= 75 via apply_override().
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict, dataclass, field
from typing import Any

from backend.app.ingest.benchmarks import BenchmarkPoint
from backend.app.ingest.data_confidence import compute_data_confidence
from backend.app.ingest.gst import RawGSTEntity
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
from backend.app.modules.base import FraudSignal, ModuleResult, Severity, clamp_score
from backend.app.modules.m02_cross_statement import CrossStatementInputs
from backend.app.modules.m06_temporal import TemporalInputs
from backend.app.modules.m09_nclt_defaulter import (
    NCLT_WD_FLOOR_SCORE,
    NCLTDefaulterInputs,
    apply_override,
)
from ml.belief_propagation import assign_band

logger = logging.getLogger(__name__)


# PRD §7.3 override constants
CRITICAL_FLAG_FLOOR_SCORE = 60.0

# PRD §7.4 ensemble-disagreement threshold (any two modules differ by > 30 pts)
ENSEMBLE_DISAGREEMENT_DELTA = 30.0

# Tier-1 module weights (PRD §7.2) — modules summed and clamped to [0, 100]
_MODULE_WEIGHTS: dict[str, float] = {
    "m01_beneish":          0.15,
    "m02_cross_statement":  0.20,
    "m05_peer_deviation":   0.10,
    "m06_temporal":         0.10,
    "m07_auditor_nlp":      0.10,
    "m08_document_forensics": 0.05,
    "m09_nclt_defaulter":   0.20,
    "m11_anomaly":          0.10,
}


@dataclass
class ScoringContext:
    """All shared lookups the scorer needs to run."""

    benchmarks: list[BenchmarkPoint] = field(default_factory=list)
    nclt: list[RawNCLTProceeding] = field(default_factory=list)
    wilful: list[RawWilfulDefaulter] = field(default_factory=list)
    # Day-16 upload overlay — populated by the /analyse handler so M2 sees
    # the user-supplied GST / bank-statement evidence on a per-call basis.
    gst_entity: RawGSTEntity | None = None
    bank_credits_total: float | None = None


@dataclass
class RiskReport:
    """Dual-output payload (PRD §7.1 verbatim shape, plus diagnostic extras)."""

    cin: str
    fraud_risk_score: float
    risk_band: str
    data_confidence: int
    ensemble_disagreement_flag: bool
    evidence_chain: list[FraudSignal]
    module_breakdown: dict[str, float]
    override_applied: bool
    skipped_modules: list[dict[str, str]]
    p_fraud_calibrated: float | None = None
    p_fraud_interval: tuple[float, float] | None = None
    # Day-16: belief-propagation lift from neighbouring CINs in the same
    # SharedAttribute cluster. Defaults to LOW for stand-alone runs.
    propagation_band: str = "LOW"
    propagation_score: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "cin": self.cin,
            "fraud_risk_score": round(self.fraud_risk_score, 2),
            "risk_band": self.risk_band,
            "p_fraud_calibrated": (
                round(self.p_fraud_calibrated, 4)
                if self.p_fraud_calibrated is not None else None
            ),
            "p_fraud_interval": (
                [round(self.p_fraud_interval[0], 4),
                 round(self.p_fraud_interval[1], 4)]
                if self.p_fraud_interval is not None else None
            ),
            "data_confidence": self.data_confidence,
            "ensemble_disagreement_flag": self.ensemble_disagreement_flag,
            "evidence_chain": [
                {
                    "signal_type": s.signal_type,
                    "severity": s.severity.value,
                    "score_contribution": s.score_contribution,
                    "evidence_string": s.evidence_string,
                    "module_name": s.module_name,
                    "triggered_by": s.triggered_by,
                    "signal_id": s.signal_id,
                }
                for s in self.evidence_chain
            ],
            "module_breakdown": {k: round(v, 2) for k, v in self.module_breakdown.items()},
            "override_applied": self.override_applied,
            "skipped_modules": self.skipped_modules,
            "propagation_band": self.propagation_band,
            "propagation_score": round(self.propagation_score, 2),
        }


# --- Per-module async runners. Each one is sync inside but we wrap in
# `asyncio.to_thread` so the fan-out actually executes in parallel. ---------
async def _run_m1(bundle: CompanyBundle) -> ModuleResult:
    fs_sorted = sorted(bundle.financials, key=lambda f: f.year)
    if len(fs_sorted) < 2:
        return ModuleResult.skipped_for(
            "m01_beneish", bundle.company.cin,
            fs_sorted[-1].year if fs_sorted else None,
            "Need 2+ consecutive FS years",
        )
    return await asyncio.to_thread(m01_beneish.run, fs_sorted[-1], fs_sorted[-2])


async def _run_m2(bundle: CompanyBundle, ctx: ScoringContext) -> ModuleResult:
    fs_sorted = sorted(bundle.financials, key=lambda f: f.year)
    if not fs_sorted:
        return ModuleResult.skipped_for(
            "m02_cross_statement", bundle.company.cin, None, "No financials",
        )
    curr = fs_sorted[-1]
    prev = fs_sorted[-2] if len(fs_sorted) >= 2 else None
    inputs = CrossStatementInputs(
        current=curr,
        previous=prev,
        cwip_history=fs_sorted[-3:] if len(fs_sorted) >= 3 else None,
        cersai_charges=list(bundle.charges),
        gst_entity=ctx.gst_entity,
        bank_credits_total=(
            ctx.bank_credits_total
            if ctx.bank_credits_total is not None
            else (curr.revenue * 1.04 if bundle.has_bank_upload else None)
        ),
    )
    return await asyncio.to_thread(m02_cross_statement.run, inputs)


async def _run_m5(bundle: CompanyBundle, ctx: ScoringContext) -> ModuleResult:
    fs_sorted = sorted(bundle.financials, key=lambda f: f.year)
    if not fs_sorted:
        return ModuleResult.skipped_for(
            "m05_peer_deviation", bundle.company.cin, None, "No financials",
        )
    curr = fs_sorted[-1]
    prev = fs_sorted[-2] if len(fs_sorted) >= 2 else None
    return await asyncio.to_thread(
        m05_peer_deviation.run, curr, prev,
        nic_code=bundle.company.nic_code, benchmarks=ctx.benchmarks,
    )


async def _run_m6(bundle: CompanyBundle) -> ModuleResult:
    return await asyncio.to_thread(
        m06_temporal.run,
        TemporalInputs(
            financials=list(bundle.financials),
            directors=list(bundle.directors),
        ),
    )


async def _run_m7(bundle: CompanyBundle) -> ModuleResult:
    fs_sorted = sorted(bundle.financials, key=lambda f: f.year)
    if not fs_sorted:
        return ModuleResult.skipped_for(
            "m07_auditor_nlp", bundle.company.cin, None, "No financials",
        )
    return await asyncio.to_thread(m07_auditor_nlp.run, fs_sorted)


async def _run_m8(bundle: CompanyBundle) -> ModuleResult:
    fs_sorted = sorted(bundle.financials, key=lambda f: f.year)
    if not fs_sorted:
        return ModuleResult.skipped_for(
            "m08_document_forensics", bundle.company.cin, None, "No financials",
        )
    return await asyncio.to_thread(m08_document_forensics.run_for_fs_list, fs_sorted)


async def _run_m9(bundle: CompanyBundle, ctx: ScoringContext) -> ModuleResult:
    return await asyncio.to_thread(
        m09_nclt_defaulter.run,
        NCLTDefaulterInputs(
            cin=bundle.company.cin,
            nclt_proceedings=ctx.nclt,
            wilful_declarations=ctx.wilful,
        ),
    )


# --- Public orchestration --------------------------------------------------
def _max_module_severity(results: list[ModuleResult]) -> Severity | None:
    severities = [r.max_severity for r in results if r.max_severity is not None]
    if not severities:
        return None
    return max(severities, key=lambda s: s.numeric)


def _ensemble_disagreement(scores: list[float]) -> bool:
    """PRD §7.4: True when any two module scores differ by > 30 pts."""
    non_zero = [s for s in scores if s > 0.0]
    if len(non_zero) < 2:
        return False
    return max(non_zero) - min(non_zero) > ENSEMBLE_DISAGREEMENT_DELTA


def _aggregate_score(results: list[ModuleResult]) -> float:
    """Weighted Tier-1 aggregate per PRD §7.2."""
    total = 0.0
    total_weight = 0.0
    for r in results:
        if r.skipped:
            continue
        weight = _MODULE_WEIGHTS.get(r.module_name, 0.0)
        total += r.score * weight
        total_weight += weight
    if total_weight == 0.0:
        return 0.0
    # Re-scale so partial-coverage runs aren't penalised — a single module with
    # weight 0.2 contributing 100 still yields 100 if it's the only one to run.
    return clamp_score(total * (sum(_MODULE_WEIGHTS.values()) / total_weight))


async def score(bundle: CompanyBundle, ctx: ScoringContext) -> RiskReport:
    """Fan-out across Tier-1 modules, apply overrides, build the dual-output."""
    results: list[ModuleResult] = await asyncio.gather(
        _run_m1(bundle),
        _run_m2(bundle, ctx),
        _run_m5(bundle, ctx),
        _run_m6(bundle),
        _run_m7(bundle),
        _run_m8(bundle),
        _run_m9(bundle, ctx),
    )
    evidence: list[FraudSignal] = []
    breakdown: dict[str, float] = {}
    skipped: list[dict[str, str]] = []
    for r in results:
        breakdown[r.module_name] = r.score
        if r.skipped:
            skipped.append({"module": r.module_name, "reason": r.skip_reason})
            continue
        evidence.extend(r.signals)

    base_score = _aggregate_score(results)

    # PRD §7.3: any CRITICAL signal forces score >= 60
    max_sev = _max_module_severity(results)
    if max_sev is Severity.CRITICAL:
        base_score = max(base_score, CRITICAL_FLAG_FLOOR_SCORE)

    # PRD §7.3: NCLT/WD override -> >= 75
    final_score, override_applied = apply_override(base_score, evidence)
    final_score = clamp_score(final_score)

    return RiskReport(
        cin=bundle.company.cin,
        fraud_risk_score=final_score,
        risk_band=assign_band(final_score),
        data_confidence=compute_data_confidence(bundle),
        ensemble_disagreement_flag=_ensemble_disagreement(list(breakdown.values())),
        evidence_chain=evidence,
        module_breakdown=breakdown,
        override_applied=override_applied,
        skipped_modules=skipped,
    )


# Expose constants the test suite & API contract reference.
__all__ = [
    "CRITICAL_FLAG_FLOOR_SCORE",
    "ENSEMBLE_DISAGREEMENT_DELTA",
    "NCLT_WD_FLOOR_SCORE",
    "RiskReport",
    "ScoringContext",
    "score",
]
