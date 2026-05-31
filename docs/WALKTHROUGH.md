# Sentinel-G — Persona Walkthrough Guide

> A scripted end-to-end tour of every feature available to every role.
> Use this to verify the running app the way a fraud-desk team would
> actually use it — and to spot any feature you've shipped but never
> manually tested.

If you've never run the app before, finish `docs/RUNNING.md` first
(Neo4j + uvicorn + Vite all up). Then come back here.

---

## Section 0 — One-time setup

### 0.1 Seed the demo users

```powershell
.venv\Scripts\python.exe scripts/seed_users.py
```

Idempotent. Creates four `:User` nodes in Neo4j, one per role. If you've
run it before it just prints `Skipped … (already exists)` and moves on.

### 0.2 (Optional) Seed the Tamil Nadu universe

If you want `/search` to find real Indian SMEs (not just the curated
demo CINs), drop `TN_Companies_Master_Data.csv` (or any data.gov.in MCA
master CSV) into `data/raw/data_gov_in/` and run:

```powershell
.venv\Scripts\python.exe scripts/seed_data_gov_in.py --limit 200000
```

That seeds ~191,531 TN-registered companies as `:Company` master nodes.
See `docs/INGEST_DATA_GOV_IN.md` for the operator runbook.

### 0.3 Credentials

All four demo users share the password `Sentinel@1`.

| Email             | Password    | Role           | Persona                                        |
|-------------------|-------------|----------------|------------------------------------------------|
| `priya@demo.in`   | `Sentinel@1`| credit_officer | Priya Sharma — SBI Loan Officer                |
| `rajan@demo.in`   | `Sentinel@1`| investigator   | Rajan Mehta — DGGI (GST Intelligence) Inspector|
| `deepa@demo.in`   | `Sentinel@1`| auditor        | Deepa Krishnan — NCLT Resolution Professional  |
| `amir@demo.in`    | `Sentinel@1`| admin          | Amir Khan — Compliance & Platform Admin        |

> **Reset note**: passwords are bcrypt-hashed in Neo4j. To rotate, edit
> `scripts/seed_users.py` and re-run; for one-off password changes,
> drop the `:User` node and re-seed.

### 0.4 Test CINs you'll use throughout this guide

| CIN                       | Company             | Expected band | Why it's interesting                          |
|---------------------------|---------------------|---------------|-----------------------------------------------|
| `U45201MH2005PTC155294`   | IL&FS               | CRITICAL      | SFIO-confirmed fraud; 18-signal evidence chain|
| `L65910MH1984PLC032662`   | DHFL                | CRITICAL      | Evergreening — patterns 13/14/15 fire together|
| `U27101MH2010PTC215432`   | Amtek Auto          | HIGH/CRITICAL | NCLT proceeding + wilful defaulter match      |
| `U29304MH2019PTC287654`   | HIJ Auto (synthetic)| HIGH          | Synthetic shell, demonstrates M10 hypergraph  |
| `U14101MH2019PTC298765`   | XYZ Garments        | LOW           | Clean control — no signals fire               |
| `U10719TN2026PTC192803`   | Cherry Gourmet      | LOW           | Real TN bulk record; honest `data_confidence=25`|

---

## Section 1 — Priya, SBI Credit Officer (`credit_officer`)

**Scenario:** A loan application lands on Priya's desk for a Tamil Nadu
SME. She has 10 minutes to decide if it goes to her senior with a
"proceed" or "stop" stamp. She's the **first line of defence**.

### 1.1 Log in

1. Navigate to `http://localhost:5173/login`
2. Email `priya@demo.in`, password `Sentinel@1`
3. **Expect:** redirect to `/search`. Top-nav shows her email + a
   "Log out" button. The Reports link is visible (clicking it triggers
   a 403 — see §1.6 below).

### 1.2 Quick screen on a known-bad CIN

1. On the Search page, paste `U45201MH2005PTC155294` (IL&FS) into the
   CIN field and press Enter.
2. **Expect:** route to `/dashboard?cin=U45201MH2005PTC155294`.
   - Risk band: **CRITICAL** (red)
   - `fraud_risk_score`: ~75
   - `data_confidence`: ~92
   - Evidence chain ≥ 10 `FraudSignal` rows, each citing **specific
     numbers** (₹ amounts, ratios). No generic prose.
   - Module breakdown shows non-zero contributions from M01 Beneish,
     M02 Cross-Statement, M09 NCLT/Wilful.

