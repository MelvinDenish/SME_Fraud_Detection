# Local end-to-end test report

> Generated 2026-05-20 against the local dev stack on Windows.
> Stack: Neo4j 5.20 + GDS 2.6.9 (Docker), FastAPI :8000, Vite :5173,
> 444 pytest tests passed prior to this run.

## Test matrix executed

| Group | Cases | Pass | Fail |
|---|---|---|---|
| Auth | 12 | 11 | 1 (F3) |
| /analyse + /provenance | 13 | 12 | 1 (F4) |
| Upload | 4 | 4 | 0 |
| Reports | 2 | 2 | 0 |
| Security | 6 | 5 | 1 (F4) |
| Browser smoke (5 pages) | 5 | 5 | 0 |
| **Total** | **42** | **39** | **3 distinct findings** |

## Findings

### F1 — Frontend login form prefills an email the backend rejects (UX bug, MEDIUM)
- **Where**: [frontend/src/pages/Login.tsx](../frontend/src/pages/Login.tsx) line 41 — `useState("analyst@sentinel-g.local")`.
- **What happens**: A user who clicks "Register instead" and submits without changing the prefilled email gets a 422 from `EmailStr`: *"value is not a valid email address: The part after the @-sign is a special-use or reserved name that cannot be used with email."* — pydantic's `email-validator` rejects `.local` and `.test` TLDs by design.
- **Repro**: Open `/login`, switch to register mode, type any password ≥ 8 chars, click Create account.
- **Fix candidates**:
  1. Drop the prefill (`useState("")`) and add a placeholder instead.
  2. Use a non-reserved TLD that won't be confused with real mail (e.g. `analyst@sentinel-g.example`).
  3. Configure `email-validator` to allow reserved TLDs (pydantic-settings; tighter coupling — not recommended).
- **Recommendation**: option 1 — empty prefill + placeholder text.

### F2 — Rate-limit window: 10/min/IP — verified working (security positive)
- 11th request inside the 60s window returns `HTTP 429 {"detail":"Rate limit exceeded (10/min)"}`.
- Burst test S4: 20 concurrent reqs ⇒ all 20 returned 429 because earlier tests had already consumed the budget. Confirms the limiter is wired and reset window is ~ 60s.
- Tight for E2E testing; reasonable for prod.
- Action: leave as-is for prod; for local-dev testing harness, consider bumping `RATE_LIMIT_PER_MIN` to 100 in `.env.local`.

### F3 — Duplicate-email registration creates a second account (HIGH, data-integrity bug)
- **Where**: [backend/app/auth/routes.py:register](../backend/app/auth/routes.py) — calls `create_user(...)` in [backend/app/auth/repository.py](../backend/app/auth/repository.py).
- **What happens**: POST `/auth/register` with the same email twice returns **HTTP 201 both times**, with *different* `user_id`s. A subsequent `/auth/login` then picks one of the records non-deterministically.
- **Repro**:
  ```
  POST /auth/register {"email":"x@example.com","password":"correcthorse"} -> 201 user_id=A
  POST /auth/register {"email":"x@example.com","password":"correcthorse"} -> 201 user_id=B  ← should be 4xx
  ```
- **Recommended fix**: add a Neo4j uniqueness constraint on `:User(email)` and let `create_user` catch `ConstraintError` → raise `HTTPException(status_code=409, detail="email already registered")`. If the constraint already exists, the bug is in the wrapper — investigate `repository.create_user`.

