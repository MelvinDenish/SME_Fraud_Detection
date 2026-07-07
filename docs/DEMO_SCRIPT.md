# Sentinel-G — Demo Video Script

> Live working demo. Every on-screen value is what the running system returns —
> locked by `backend/tests/test_day27_three_scenarios.py` and
> `backend/tests/test_day26_ilfs_manual_calc.py`.

**Recording target:** 1080p screen capture.
**Length:** 2:50 – 3:00. Hard cap at 3:00.

---

## Pre-flight (do before hitting record)

```powershell
# 1. Neo4j
docker compose -f infra/docker-compose.dev.yml up -d

# 2. Backend
.venv\Scripts\python.exe -m uvicorn backend.app.main:app --port 8000 --reload

# 3. Frontend
cd frontend; npm run dev       # opens at :5173

# 4. Seed Neo4j from scratch (--clean wipes stale nodes first)
.venv\Scripts\python.exe scripts/seed_neo4j.py --clean

# 5. Seed demo users (idempotent)
.venv\Scripts\python.exe scripts/seed_users.py
```

Log in as `rajan@demo.in` / `Sentinel@1` (investigator — unlocks PDF export).
Clear browser localStorage once so no stale JWT is visible.

---

## 0:00 – 0:20 · Company Search

> "Sentinel-G detects financial fraud across SME loans, GST input-tax-credit
> carousels, and bank-loan evergreening — all running live, no mocked data.
> We start with IL&FS — SFIO-confirmed, ₹91,000 crore exposure.
> CIN: U45201MH2005PTC155294."

**On-screen:** `/search`. Paste the IL&FS CIN, hit Enter.
**Expected API:** `GET /analyse/U45201MH2005PTC155294` — responds in ≤ 50 ms.

---

## 0:20 – 0:55 · Analysis Dashboard

> "Score 75, CRITICAL band, Data Quality 92%. The calibrated fraud probability
> and 90% conformal interval are live — from the LightGBM meta-learner trained
> on SFIO-labelled cases.
> The industry label reads 'Construction (NIC 45201)' — no raw NIC codes for
> judges to decode.
> The green source badge confirms: SFIO · NCLT · RBI — public court record.
> 18 fraud signals, each citing specific rupee amounts. No LLM-generated numbers."

**On-screen:** Dashboard for IL&FS. Point to each in turn:
- Score 75.0 · CRITICAL band stamp
- `p_fraud_calibrated` + `[lo%, hi%]` conformal interval in the aside
- Company metadata row: **Construction (NIC 45201)** · State MH · Est. 2005
- Green source badge: "SFIO · NCLT · RBI — public court record"
- Severity filter chips: `● 3 CRITICAL  ● 7 HIGH  ● 5 MEDIUM  ● 3 LOW`
- Click **● CRITICAL** chip → evidence chain filters to 3 critical signals only
- Click **✕ show all** to restore the full chain

---

## 0:55 – 1:20 · Graph Explorer

> "Each director node is a real person from the MCA registry. Red edges are
> flagged TRANSACTS_WITH. TRIGGERED_BY edges trace every signal back to the
> exact FinancialStatement and Charge rows that caused it.
> Graph-native explainability — no SHAP, no black box."

**On-screen:** `/graph/U45201MH2005PTC155294`.
Click a director node → highlight all their other companies.
Hover a signal node → inspector shows the exact `evidence_string`.

---

## 1:20 – 1:45 · Evidence Provenance

> "Each module label in the evidence chain has a dotted underline — hover it
> to see the full methodology. 'Earnings Manipulation Check' is eight Beneish
> accrual ratios; hover reveals every formula used.
> 'Revenue per P&L ₹9,240 cr exceeds GST taxable turnover ₹820 cr by 51%.'
> That number is verifiable against IL&FS's filed AOC-4."

**On-screen:** Scroll the evidence chain. Hover the module name eyebrow on a
signal card — tooltip shows the full methodology.
Expand "Source records" for a CRITICAL signal to show `triggered_by` provenance.

