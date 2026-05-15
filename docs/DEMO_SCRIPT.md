# Sentinel-G — 3-Minute Demo Storyboard

> PRD §10 Day 28 fallback recording. Read this verbatim into OBS/Loom. Every
> on-screen value below is what the live system returns today (locked in CI
> by `backend/tests/test_day27_three_scenarios.py` and
> `backend/tests/test_day26_ilfs_manual_calc.py`).

**Recording target:** 1080p screen capture, 2× monitor recommended (browser + terminal).
**Length:** 2:50–3:00 total. Hard cap at 3:00.
**Pre-flight:**
1. `docker compose -f infra/docker-compose.dev.yml up -d` (Neo4j + GDS)
2. `./.venv/Scripts/python.exe scripts/seed_neo4j.py --clean` (≤ 60 s)
3. `./.venv/Scripts/python.exe -m uvicorn backend.app.main:app --port 8000`
4. `cd frontend && npm run dev` (Vite at :5173)
5. Visit `/login` once — JWT is cached in localStorage for the demo session.

---

## 0:00 – 0:20 · Company Search

> "Sentinel-G detects financial fraud across SME loans, GST input-tax-credit
> carousels, and bank-loan evergreening. We start with the IL&FS case —
> SFIO-confirmed, ₹91,000 cr exposure. CIN U45201MH2005PTC155294."

**On-screen:** Search page. Paste IL&FS CIN, hit Enter.
**API hit:** `GET /analyse/U45201MH2005PTC155294` (≤ 50 ms)

## 0:20 – 0:50 · Analysis Dashboard

> "Score 75, CRITICAL band, DataConfidence 92. The calibrated P(fraud) and
> conformal 90% interval are both present — PRD §7.1's dual-output. Note the
> 18 FraudSignal nodes with specific-numbers evidence — no LLM-generated
> numbers anywhere."

**On-screen:** Dashboard for IL&FS.
- Score: 75.0 (CRITICAL)
- DataConfidence: 92%
- p_fraud_calibrated + p_fraud_interval visible
- Evidence list shows BENEISH_M_SCORE_BREACH, CROSS_STMT_CWIP_STALE, NCLT_PROCEEDING_MATCH, WILFUL_DEFAULTER_MATCH

## 0:50 – 1:15 · Graph Explorer

> "Click any director — chain expands. Red edges are flagged TRANSACTS_WITH.
> The CRITICAL evidence chain wires back through TRIGGERED_BY edges to the
> specific FinancialStatement and Charge rows. This is graph-native
> explainability — no SHAP needed."

**On-screen:** `/graph/U45201MH2005PTC155294`
**API hit:** `GET /analyse/U45201MH2005PTC155294/provenance` (18 signals + TRIGGERED_BY)

## 1:15 – 1:40 · Evidence Provenance

> "Each FraudSignal cites exact rupees. 'Revenue per P&L ₹9,240 cr exceeds GST
> taxable turnover ₹820 cr by 51%.' 'Beneish M-Score -1.27, above the -1.78
> manipulation threshold.' Every number is verifiable against IL&FS's filed
> AOC-4."

**On-screen:** Provenance panel expanded on a single CRITICAL signal.

## 1:40 – 2:00 · ITC Carousel View

> "Switching fraud types. Three SME shells flagged by PNB, Canara, and IOB as
> wilful defaulters. The seven-node synthetic CLAIMS_ITC_FROM ring sits behind
> them — a closed cycle returns to seed, with G4 a missing-trader AND a
> cancelled GSTIN. All five ITC patterns 8 through 12 fire."

**On-screen:** `/itc` page. Three carousel cards all CRITICAL; ring graph below.

## 2:00 – 2:20 · Evergreening View

> "DHFL — patterns 13, 14, and 15 fire simultaneously. Round-trip repayment
> with 98% amount overlap, three short-cycle bank charges within 150 days,
> two SPV shells routing the funds. Total exposure ₹14,000 cr matches the
> SFIO charge sheet."

**On-screen:** `/evergreening` page. Three patterns lit up, FUNDED_REPAYMENT_OF
edges visible.

## 2:20 – 3:00 · Report Export

> "One click — PDF report. UUID, timestamp, full evidence chain, conformal
> interval, disclaimer. Auth-gated, rate-limited. CORS-locked. Same payload
> we just walked through, signed and exportable for the audit trail."

**On-screen:** `/reports` → click "Download PDF". Save dialog opens.
**API hit:** `GET /report/U45201MH2005PTC155294` returns PDF + `X-Report-Id`
+ `X-Report-Generated-At` headers.

---

## Numbers locked in CI (do not fudge)

| Scenario       | Score | Band      | DC | Signals |
|----------------|------:|-----------|---:|--------:|
| IL&FS          | 75.0  | CRITICAL  | 92 | 18      |
| Amtek Auto     | 75.0  | CRITICAL  | 80 | 11      |
| ITC carousel A | 75.0  | CRITICAL  | 65 | 3       |
| ITC carousel B | 75.0  | CRITICAL  | 65 | 4       |
| ITC carousel C | 75.0  | CRITICAL  | 65 | 3       |

## Recovery cues

- If `/analyse` returns 404, re-run `scripts/seed_neo4j.py --clean`.
- If the dev server crashes mid-demo, the test-suite-locked fallback is
  `pytest backend/tests/test_day27_three_scenarios.py -v` — proves all three
  scenarios still pass from a cold checkout.
- If the PDF download silently fails, check the JWT in localStorage and
  re-login at `/login`.

## After recording

- Trim head/tail to ≤ 3:00.
- Export H.264 1080p, ≤ 50 MB so it embeds in the Devfolio submission.
- Drop the final MP4 at `docs/demo_fallback.mp4` (gitignored — too big for
  the repo, hosted on Drive/YouTube unlisted for the judges).
