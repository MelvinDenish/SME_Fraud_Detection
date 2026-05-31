"""Gemini Flash narrative — PRD §5.5.

Three concerns:

1. `serialize_for_narrative(report)` — pure function. Picks the subset
   of the dual-output payload that the LLM is allowed to see + cite.
   No numbers come from the LLM; the LLM may quote *only* the numbers
   below. The serializer also computes the "allowed-numbers" set that
   the route's golden-string test asserts against.

2. `GeminiNarrator` — thin wrapper around `google.generativeai` with
   a 60 req/min sliding-window cap (PRD §2.1 / free tier) and an
   in-process evidence-hash cache so the same (cin, evidence) pair
   only hits the API once.

3. `_template_fallback(serialized)` — deterministic prose used when:
   * `GEMINI_API_KEY` is missing or placeholder (local dev, CI),
   * the rate-limit window is exhausted,
   * the SDK call raises.
   The template still cites the exact numbers from the structured
   evidence — never hallucinates, never blocks the page.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from backend.app.config import get_settings
from backend.app.scorer import RiskReport

logger = logging.getLogger(__name__)

# Hard cap from PRD §2.1: Gemini Flash free tier is 60 req/min. Stay
# slightly below to leave headroom for the route's own retries.
_RATE_LIMIT_PER_MIN = 55
_WINDOW_SECONDS = 60.0

# Evidence summary cap — Gemini Flash takes ~30k tokens of input cheaply
# but we want narrow, traceable prompts. 8 signals is enough to cover
# IL&FS' 19 (each signal collapses to one line).
_MAX_SIGNALS_IN_PROMPT = 8

# Cache size — small in-process LRU. Stream 2 explicitly avoids Redis.
_CACHE_MAX_ENTRIES = 256


# ---------------------------------------------------------------------------
# Step 1 — pure serializer + allowed-numbers extraction.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class NarrativeInput:
    """Structured prompt input — every number here is from the graph,
    never from the LLM. The narrator may *only* cite numbers in
    `allowed_numbers`."""

    cin: str
    risk_band: str
    fraud_risk_score: float
    p_fraud_calibrated: float | None
    p_fraud_interval: tuple[float, float] | None
    data_confidence: int
    ensemble_disagreement_flag: bool
    override_applied: bool
    signals: list[dict[str, Any]]    # severity + module + evidence_string (already authored by Tier-1 modules)
    top_modules: list[tuple[str, float]]
    allowed_numbers: set[str]
    evidence_hash: str

    def to_prompt_json(self) -> str:
        """JSON the LLM sees. Excludes `allowed_numbers` / `evidence_hash` —
        those are control-plane fields, not content."""
        return json.dumps({
            "cin": self.cin,
            "risk_band": self.risk_band,
            "fraud_risk_score": round(self.fraud_risk_score, 2),
            "p_fraud_calibrated": self.p_fraud_calibrated,
            "p_fraud_interval": list(self.p_fraud_interval) if self.p_fraud_interval else None,
            "data_confidence": self.data_confidence,
            "ensemble_disagreement_flag": self.ensemble_disagreement_flag,
            "override_applied": self.override_applied,
            "signals": self.signals,
            "top_modules": [{"module": m, "score": round(s, 2)} for m, s in self.top_modules],
        }, ensure_ascii=False, indent=2)


# A "number" here is a digit run that is NOT embedded inside an
# identifier (e.g. CIN `U45201MH2005PTC155294`, GSTIN `27AAACX1234A1Z5`,
# DIN `01234567`, fiscal date `2018-10-01`). The negative lookbehind
# excludes any digit immediately preceded by a letter or another digit
# that's still inside a letter-led run; the lookahead similarly avoids
# trailing letters. This lets us flag truly hallucinated financial
# figures while ignoring identifiers.
_NUMBER_REGEX = re.compile(r"(?<![A-Za-z\d])-?\d[\d,]*\.?\d*")


def _extract_numbers(text: str) -> set[str]:
    """Return every numeric token in `text` (e.g. "12,34,56,789" / "51.2" / "0.96"),
    normalised by stripping trailing zeros after decimals so 12.40 == 12.4."""
    out: set[str] = set()
    for m in _NUMBER_REGEX.findall(text):
        clean = m.rstrip(".").rstrip(",")
        if not clean or clean in {"-"}:
            continue
        # normalise decimal trailing zeros
        if "." in clean:
            clean = clean.rstrip("0").rstrip(".")
        if clean:
            out.add(clean)
    return out


def serialize_for_narrative(report: RiskReport) -> NarrativeInput:
    """Pure function — RiskReport → NarrativeInput. No I/O, no LLM."""
    # Sort signals by severity (CRITICAL > HIGH > MEDIUM > LOW) then by
    # score_contribution desc. Pick the top N for the prompt.
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    sorted_signals = sorted(
        report.evidence_chain,
        key=lambda s: (severity_order.get(s.severity.value, 99), -s.score_contribution),
    )
    chosen = sorted_signals[:_MAX_SIGNALS_IN_PROMPT]

    signals_payload = [
        {
            "module": s.module_name,
            "severity": s.severity.value,
            "score_contribution": round(s.score_contribution, 2),
            "evidence_string": s.evidence_string,
            "signal_type": s.signal_type,
        }
        for s in chosen
    ]

    top_modules = sorted(report.module_breakdown.items(), key=lambda kv: -kv[1])[:5]

    # Allowed-numbers — every number that appears in (a) the dual-output
    # headers, (b) the evidence strings we pass through, (c) module
    # breakdown values. Used by `numbers_outside_allowed()` to catch
    # hallucinations.
    allowed: set[str] = set()
    allowed |= _extract_numbers(f"{round(report.fraud_risk_score, 2)}")
    allowed.add(str(report.data_confidence))
    if report.p_fraud_calibrated is not None:
        allowed |= _extract_numbers(f"{round(report.p_fraud_calibrated, 4)}")
    if report.p_fraud_interval is not None:
        allowed |= _extract_numbers(
            f"{round(report.p_fraud_interval[0], 4)} {round(report.p_fraud_interval[1], 4)}"
        )
    for s in chosen:
        allowed |= _extract_numbers(s.evidence_string)
    for _, v in top_modules:
        allowed |= _extract_numbers(f"{round(v, 2)}")

    # Evidence hash — stable across runs of the same (cin, signals).
    # Used as the cache key + frontend ETag.
    hash_payload = json.dumps(
        {"cin": report.cin, "signals": signals_payload, "score": round(report.fraud_risk_score, 2)},
        sort_keys=True,
    )
    evidence_hash = hashlib.sha256(hash_payload.encode("utf-8")).hexdigest()[:16]

    return NarrativeInput(
        cin=report.cin,
        risk_band=report.risk_band,
        fraud_risk_score=report.fraud_risk_score,
        p_fraud_calibrated=report.p_fraud_calibrated,
        p_fraud_interval=report.p_fraud_interval,
        data_confidence=report.data_confidence,
        ensemble_disagreement_flag=report.ensemble_disagreement_flag,
        override_applied=report.override_applied,
        signals=signals_payload,
        top_modules=top_modules,
        allowed_numbers=allowed,
        evidence_hash=evidence_hash,
    )


def _is_structural_integer(token: str) -> bool:
    """1-2-digit positive integer with no decimal point — narrative prose
    routinely emits these as structural references ('11 modules',
    '17 patterns', '3 statements'), not financial figures. Decimals,
    longer integers, and anything with a comma stay subject to the
    allowed-numbers check."""
    if "." in token or "," in token or "-" in token:
        return False
    return token.isdigit() and 1 <= len(token) <= 2


def numbers_outside_allowed(text: str, allowed: set[str]) -> set[str]:
    """Return any numeric token in `text` that isn't in `allowed`.

    Tokens stripped before checking: identifier-embedded digits (CIN,
    GSTIN, DIN — excluded by the regex lookbehind) and 1-2-digit
    structural integers ('11 modules')."""
    found = _extract_numbers(text)
    return {n for n in found if n not in allowed and not _is_structural_integer(n)}


# ---------------------------------------------------------------------------
# Step 2 — Gemini client + 60/min cap + per-evidence cache.
# ---------------------------------------------------------------------------

_PROMPT_INSTRUCTIONS = """\
You are a forensic-audit narrator for the Sentinel-G platform.

