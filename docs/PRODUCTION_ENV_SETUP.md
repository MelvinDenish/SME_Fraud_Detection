# Production Environment Setup

This document lists every environment variable that **must** be set on the
AWS EC2 instance (`13.126.114.27`) for Sentinel-G to run correctly.

## Required — server will 500 / refuse to start without these

| Variable | Example / Description |
|---|---|
| `APP_ENV` | `prod` |
| `JWT_SECRET` | Run `python -c "import secrets; print(secrets.token_hex(32))"` and paste the result. **Do not use the default.** |
| `NEO4J_URI` | Your Railway Neo4j connection string, e.g. `bolt://roundhouse.proxy.rlwy.net:12345` |
| `NEO4J_USER` | `neo4j` (Railway default) |
| `NEO4J_PASSWORD` | The password Railway generated for your service |
| `NEO4J_DATABASE` | `neo4j` |

## Required for CORS (browser requests will fail without this)

| Variable | Value |
|---|---|
| `CORS_ALLOWED_ORIGINS` | `https://sentinel-g-theta.vercel.app` (add comma-separated preview URLs if needed) |

The code now has `https://sentinel-g-theta.vercel.app` baked in as a
default, but setting this env var explicitly lets you add Vercel preview
URLs without redeploying the backend.

## Required for narrative (503 without, but not a hard crash)

| Variable | Value |
|---|---|
| `MISTRAL_API_KEY` | Your Mistral API key from console.mistral.ai |

Without this the narrative endpoint falls back to a deterministic template
(still functional for the demo).

## How to apply on the server

```bash
# SSH into your EC2 instance
ssh ubuntu@13.126.114.27

# Edit the .env.local file in the project root
nano /path/to/SME_Fraud_Detection/.env.local

# Restart the FastAPI process
sudo systemctl restart sentinel-g
# OR if running with uvicorn directly:
pkill -f uvicorn && uvicorn backend.app.main:app --host 0.0.0.0 --port 80 &
```

## Verify after restart

```bash
# Neo4j health (should return 200, not 500)
curl https://13.126.114.27.sslip.io/health/neo4j

# Overall health
curl https://13.126.114.27.sslip.io/health

# ML tier (503 = artefacts not loaded, still OK for demo)
curl https://13.126.114.27.sslip.io/health/ml
```

## ML artefacts (for p_fraud_calibrated to be non-null)

The ML meta-learner artefacts (`ml/artifacts/`) must exist on the server.
Train them locally with:

```bash
uv run python -m ml.meta.f1a_lightgbm_oof   # trains LightGBM OOF
uv run python -m ml.meta.f1b_isotonic        # fits isotonic calibration
uv run python -m ml.meta.f1c_split_conformal # fits conformal intervals
```

Then `rsync` or `scp` the `ml/artifacts/` directory to the server.
Until artefacts are loaded, `p_fraud_calibrated` and `p_fraud_interval`
return `null` in every `/analyse` response — that is a PRD-allowed
degraded state, not a crash.
