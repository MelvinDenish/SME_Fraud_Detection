<img width="4320" height="1440" alt="hh26 main poster 2 with sponsors 3x1" src="https://github.com/user-attachments/assets/c698b2cd-da84-4cb0-9276-125c6a7244aa" />

# Sentinel-G

> One graph engine. Three structurally different fraud types. SME loans · GST ITC carousels · bank loan evergreening.

---

## Problem & Domain

Indian banks and NBFCs lost an estimated ₹25,000–40,000 crore to SME loan fraud in FY 2024–25. DGGI detected over ₹58,772 crore in fake ITC fraud the same year — a 140% year-on-year increase. Listed companies have SEBI oversight; SMEs file once a year, often late, often rubber-stamped. Existing credit teams cannot cross-reference MCA21, CERSAI, GSTN, and the director-company ownership graph simultaneously.

**Sentinel-G does.** It produces a calibrated fraud risk score with a conformal prediction interval, a DataConfidence percentage, and — most importantly — a typed evidence provenance chain rooted in the graph that holds up in a legal filing.

**Themes Selected:** Trust, Identity & Security · Work, Finance & Digital Economy · Public Systems, Governance and Civic Tech

---

## Objective

| Persona | Pain Point | What Sentinel-G Gives Them |
|---|---|---|
| NBFC Credit Officer | Reviews 50 SME applications/month manually. Misses fabricated P&Ls. | Calibrated fraud risk score + DataConfidence % + full graph evidence chain. Minutes, not days. |
| DGGI GST Investigator | Identifies circular trading networks via spreadsheet cross-referencing. | GDS SCC finds ITC carousel rings across thousands of GSTINs in milliseconds. |
| Corporate Forensic Auditor | Commissioned post-fraud. Works from incomplete records. | Multi-signal forensic report with typed evidence provenance chain — directly usable in legal filings. |

---

## Team & Approach

### Team Name
`Sentinel-G`

### Team Members
- MelvinDenish ([@MelvinDenish](https://github.com/MelvinDenish)) — Build lead

### Approach
- **Two-tier intelligence.** 11 deterministic rule modules feed a 6-detector ML ensemble. The rules catch what they were designed for, the ML learns the optimal combination, the anomaly detectors catch what neither knows about.
- **Graph-native explainability.** No SHAP, no LLM-generated numbers. Every fraud flag is a `FraudSignal` node with `TRIGGERED_BY` edges to the exact data point that triggered it. Court-defensible by construction.
- **Calibration first.** Isotonic regression on a separate hold-out. Conformal prediction (MAPIE) gives prediction intervals at α=0.10. We report uncertainty, not just a number.

---

## Tech Stack

### Core Technologies
- **Frontend:** React 18 + Vite, TailwindCSS, d3-force, recharts, @tanstack/react-query
- **Backend:** FastAPI + uvicorn (async), Pydantic v2, python-jose JWT
- **Database:** Neo4j 5 Community + Graph Data Science (GDS) plugin — single data store
- **ML:** LightGBM (OOF meta-learner), scikit-learn (Isolation Forest, LOF, Isotonic), PyTorch Geometric (TGN), Mamba SSM, MAPIE (conformal), CatBoost, NetworkX
- **NLP / Docs:** spaCy, pdfplumber, camelot, pytesseract, reportlab
- **LLM (narrative only):** Gemini Flash (Google AI Studio free tier)
- **APIs:** MCA21, CERSAI, BSE SME, NCLT, RBI wilful defaulter
- **Hosting:** Fly.io (FastAPI) · Railway (Neo4j Docker) · Vercel (frontend)

### Additional
- [x] AI / ML
- [x] Cyber Security (financial fraud forensics)
- [x] Cloud

---

## Sponsored Track

- [x] **Neo4j Track** — Neo4j is the single data store. Every fraud signal, every audit log, every evidence chain lives in the graph. GDS SCC powers ITC carousel detection. GDS WCC powers entity resolution. Belief propagation Cypher writes `CONNECTED_TO_CRITICAL` edges.

> Sentinel-G uses Neo4j 5 Community + GDS plugin on Railway Docker. Graph evidence provenance is the *only* explainability mechanism shown to credit officers, investigators, and forensic auditors.

---

## Key Features

- ✅ **Three fraud types in one engine.** SME loan fraud, GST ITC carousels, bank loan evergreening.
- ✅ **17 graph patterns + 11 deterministic modules + 6 ML detectors.** All scores in <2s/report.
- ✅ **Calibrated P(fraud) with 90% conformal prediction intervals.** Honest about uncertainty.
- ✅ **Graph evidence provenance.** Every finding cites specific numbers from a specific data row in the graph.

---

## Demo & Deliverables

- **Demo Video:** _to be added after Week 4 rehearsals (PRD §10 Day 28)_
- **Deployment Link:** _to be added after Day 28 production deploy_
- **PRD:** see [Sentinel_G_Final.docx](./Sentinel_G_Final.docx)

---

## How to Run the Project

### Requirements
- Python 3.11 (managed via `uv`)
- Node.js 22
- Docker (for local Neo4j)
- Optional: NVIDIA GPU + CUDA 12+ for ML training. CPU works for inference.

### Local Setup

```bash
# 1. Python env
uv venv --python 3.11
.venv\Scripts\activate         # PowerShell: .venv\Scripts\Activate.ps1
uv pip install -e .[dev]

# 2. Neo4j 5 + GDS, locally
cp .env.example .env.local     # fill placeholders
docker compose -f infra/docker-compose.dev.yml up -d
python -m backend.app.graph.schema   # applies constraints + indexes

# 3. Backend
uvicorn backend.app.main:app --reload --port 8000

# 4. Frontend
cd frontend && npm install && npm run dev
```

Verify `RETURN gds.version()` works at http://localhost:7474 — that's the PRD Day 1 acceptance check.

### Deploy

| Component | Target | Command |
|---|---|---|
| FastAPI backend | Fly.io | `flyctl deploy -c backend/fly.toml` |
| Neo4j | Railway | see [infra/railway/README.md](./infra/railway/README.md) |
| Frontend | Vercel | `vercel --prod` from `frontend/` |

---

## Future Scope

Items below are correctly deferred (PRD §15). Not missing — out of 30-day scope:

- 📈 GSP licence / live GST invoice data
- 🤝 Consortium fraud signal sharing across NBFCs
- 🔄 Continuous monitoring with daily score updates
- 🏦 LOS integration (Finacle, BankFlex, Nucleus)
- 🌍 LLP / partnership firm coverage
- 🛡️ Cross-border / offshore structure detection

---

## Resources / Credits

- **Data sources:** MCA21 · CERSAI · BSE SME · NCLT · RBI Wilful Defaulter list · CIBIL public defaulter list
- **Frameworks:** FastAPI, Neo4j GDS, PyTorch Geometric, LightGBM, scikit-learn, MAPIE
- **Methodology references:** SFIO IL&FS forensic report (FY2014-18), Beneish 1999 ("The Detection of Earnings Manipulation"), Nigrini 2012 ("Benford's Law"), MAPIE (Conformal Prediction for Classification)
- **Tooling:** [Claude Code](https://claude.com/claude-code) + [obra/superpowers](https://github.com/obra/superpowers) + [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)

---

## Final Words

If time runs out in Week 4, cut the Upload Portal and Benchmark screen. **Never cut** the IL&FS demo, the Graph Explorer with evidence provenance, the ITC carousel view, or the DHFL evergreening view. Those four things are Sentinel-G. Everything else is polish.