### 1.3 Inspect the evidence graph

1. Click the **Graph** tab in the nav, or navigate to
   `/graph/U45201MH2005PTC155294`.
2. **Expect:** D3 force-layout with the IL&FS node at centre, director
   nodes orbiting, shared-director edges to related companies.
   Labels render only after the simulation settles
   (`sim.alpha() < 0.05`).
3. Hover any FraudSignal node to see its `TRIGGERED_BY` provenance.

### 1.4 GST carousel screen on a synthetic ring

1. Navigate to `/itc`.
2. **Expect:** the 7-node ITC Carousel ring with the multi-period
   14-edge variant — synthetic data, but the page demonstrates how
   M04 graph pattern P08 fires on directed-cycle topology.
3. Each node card lists the supplier→buyer chain, claimed ITC vs taxable
   turnover, and the missing-trader flag where applicable.

### 1.5 Evergreening view (DHFL)

1. Navigate to `/evergreening`.
2. **Expect:** DHFL's evergreening cluster — patterns 13/14/15 fire
   simultaneously. Visualises the loan-disbursement → loan-repayment
   → next-loan circular money-flow.

### 1.6 Honest TN bulk lookup (real public registry, low confidence)

1. Back to `/search`. Scroll to the **Tamil Nadu · live MCA registry**
   panel — these are real companies seeded from data.gov.in.
2. Click any row (e.g. Cherry Gourmet Private Limited).
3. **Expect:** `/dashboard?cin=U10719TN2026PTC192803`.
   - Risk band: **LOW** (no flags fired)
   - `fraud_risk_score`: 0.0
   - `data_confidence`: 25 — **honestly low**, because we only have a
     master record (no financials, no directors). The dashboard
     surfaces this so Priya knows the score is provisional, not a
     clean bill of health.
   - Skipped modules list shows reasons like `"No financials"` and
     `"Need 2+ consecutive FS years"`.

### 1.7 Upload to enrich a thin file (Priya CAN upload)

1. Navigate to `/upload`.
2. **Expect:** upload form. As `credit_officer`, Priya CAN POST to
   `/upload/financials`, `/upload/gst`, `/upload/bank`. The form lets
   her enrich a CIN's bundle with extra financials before re-running
   analysis.
3. Drop a PDF financial statement (sample at
   `data/synthetic_pdfs/sample_aoc4.pdf` if one exists, else use any
   AOC-4 you have access to).
4. **Expect:** upload preview card showing parsed rows, then "Accepted".
5. Re-run `/dashboard?cin=<that CIN>` — `data_confidence` should now
   be visibly higher and previously-skipped modules now contribute
   scores.

### 1.8 What Priya CAN'T do

1. Click **Reports** in the nav (or navigate directly to `/reports`,
   then try the Download PDF button).
2. **Expect:** the backend returns
   `HTTP 403 — Role 'credit_officer' is not authorised for this endpoint. Required one of: ['admin', 'auditor', 'investigator']`.
   The Reports page renders this error inline (it does NOT crash or
   bounce her back to login).

### 1.9 Logout

Click **Log out** in the nav. Token cleared from localStorage. Land
back on `/login`.

### Priya's verification checklist

- [ ] Login as `priya@demo.in` works
- [ ] `/search` reachable; CIN input + Analyse button work
- [ ] TN bulk panel renders (if Section 0.2 was run)
- [ ] `/dashboard` resolves IL&FS to CRITICAL with full evidence chain
- [ ] `/dashboard` resolves a TN CIN with honest `data_confidence=25`
- [ ] `/graph` D3 force layout renders without label overlap
- [ ] `/itc` shows the carousel ring
- [ ] `/evergreening` shows DHFL patterns
- [ ] `/upload` accepts a PDF and reflects the overlay in next `/analyse`
- [ ] `/reports` returns 403 with the role-mismatch detail string

---

## Section 2 — Rajan, DGGI Inspector (`investigator`)

**Scenario:** Rajan investigates GST input-tax-credit carousels for the
Directorate General of GST Intelligence. He has the broadest access in
the app — upload, analyse, report. A whistleblower has tipped him off
about a Mumbai-based ring, and he has 30 minutes to compile evidence
before a 4 PM raid briefing.

### 2.1 Log in

1. Log out from Priya's session if you're still in it.
2. Login as `rajan@demo.in` / `Sentinel@1`.
3. **Expect:** `/search`. The Reports link is now functional.

### 2.2 Start with the GST carousel page