### F4 — `/analyse/{cin}` and `/analyse/{cin}/provenance` are publicly accessible (CRITICAL, auth bypass)
- **Where**: [backend/app/api/analyse.py:88-89](../backend/app/api/analyse.py#L88-L89) and line 107.
- **What happens**: Both routes are declared as `async def analyse(cin: CIN_PATH)` — **no** `Depends(get_current_user)`. The frontend's `ProtectedRoute` (React-side) is only a UI gate; the API itself is open. Anyone with the URL can curl `/analyse/<any-CIN>` and pull the full PRD §7.1 dual-output payload (score + evidence + override flag + module breakdown).
- **Repro**:
  ```
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/analyse/U45201MH2005PTC155294
  200    ← should be 401
  ```
  Confirmed publicly accessible. PRD §10 Day-19 (JWT auth) acceptance is not actually enforced on the primary endpoint.
- **Recommended fix**: add `_user: dict = Depends(get_current_user)` to both routes — same pattern as `/report/{cin}` which is correctly gated.
- **Compare**: `/report/{cin}` correctly returns 401 without a token (R2 ✓).

### F5 — Every demo CIN reports `ensemble_disagreement_flag=True` (LOW, possibly intentional)
- **Where**: scorer in [backend/app/scorer.py](../backend/app/scorer.py) per PRD §7.4.
- **What happens**: All five demo subjects (IL&FS, Amtek, DHFL, Hij Auto, XYZ) come back with the flag set to true.
- **Why this might be intentional**: PRD §7.4 says the flag fires "when any two non-zero L1 detector scores diverge > 30 points". The demo fixtures don't have realistic L1 outputs across all 6 detectors, so divergence is plausibly always true at this seed scale.
- **Action**: confirm with the scorer author whether this is expected on the demo seed. No fix proposed in this report — just flagged.

### F6 — `/upload/gst/{cin}` accepts a different schema than the obvious "GST entity" shape (LOW, doc bug)
- **Where**: [backend/app/api/upload.py](../backend/app/api/upload.py) — the body type is `RawGstEntity` which requires `pan`, not the intuitive `{gstin, taxable_turnover, period}` shape.
- **What happens**: POST `/upload/gst/{cin}` with `{gstin, taxable_turnover, period}` returns 422 with a long missing/extra field error.
- **Action**: document the expected shape in an OpenAPI example / docstring, OR widen the schema. No fix in this report.

### F7 — Console warning: mixed CSS shorthand+longhand on nav (LOW, cosmetic)
- **Where**: [frontend/src/App.tsx](../frontend/src/App.tsx) — the nav style mixes `borderBottom: "1px solid transparent"` with `borderBottomColor: var(--accent-gold)` on active state. React warns: *"Removing borderBottomColor borderBottom"*.
- **Action**: pick one form (preferably `borderBottomColor: "transparent"` on base + `borderBottomColor: var(--accent-gold)` on active). Pure cosmetic — render is correct.

### F8 — Missing /favicon.ico (LOW, cosmetic)
- **Where**: [frontend/index.html](../frontend/index.html) has no `<link rel="icon">`.
- **What happens**: every page load fires a 404 on `/favicon.ico`.
- **Action**: add a small icon (or `<link rel="icon" href="data:,">` to silence).

## What did pass (positive findings)

### Backend HTTP contract
- `GET /health` → `200 {status: ok, version: 0.1.0, env: dev}`.
- `GET /health/neo4j` → `200 {neo4j_reachable: true, gds_version: "2.6.9"}` ✓ **PRD §10 Day 1 acceptance**.
- `POST /auth/register` (valid TLD, no role) → `201` with `role: "credit_officer"` defaulted (after F1 unblock).
- `POST /auth/register` with explicit `role: "investigator"` → `201`. The role-enum bug the user originally reported (`role: "analyst"`) is fixed in [frontend/src/lib/auth.tsx](../frontend/src/lib/auth.tsx) — frontend now omits `role` and lets the backend default apply.
- `POST /auth/login` valid → `200` with `access_token` (JWT, 86400s expiry).
- `POST /auth/login` wrong pwd → `401` ✓.
- `GET /auth/me` valid token → `200 {user_id, email, role}`.
- `GET /auth/me` no token → `401` ✓.
- `GET /auth/me` malformed token → `401` ✓.

### `/analyse` payload (PRD §7.1 dual output) — sample matrix on the 5 demo CINs

| CIN | Subject | HTTP | score | band | DC | override | evidence | ens_disagree |
|---|---|---|---|---|---|---|---|---|
| U45201MH2005PTC155294 | IL&FS | 200 | 75.0 | CRITICAL | 92% | true | 18 | true |
| U27101MH2010PTC215432 | Amtek | 200 | 75.0 | CRITICAL | 80% | true | 11 | true |
| L65910MH1984PLC032662 | DHFL | 200 | 75.0 | CRITICAL | 65% | true | 14 | true |
| U29304MH2019PTC287654 | Hij Auto | 200 | 75.0 | CRITICAL | 92% | true | 9 | true |
| U14101MH2019PTC298765 | XYZ Garments (clean) | 200 | 4.33 | LOW | 65% | false | 2 | false |

XYZ Garments correctly stays **LOW** despite the same scoring path — clean-baseline anti-regression holds.

### `/provenance` (each CIN returns nodes + TRIGGERED_BY edges)

| CIN | signals | TRIGGERED_BY edges |
|---|---|---|
| U45201MH2005PTC155294 (IL&FS) | 19 | 29 |
| U27101MH2010PTC215432 (Amtek) | 11 | 15 |
| L65910MH1984PLC032662 (DHFL) | 14 | 24 |
| U29304MH2019PTC287654 (Hij) | 9 | 12 |
| U27109MH2018PTC312456 (ITC ring member) | 3 | 4 |

### Upload + Reports

- `GET /upload/{cin}/preview` → 200 with `state.{n_financials, has_gst_upload, has_bank_upload}` + `if_*_added` projections ✓.
- `POST /upload/bank/{cin}` → 200 `{accepted: true, detail: "Bank credits total overlaid"}` ✓.
- `GET /report/{cin}` with token → 200 PDF v1.4, 2 pages, 6092 bytes, headers `x-report-id` UUID + `x-report-generated-at` ISO-8601 ✓.
- `GET /report/{cin}` no token → 401 ✓.

### Security

- **CIN regex**: 4/5 malformed CINs return 422 (the 5th, `../../etc/passwd`, returns 404 because URL-decoding routes it to a different path — still safe). [backend/app/api/validators.py](../backend/app/api/validators.py) `CIN_REGEX` is correctly enforced.
- **CORS**: preflight from `http://localhost:5173` returns 200 with proper allow headers; from `https://evil.example.com` returns 400 ✓.
- **Rate limit**: 10/min/IP — fires at the 11th req, returns `{"detail":"Rate limit exceeded (10/min)"}` ✓.
- **Secret scan**: `scripts/scan_secrets.py` clean — 250 tracked files, no secret patterns matched ✓.

### Browser (Vite :5173, all routes via `ProtectedRoute`)

| Page | URL | h1 | Visible artefacts |
|---|---|---|---|
| Dashboard | `/dashboard` | (Fraunces hero "The Analysis Dossier.") | 75.0 hero, CRITICAL stamp, DC %, 19 evidence rows, drop-cap on first signal |
| Graph Explorer | `/graph/U45201MH2005PTC155294` | "The Evidence Graph." | 29 SVG nodes, 48 line segments, Legend rail, Inspector panel |
| ITC Carousel | `/itc` | "ITC Carousel" | 3 CIN cards, 3 CRITICAL badges, no error text |
| Evergreening | `/evergreening` | "Bank-Loan Evergreening" | DHFL CIN, CRITICAL, override text present |
| Upload | `/upload` | "Upload evidence" | 3 forms, 1 file input, 3 submit buttons, DataConfidence preview text |
| Reports | `/reports` | "Reports" | CIN input, download button (history table renders after first download) |

Screenshots in `dashboard-ilfs.png` and `graph-ilfs.png` next to this report.

## Recommended fix order

1. **F4** (CRITICAL, auth bypass) — add `Depends(get_current_user)` to `/analyse` and `/analyse/{cin}/provenance`. Trivial 2-line change.
2. **F3** (HIGH, data integrity) — add Neo4j unique constraint on `:User(email)` and translate `ConstraintError` → 409 in the register route.
3. **F1** (MEDIUM, UX) — drop the `.local` prefill in Login.tsx so the form is usable out-of-the-box.
4. **F5** — confirm `ensemble_disagreement_flag=True` is intentional on demo seed; if not, lower the divergence threshold.
5. **F6** — document the `/upload/gst` schema.
6. **F7**, **F8** — cosmetic cleanups.

## Stack-up commands used for this run

```bash
docker compose -f infra/docker-compose.dev.yml up -d
NEO4J_PASSWORD=sentinel_dev_pwd .venv/Scripts/python.exe scripts/seed_neo4j.py --clean
NEO4J_PASSWORD=sentinel_dev_pwd .venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 &
cd frontend && npm run dev &
NEO4J_PASSWORD=sentinel_dev_pwd .venv/Scripts/python.exe -m pytest --tb=line -q   # 444 pass / 4 skip
```

## Tear-down

```bash
kill <uvicorn_pid> <vite_pid>
docker compose -f infra/docker-compose.dev.yml stop
```