---

## 1:45 – 2:05 · ITC Carousel

> "Switching fraud type. Three SME shells form a closed GST input-tax-credit
> carousel — modelled on a real DGGI Mumbai 2022 case, company names redacted
> per active-investigation protocol.
> The ring diagram at the top shows the A → B → C → A money loop with ₹512 cr
> at the centre."

**On-screen:** `/itc`.
- Point to the **ring SVG diagram** first: A (Issuer) → B (Recipient) → C (Conduit) → A, ₹512 cr label at centre
- Three carousel cards below, all CRITICAL band
- Amber badge: "DGGI Mumbai · company names redacted"

---

## 2:05 – 2:25 · Evergreening (DHFL)

> "DHFL — three independent loan evergreening patterns fire simultaneously.
> Round-trip repayment overlap, short-cycle charges within 150 days, SPV shell
> routing. Exposure ₹14,000 cr matches the SFIO charge sheet.
> The grey badge confirms SFIO-pattern demonstration on real financial structure."

**On-screen:** `/evergreening`.
- Grey badge: "SFIO / RBI public-record pattern - graph fixture active"
- Show the 4-column metrics grid (score, override, confidence, signals)
- Scroll the evidence list

---

## 2:25 – 3:00 · Report Export

> "One click exports the full dossier as a signed PDF. UUID, UTC timestamp,
> complete evidence chain, conformal interval, disclaimer citing MCA21 and NCLT.
> Auth-gated to investigator and auditor roles — Priya the credit officer gets 403."

**On-screen:** `/reports` → CIN field → `U45201MH2005PTC155294` → **Download PDF**.
Save dialog opens. Open the PDF on second monitor.
Point to: cover page with `Report ID: <UUID>`, `Generated: <UTC ISO>`, disclaimer,
truncated evidence chain.

---

## Numbers locked in CI

| Company        | CIN                       | Score | Band     | DC | Signals |
|----------------|---------------------------|------:|----------|---:|--------:|
| IL&FS          | U45201MH2005PTC155294     | 75.0  | CRITICAL | 92 | 18      |
| Amtek Auto     | U27101MH2010PTC215432     | 75.0  | CRITICAL | 80 | 11      |
| ITC carousel A | U27109MH2018PTC312456     | 75.0  | CRITICAL | 65 | 3       |
| ITC carousel B | U46101MH2017PTC289123     | 75.0  | CRITICAL | 65 | 4       |
| ITC carousel C | U46190MH2019PTC295432     | 75.0  | CRITICAL | 65 | 3       |

Additional SFIO fraud cases in the seed corpus (all resolve CRITICAL via NCLT override):

| Company          | CIN                       |
|------------------|---------------------------|
| Bhushan Steel    | L45200GJ1988PLC011533     |
| Jet Airways      | L99999MH1992PLC066213     |
| Kingfisher       | L74110WB1933PLC008002     |
| Lanco Infratech  | L45203AP1993PLC014991     |
| Videocon         | L22219MH1985PLC036572     |
| HDIL             | L21300MH1996PLC102369     |
| Gitanjali Gems   | L99999GJ1995PLC026167     |
| Sterling Biotech | U24232GJ1995PLC025935     |
| RCom             | L23209UP1989PLC020525     |
| Solar (Nirav Modi)| U99999MH1996PLC163336    |
| ABG Shipyard     | U74899DL2001PTC108944     |

Clean non-fraud controls (LOW band, no overrides):

| Company       | CIN                       |
|---------------|---------------------------|
| Infosys       | L85110KA1981PLC013115     |
| Marico        | L15140MH1988PLC049208     |
| Asian Paints  | L24201MH1945PLC004598     |
| Titan         | L74999TN1984PLC010444     |
| Page Industries| L18101KA1994PLC016910    |

---

## After recording

- Trim head/tail to ≤ 3:00.
- Export H.264 1080p, ≤ 50 MB for Devfolio submission.