1. Navigate to `/itc`.
2. **Expect:** the 7-node ring with all 14 directed edges (two periods
   per supplier-buyer pair). The evidence card for each node shows:
   - GSTIN with state code + PAN segment
   - `is_cancelled` flag (some nodes are cancelled within 18 months —
     classic missing-trader signature)
   - Claimed ITC vs taxable turnover ratio (any > 1.5 fires P10
     missing-trader, > 2.0 fires CRITICAL)

### 2.3 Multi-hop director graph

1. Navigate to `/graph?cin=U45201MH2005PTC155294`.
2. Use the depth selector (default 3, max 5) to fan out the director
   chain.
3. **Expect:** at depth 3, you'll see ~15-25 connected `:Company` nodes
   via `IS_DIRECTOR_OF` edges. Shared-director cliques show as denser
   sub-graphs.
4. Click any director node to highlight all companies they're attached
   to.

### 2.4 Upload supplementary evidence

1. Navigate to `/upload`.
2. **Expect:** as `investigator`, Rajan CAN upload. The form accepts:
   - `POST /upload/financials/{cin}` (PDF)
   - `POST /upload/gst/{cin}` (JSON payload)
   - `POST /upload/bank/{cin}` (credits_total scalar)
3. Try uploading a GST payload:
   ```json
   { "gstin": "27ABCDE1234F1Z5", "aggregate_turnover": 22000000,
     "tax_paid_ytd": 180000 }
   ```
4. **Expect:** 200 OK with `{"cin": "...", "accepted": true, ...}`.
5. The next `/analyse/{cin}` call folds this overlay onto the bundle
   — M02 cross-statement and M04 graph patterns get more signal.

### 2.5 Export the evidence dossier

1. Navigate to `/reports`.
2. **Expect:** the Reports page renders for Rajan (vs. 403 for Priya).
3. In the CIN field type `U45201MH2005PTC155294` (IL&FS) and click
   **Download PDF**.
4. **Expect:** a `.pdf` saved to your Downloads folder named
   `sentinel-g-U45201MH2005PTC155294-<8-char-uuid>.pdf`.
5. Open the PDF — verify it has:
   - Cover page with `Report ID: <UUID v4>` and `Generated: <UTC ISO timestamp>`
   - Disclaimer paragraph naming MCA21, CERSAI, NCLT as inputs
   - Truncated evidence chain (top-N FraudSignals by `score_contribution`)
   - The first/last pages match what `/reports` showed in the
     "Recently exported" table
6. The exported row appears in the "Recently exported" table at the
   bottom of `/reports`.

### 2.6 Test the four other DEMO_CINS

Generate reports for the rest of the curated set so the Recently
Exported table has a full row of evidence:

```
L65910MH1984PLC032662   DHFL
U27101MH2010PTC215432   Amtek Auto
U29304MH2019PTC287654   HIJ Auto
U14101MH2019PTC298765   XYZ Garments (clean control — score 0.0)
```

### 2.7 Narrative endpoint smoke test

1. Open browser DevTools → Network tab.
2. From the Dashboard page on any CIN, the page should auto-fire a
   GET to `/narrative/{cin}`.
3. **Expect:** 200 OK with a `summary` string. In dev (no
   `GEMINI_API_KEY`), the summary is template-rendered from the
   evidence chain — still grounded in real numbers, no LLM-generated
   data.

### Rajan's verification checklist

- [ ] Login as `rajan@demo.in` works
- [ ] All Priya checks pass for Rajan too
- [ ] `/upload/financials` POST succeeds (HTTP 200, accepted: true)
- [ ] `/upload/gst` POST succeeds with overlay applied on next `/analyse`
- [ ] `/upload/bank` POST succeeds
- [ ] `/reports` Download PDF works for all 5 demo CINs
- [ ] PDF has UUID + UTC timestamp + disclaimer
- [ ] Recently Exported table records each download with sortable columns
- [ ] `/narrative` returns a non-empty summary

---

## Section 3 — Deepa, NCLT Resolution Professional (`auditor`)

**Scenario:** Deepa is the court-appointed RP on a CIRP case for DHFL.
She's preparing the information memorandum for the Committee of
Creditors meeting tomorrow. She needs the audit trail, the exported
PDF dossier, and the evidence chain — but she does NOT need (and
should NOT have) write access. She's read-only over uploads.

### 3.1 Log in

1. Logout, then login as `deepa@demo.in` / `Sentinel@1`.

