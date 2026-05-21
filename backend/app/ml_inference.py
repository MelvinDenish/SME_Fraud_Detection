"""Meta-learner inference bridge — wires the F1a/F1b/F1c artefacts into the
live /analyse path so PRD §7.1's `p_fraud_calibrated` and `p_fraud_interval`
stop being null.

This closes the gap LOCAL_TEST_REPORT §3.1 flagged: the ML tier exists
on disk (`ml/artifacts/{f1a_oof,f1b_isotonic,f1c_conformal}.joblib`) but
no backend code path loads it. The scorer calls `score_ml(bundle, ctx)`
from here and gets back `(p, low, high)` ready to set on `RiskReport`.

Design notes:

* Artefacts are loaded lazily on the first inference call (not at import
  time) so the backend boots even when `ml/artifacts/` is empty.
* Loading is guarded with a single asyncio lock — concurrent first-callers
  don't double-load.
* `compute_calibrated_probability` returns `None` for *both* fields when
  any artefact is missing or feature extraction fails; the scorer then
  emits the PRD §7.1 schema with explicit null (the documented
  fallback).
* No new dependencies — uses the same joblib / numpy already pinned for
  the ML training stack.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from backend.app.ingest.benchmarks import BenchmarkPoint
from backend.app.ingest.nclt import RawNCLTProceeding
from backend.app.ingest.schemas import CompanyBundle
from backend.app.ingest.wilful_defaulter import RawWilfulDefaulter

logger = logging.getLogger(__name__)

ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / "ml" / "artifacts"
F1A_PATH = ARTIFACTS_DIR / "f1a_oof.joblib"
F1B_PATH = ARTIFACTS_DIR / "f1b_isotonic.joblib"
F1C_PATH = ARTIFACTS_DIR / "f1c_conformal.joblib"


@dataclass
class MetaArtifacts:
    """Loaded F1a/b/c bundle. None when any file is missing."""

    f1a: object  # OOFResult — duck-typed to avoid heavy ml/* import at module top
    f1b: object  # CalibrationArtifacts
    f1c: object  # ConformalArtifacts


_artifacts: MetaArtifacts | None = None
_load_attempted: bool = False
_load_lock = asyncio.Lock()


async def _load_artifacts() -> MetaArtifacts | None:
    """Lazy-load F1a/F1b/F1c artefacts. Returns None when any file is missing.

    First-call cost is ~150ms (LightGBM + joblib). Subsequent calls hit the
    module-level cache. The lock prevents concurrent first-callers from
    redundantly deserialising in parallel.
    """
    global _artifacts, _load_attempted
    if _load_attempted:
        return _artifacts
    async with _load_lock:
        if _load_attempted:
            return _artifacts
        _load_attempted = True
        if not (F1A_PATH.exists() and F1B_PATH.exists() and F1C_PATH.exists()):
            missing = [p.name for p in (F1A_PATH, F1B_PATH, F1C_PATH) if not p.exists()]
            logger.info(
                "ml_inference: meta-learner artefacts not present (%s) — "
                "p_fraud_calibrated / p_fraud_interval will return null. "
                "Run `python scripts/day13_oof_retrain.py --save` to populate.",
                ", ".join(missing),
            )
            return None
        try:
            from ml.meta.f1a_lightgbm_oof import OOFResult
            from ml.meta.f1b_isotonic import CalibrationArtifacts
            from ml.meta.f1c_mapie import ConformalArtifacts
            f1a = await asyncio.to_thread(OOFResult.load, str(F1A_PATH))
            f1b = await asyncio.to_thread(CalibrationArtifacts.load, str(F1B_PATH))
            f1c = await asyncio.to_thread(ConformalArtifacts.load, str(F1C_PATH))
            _artifacts = MetaArtifacts(f1a=f1a, f1b=f1b, f1c=f1c)
            logger.info("ml_inference: F1a/F1b/F1c artefacts loaded from %s", ARTIFACTS_DIR)
            return _artifacts
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning("ml_inference: failed to load artefacts (%s) — falling back to null", exc)
            return None


def reset_for_tests() -> None:
    """Clear the module-level cache so tests can simulate a cold start."""
    global _artifacts, _load_attempted
    _artifacts = None
    _load_attempted = False


@dataclass
class MetaPrediction:
    """Return value of compute_calibrated_probability."""

    p_fraud: float | None
    interval: tuple[float, float] | None


async def compute_calibrated_probability(
    bundle: CompanyBundle,
    *,
    benchmarks: list[BenchmarkPoint],
    nclt: list[RawNCLTProceeding],
    wilful: list[RawWilfulDefaulter],
    analytics_cache: object | None = None,
) -> MetaPrediction:
    """Run F1a → F1b → F1c on this bundle. Returns nulls when artefacts
    aren't loaded or feature extraction fails. Never raises."""
    artifacts = await _load_artifacts()
    if artifacts is None:
        return MetaPrediction(p_fraud=None, interval=None)

    try:
        # Same feature contract as scripts/day13_oof_retrain.py — the meta
        # learner's input vector is whatever shape build_feature_vector
        # produces today. If the analytics_cache is supplied at both train
        # and infer the shape includes M10/M11 triplets + D4/D6 detectors.
        from ml.features import FeatureContext, build_feature_vector
        from ml.meta.f1c_mapie import predict_with_interval

        ctx = FeatureContext(
            benchmarks=benchmarks, nclt=nclt, wilful=wilful,
            analytics_cache=analytics_cache,
        )
        x = await asyncio.to_thread(build_feature_vector, bundle, ctx)
        X = np.asarray(x, dtype=np.float32).reshape(1, -1)
        p_arr, low_arr, high_arr = await asyncio.to_thread(
            predict_with_interval,
            artifacts.f1a, artifacts.f1b, artifacts.f1c, X,
        )
        p = float(p_arr[0])
        low = float(low_arr[0])
        high = float(high_arr[0])
        # Defensive clamp — F1c already clips, but guard against weird inputs.
        return MetaPrediction(
            p_fraud=max(0.0, min(1.0, p)),
            interval=(max(0.0, min(1.0, low)), max(0.0, min(1.0, high))),
        )
    except Exception as exc:
        logger.warning(
            "ml_inference: predict failed for %s (%s) — emitting null fields",
            bundle.company.cin, exc,
        )
        return MetaPrediction(p_fraud=None, interval=None)