INPUT: a JSON object describing the fraud-risk findings for one company,
including the calibrated probability, conformal interval, evidence
strings (already authored by Tier-1 rule modules), and the top-firing
modules.

YOUR JOB: write a 90-140 word executive summary in plain English that
a senior credit officer can read in 20 seconds. Lead with the risk band
and the calibrated probability. Reference 2-4 of the most severe
signals by their evidence-string content. Close with one sentence about
the data-confidence caveat.

HARD RULES:
1. Cite numbers ONLY from the JSON input. Do not invent figures, ratios,
   percentages, or amounts. If a number isn't in the input, don't use it.
2. Do not speculate about motive, intent, criminality, or guilt. Use
   forensic-audit language: "elevated risk", "indicators of", "consistent
   with", "requires human review".
3. Do not name auditors, directors, or banks. Reference patterns
   ("director overlap", "GST mismatch") not entities.
4. Output the summary only — no preamble, no markdown headings, no JSON.
"""


@dataclass
class NarrativeResult:
    summary: str
    model: str           # "gemini-1.5-flash" or "template-fallback"
    generated_at: str
    cached: bool
    evidence_hash: str


class _SlidingWindow:
    """A 60-second sliding window counter — same shape as the FastAPI
    rate-limit middleware but per-process for the API client side."""

    def __init__(self, limit: int, window_seconds: float):
        self._limit = limit
        self._window = window_seconds
        self._hits: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def try_acquire(self) -> bool:
        async with self._lock:
            now = time.monotonic()
            while self._hits and self._hits[0] < now - self._window:
                self._hits.popleft()
            if len(self._hits) >= self._limit:
                return False
            self._hits.append(now)
            return True


class GeminiNarrator:
    """Lazily-loaded Gemini Flash client. Falls back to template when:
       * `GEMINI_API_KEY` is missing / placeholder
       * the SDK fails to import
       * the rate-limit window is exhausted
       * any call raises
    """

    def __init__(self) -> None:
        self._window = _SlidingWindow(_RATE_LIMIT_PER_MIN, _WINDOW_SECONDS)
        self._cache: dict[str, NarrativeResult] = {}
        self._lru: deque[str] = deque()
        self._model: Any | None = None
        self._model_name: str = "template-fallback"
        self._init_lock = asyncio.Lock()
        self._init_attempted = False

    async def _ensure_model(self) -> Any | None:
        if self._init_attempted:
            return self._model
        async with self._init_lock:
            if self._init_attempted:
                return self._model
            self._init_attempted = True
            settings = get_settings()
            key = (settings.gemini_api_key or "").strip()
            if not key or key.startswith("PLACEHOLDER"):
                logger.info("Gemini narrator: no API key — template fallback only")
                return None
            try:
                import google.generativeai as genai  # noqa: WPS433 — lazy import
                genai.configure(api_key=key)
                self._model = genai.GenerativeModel(settings.gemini_model)
                self._model_name = settings.gemini_model
                logger.info("Gemini narrator: model %s ready", self._model_name)
            except Exception as exc:  # noqa: BLE001 — defensive
                logger.warning("Gemini narrator: SDK init failed (%s) — template fallback", exc)
                self._model = None
            return self._model

    def _cache_put(self, key: str, value: NarrativeResult) -> None:
        if key in self._cache:
            return
        self._cache[key] = value
        self._lru.append(key)
        while len(self._lru) > _CACHE_MAX_ENTRIES:
            oldest = self._lru.popleft()
            self._cache.pop(oldest, None)

    async def narrate(self, ni: NarrativeInput) -> NarrativeResult:
        cache_key = f"{ni.cin}:{ni.evidence_hash}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return NarrativeResult(
                summary=cached.summary,
                model=cached.model,
                generated_at=cached.generated_at,
                cached=True,
                evidence_hash=ni.evidence_hash,
            )

        model = await self._ensure_model()
        summary: str
        model_label: str

        if model is None:
            summary = _template_fallback(ni)
            model_label = "template-fallback"
        elif not await self._window.try_acquire():
            logger.info("Gemini narrator: rate-limited (60/min) — serving template")
            summary = _template_fallback(ni)
            model_label = "template-fallback (rate-limited)"
        else:
            try:
                prompt = _PROMPT_INSTRUCTIONS + "\n\nINPUT JSON:\n" + ni.to_prompt_json()
                # The SDK call is sync; offload so we don't block the loop.
                resp = await asyncio.to_thread(model.generate_content, prompt)
                summary = (getattr(resp, "text", "") or "").strip()
                if not summary:
                    raise RuntimeError("empty completion")
                # Hallucination guard — if the LLM cites a number we didn't
                # whitelist, drop the completion and fall through to template.
                bad = numbers_outside_allowed(summary, ni.allowed_numbers)
                if bad:
                    logger.warning(
                        "Gemini narrator: hallucinated numbers %r — falling back to template",
                        sorted(bad),
                    )
                    summary = _template_fallback(ni)
                    model_label = "template-fallback (hallucination-guard)"
                else:
                    model_label = self._model_name
            except Exception as exc:  # noqa: BLE001 — defensive
                logger.warning("Gemini narrator: call failed (%s) — template fallback", exc)
                summary = _template_fallback(ni)
                model_label = "template-fallback (api-error)"

        result = NarrativeResult(
            summary=summary,
            model=model_label,
            generated_at=datetime.now(timezone.utc).isoformat(),
            cached=False,
            evidence_hash=ni.evidence_hash,
        )
        self._cache_put(cache_key, result)
        return result

    def reset_for_tests(self) -> None:
        self._cache.clear()
        self._lru.clear()
        self._init_attempted = False
        self._model = None
        self._model_name = "template-fallback"

    async def status(self) -> dict[str, Any]:
        """Lightweight readiness probe — never calls the API. Reports
        whether the key is configured and whether the SDK initialised
        successfully. Triggers lazy init on first call so the second
        call returns a stable state."""
        settings = get_settings()
        key = (settings.gemini_api_key or "").strip()
        configured = bool(key) and not key.startswith("PLACEHOLDER")
        # Force init so subsequent calls report `live` accurately.
        await self._ensure_model()
        live = self._model is not None
        return {
            "configured": configured,
            "live": live,
            "model": self._model_name,
            "init_attempted": self._init_attempted,
            "cache_entries": len(self._cache),
        }


# ---------------------------------------------------------------------------
# Step 3 — deterministic template fallback. Never hallucinates by
# construction; cites only fields from the structured payload.
# ---------------------------------------------------------------------------

def _template_fallback(ni: NarrativeInput) -> str:
    """Compose narrative prose from the structured payload directly.

    Never reads any API; always succeeds. The output passes the
    `numbers_outside_allowed()` test because every number it emits is
    drawn from the NarrativeInput fields themselves.
    """
    band = ni.risk_band
    score = round(ni.fraud_risk_score, 2)
    parts: list[str] = []
    parts.append(
        f"Sentinel-G assigns a {band} risk band with composite score {score} to "
        f"{ni.cin}."
    )
    if ni.p_fraud_calibrated is not None:
        cal = round(ni.p_fraud_calibrated, 4)
        if ni.p_fraud_interval is not None:
            lo, hi = round(ni.p_fraud_interval[0], 4), round(ni.p_fraud_interval[1], 4)
            parts.append(
                f"The calibrated probability of fraud is {cal}, with a "
                f"conformal interval of [{lo}, {hi}]."
            )
        else:
            parts.append(f"The calibrated probability of fraud is {cal}.")
    # Evidence — quote the top 2-3 signal strings verbatim (they're already
    # authored by Tier-1 modules with exact numbers).
    if ni.signals:
        top = ni.signals[:3]
        parts.append("Primary indicators: " + " ".join(
            f"({s['severity']}) {s['evidence_string']}" for s in top
        ))
    if ni.override_applied:
        parts.append(
            "An override floor was applied — NCLT / wilful-defaulter "
            "evidence forces a minimum CRITICAL band regardless of the "
            "weighted module score."
        )
    if ni.ensemble_disagreement_flag:
        parts.append(
            "Two or more Tier-1 modules diverge by more than 30 score "
            "points — interpret as elevated model uncertainty, not "
            "consensus."
        )
    parts.append(
        f"Data-confidence is {ni.data_confidence} percent; treat this as a "
        f"forensic-audit lead, not a determination of fraud."
    )
    return " ".join(parts)


# Module-level singleton — narration state lives across requests inside
# the FastAPI worker process. Tests use `reset_for_tests()`.
_narrator = GeminiNarrator()


def get_narrator() -> GeminiNarrator:
    return _narrator