### 3.2 DHFL evergreening review

1. Navigate to `/evergreening`.
2. **Expect:** DHFL's evergreening cluster — pattern 13 (loan
   round-tripping), pattern 14 (overlapping disbursement-repayment
   timestamps), pattern 15 (related-party intermediary) all fire.
3. Hover the timeline view to see the date sequence — disbursements
   from Bank A funding repayments to Bank B within ≤ 7 days.

### 3.3 Confirm the dual-output payload

1. Navigate to `/dashboard?cin=L65910MH1984PLC032662`.
2. **Expect:**
   - Band: CRITICAL
   - `fraud_risk_score`: ~78
   - `p_fraud_calibrated`: a real number (the meta-learner is wired)
   - `p_fraud_interval`: a 90% conformal interval, e.g. `[0.74, 0.95]`
   - `data_confidence`: 88-92
   - `override_applied: true` (CRITICAL flags force floor of 60 per
     PRD §7.3)

### 3.4 Export the audit-ready dossier

1. Navigate to `/reports`.
2. **Expect:** Reports page renders (Deepa has the `auditor` role).
3. Download DHFL's PDF.
4. **Expect:** same PDF format as in §2.5 — UUID + timestamp +
   disclaimer + truncated evidence chain.

### 3.5 Provenance traversal (for the IM)

1. Open DevTools, navigate to `/dashboard?cin=L65910MH1984PLC032662`.
2. Watch the network tab — there's a request to
   `GET /analyse/{cin}/provenance`.
3. **Expect:** 200 OK with JSON body shaped:
   ```json
   { "cin": "L65910MH1984PLC032662",
     "signal_count": 12,
     "signals": [ ... ],
     "triggered_by": [
       { "signal_id": "...", "label": "FinancialStatement", "ref": {...} },
       ...
     ]
   }
   ```
4. This is the audit-trail data Deepa cites in her IM.

### 3.6 What Deepa CAN'T do

1. Navigate to `/upload`.
2. **Expect:** the page may render the form, but submitting any of the
   upload endpoints returns:
   `HTTP 403 — Role 'auditor' is not authorised for this endpoint. Required one of: ['admin', 'credit_officer', 'investigator']`.
3. This protects the evidence chain — auditors observe, they don't
   inject.

### Deepa's verification checklist

- [ ] Login as `deepa@demo.in` works
- [ ] `/evergreening` shows DHFL patterns 13/14/15
- [ ] `/dashboard` shows `override_applied: true` for DHFL
- [ ] `p_fraud_calibrated` and `p_fraud_interval` populate (not null)
- [ ] `/reports` Download PDF works
- [ ] `/provenance` returns signal_count > 0 with `triggered_by` chain
- [ ] `/upload/financials` POST returns 403 with role-mismatch detail
- [ ] `/upload/gst` and `/upload/bank` also return 403

---

## Section 4 — Amir, Compliance & Platform Admin (`admin`)

**Scenario:** Amir owns the platform. He has full access to every
endpoint. His weekly job is to (a) verify the system is healthy,
(b) spot-check a sample of overrides for false positives, (c) review
new user registrations and assign roles.

### 4.1 Log in

1. Logout, then login as `amir@demo.in` / `Sentinel@1`.

### 4.2 Health checks (no auth needed, but useful in admin's loop)

Open three browser tabs:

1. `http://localhost:8000/health` → `{"status":"ok","version":"0.1.0","env":"dev"}`
2. `http://localhost:8000/health/ml` → meta-learner artifact status + analytics_cache status. `ok: true` means F1a/F1b/F1c are loaded.
3. `http://localhost:8000/health/neo4j` → `{"neo4j_reachable": true, "gds_version": "2.x.x"}`. If GDS plugin is missing, this surfaces it.

### 4.3 Full report sweep

1. Navigate to `/reports`.
2. Generate reports for all 5 DEMO_CINS plus any TN CIN you've seeded.
3. **Expect:** all 6 download successfully.

### 4.4 Override audit

1. Navigate to `/dashboard?cin=U45201MH2005PTC155294`.
2. Open the network tab → `GET /analyse/U45201MH2005PTC155294`.
3. **Expect** in the response body:
   - `override_applied: true`
   - `override_matched_signal_ids: ["NCLT_PROCEEDING_MATCH", "WILFUL_DEFAULTER_MATCH", ...]`
   - `fraud_risk_score` is ≥ 60 (CRITICAL floor) or ≥ 75 (NCLT/WD floor)
4. Cross-reference the matched signal IDs with the evidence chain — every override should be backed by a `FraudSignal` node with provenance.

### 4.5 Companies directory

1. Browser tab → `http://localhost:8000/companies?state=TN&limit=50` (with Amir's JWT in the `Authorization: Bearer ...` header — easiest via DevTools "Copy as fetch" on a frontend request).
2. **Expect:** `{"total": <number>, "items": [{"cin": "...", "name": "...", "state": "TN", "incorporation_year": ...}, ...]}`. After running §0.2, `total` should be 191,531.

### 4.6 User management (no UI yet — direct Cypher)

```powershell
docker exec sentinel-g-neo4j cypher-shell -u neo4j -p sentinel_dev_pwd `
  "MATCH (u:User) RETURN u.email, u.role, u.is_active ORDER BY u.email"
```

**Expect:** the 4 demo users plus any you've registered through the UI.
To promote a self-registered user to admin:

```powershell
docker exec sentinel-g-neo4j cypher-shell -u neo4j -p sentinel_dev_pwd `
  "MATCH (u:User {email: 'someone@example.com'}) SET u.role = 'admin' RETURN u.email, u.role"
```

> The user must log out and log back in for the new role claim to land
> in their JWT.

### 4.7 What's gated by `admin` only

In the current code there's no admin-only endpoint — `admin` is a
superset of (auditor ∪ investigator ∪ credit_officer). The reason
`admin` exists as a distinct role is forward-compatibility for the
user-management UI on the roadmap.

### Amir's verification checklist

- [ ] Login as `amir@demo.in` works
- [ ] `/health`, `/health/ml`, `/health/neo4j` all return 200
- [ ] All 5 DEMO_CIN reports download
- [ ] `override_applied: true` for IL&FS + DHFL; `false` for XYZ Garments
- [ ] `/companies?state=TN` returns rows (count depends on whether §0.2 ran)
- [ ] cypher-shell can query and update `:User` nodes
- [ ] No 403 errors anywhere — admin has full access

---

## Section 5 — External evaluator / judge walkthrough (5 minutes)

For a hackathon judge or external reviewer who wants to see every
feature in one continuous path. Stays under 5 minutes.

| Time | Action | Why it matters |
|------|--------|----------------|
| 0:00 – 0:20 | Login as `priya@demo.in`; search `U45201MH2005PTC155294` | First impression — search → CRITICAL band in < 1 sec |
| 0:20 – 0:50 | On the Dashboard, point out: band, score, calibrated P(fraud) + conformal interval, DataConfidence | PRD §7.1 dual-output is live, not stubbed |
| 0:50 – 1:15 | Click Graph tab, expand to depth 3 | Graph-native evidence — directors, NCLT proceedings, wilful defaulter flags as edges |
| 1:15 – 1:40 | Hover any FraudSignal → show TRIGGERED_BY chain | Every flag has provenance to source numbers — no LLM guesses |
| 1:40 – 2:10 | Switch to /itc, point to the 7-node carousel | Graph patterns P08/P10/P11/P12 firing on synthetic ring |
| 2:10 – 2:30 | Switch to /evergreening, show DHFL patterns 13/14/15 | Three independent patterns confirming the same fraud type |
| 2:30 – 2:50 | Logout, login as `rajan@demo.in`; navigate to `/reports`; download IL&FS PDF | Investigator role unlocks report export — PDF has UUID + UTC + disclaimer |
| 2:50 – 3:10 | Open the PDF, point out UUID + truncated evidence chain | Audit trail is real, court-admissible format |
| 3:10 – 3:40 | Back to /upload; upload a synthetic financial PDF | Live overlay — uploaded data folds into the next /analyse |
| 3:40 – 4:00 | Re-run /dashboard on the same CIN; show data_confidence increased | Upload pipeline works end-to-end |
| 4:00 – 4:30 | Logout, login as `deepa@demo.in`; show 403 on /upload | RBAC actually enforces — auditors can read, not write |
| 4:30 – 5:00 | Logout, login as `amir@demo.in`; visit /health/neo4j showing GDS version | Platform health surface for admin oversight |

---

## Section 6 — Feature × role matrix

Verified against `require_roles()` decorators in
[`backend/app/api/upload.py:34`](../backend/app/api/upload.py#L34)
(`credit_officer, investigator, admin`) and
[`backend/app/api/report.py:181`](../backend/app/api/report.py#L181)
(`auditor, investigator, admin`).

| Feature                        | Endpoint                              | Priya (credit_officer) | Rajan (investigator) | Deepa (auditor) | Amir (admin) |
|--------------------------------|---------------------------------------|------------------------|----------------------|-----------------|--------------|
| Login                          | `POST /auth/login`                    | ✅                     | ✅                   | ✅              | ✅           |
| Search page                    | (frontend route)                      | ✅                     | ✅                   | ✅              | ✅           |
| Analyse CIN                    | `GET /analyse/{cin}`                  | ✅                     | ✅                   | ✅              | ✅           |
| Provenance traversal           | `GET /analyse/{cin}/provenance`       | ✅                     | ✅                   | ✅              | ✅           |
| Narrative summary              | `GET /narrative/{cin}`                | ✅                     | ✅                   | ✅              | ✅           |
| Companies directory            | `GET /companies?state=...`            | ✅                     | ✅                   | ✅              | ✅           |
| Upload preview                 | `GET /upload/{cin}/preview`           | ✅                     | ✅                   | ❌ 403          | ✅           |
| Upload financials PDF          | `POST /upload/financials/{cin}`       | ✅                     | ✅                   | ❌ 403          | ✅           |
| Upload GST payload             | `POST /upload/gst/{cin}`              | ✅                     | ✅                   | ❌ 403          | ✅           |
| Upload bank credits            | `POST /upload/bank/{cin}`             | ✅                     | ✅                   | ❌ 403          | ✅           |
| Export report PDF              | `GET /report/{cin}`                   | ❌ 403                 | ✅                   | ✅              | ✅           |
| Health: app                    | `GET /health`                         | ✅ (no auth)           | ✅                   | ✅              | ✅           |
| Health: ML stack               | `GET /health/ml`                      | ✅ (no auth)           | ✅                   | ✅              | ✅           |
| Health: Neo4j + GDS            | `GET /health/neo4j`                   | ✅ (no auth)           | ✅                   | ✅              | ✅           |

**403 expectations:** every cell marked `❌ 403` returns the response
body `{"detail": "Role '<role>' is not authorised for this endpoint. Required one of: [...]"}`.
Not 401, not 500. If you see a different code, something's regressed.

---

## Section 7 — What's NOT covered by this walkthrough

These are real features but require external state that can't be set
up automatically:

- **Live MCA Public Portal scraping** — requires running
  `python -m backend.app.ingest.mca_public_playwright --bootstrap`
  to bank session cookies. Without it, any non-TN CIN that isn't in
  the fixture set returns 404 ("CIN ... not found"). See
  `docs/INGEST_MCA_PUBLIC.md`.
- **Gemini Flash narrative** — runs in template-fallback mode in dev
  because `GEMINI_API_KEY=PLACEHOLDER`. The narrative still works,
  but it's templated from evidence numbers, not LLM-generated. Set
  a real Google AI Studio key in `.env.local` to flip it on.
- **NCLT / RBI Wilful Defaulter live polling** — the scheduler runs,
  but the polling tasks use fixture sources. Real scrapers are
  coded (`backend/app/ingest/ibbi_fetcher.py`,
  `rbi_fetcher.py`, `gstn_fetcher.py`, `nclt.py`) but not yet wired
  into the production composite. Roadmap.
- **Production deployment** — see `docs/DEPLOY_ORACLE.md` /
  `DEPLOY_MILESWEB.md` / `DEPLOY_ORACLE_AMPERE.md`.

---

## Section 8 — Quick reference card

Print this and keep it next to you while running the walkthrough.

```
Priya   credit_officer   priya@demo.in    Sentinel@1   upload YES   report NO
Rajan   investigator     rajan@demo.in    Sentinel@1   upload YES   report YES
Deepa   auditor          deepa@demo.in    Sentinel@1   upload NO    report YES
Amir    admin            amir@demo.in     Sentinel@1   upload YES   report YES

DEMO_CINS:
  IL&FS         U45201MH2005PTC155294   CRITICAL
  DHFL          L65910MH1984PLC032662   CRITICAL (evergreening)
  Amtek Auto    U27101MH2010PTC215432   HIGH (NCLT match)
  HIJ Auto      U29304MH2019PTC287654   HIGH (synthetic shell)
  XYZ Garments  U14101MH2019PTC298765   LOW (clean control)
  TN bulk       U10719TN2026PTC192803   LOW (master-only, data_confidence=25)
```
