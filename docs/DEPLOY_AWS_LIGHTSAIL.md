# Deploy Sentinel-G to AWS Lightsail

> Full backend + Neo4j + ML stack on a single $20/mo Lightsail instance, for a
> ~2-month runway on the $100 AWS free-credit tier. Frontend stays on Vercel.

If you want the cost breakdown + architecture rationale before doing anything,
read `infra/aws/docker-compose.yml`'s header comment first.

---

## Cost-safety pre-flight (do this first)

1. **Sign in to AWS** → confirm the $100 credit shows in **Billing → Credits**.
2. **AWS Budgets** (one-time, ~3 min):
   - Console → Billing → Budgets → Create budget
   - Type: Cost budget. Amount: $95. Period: Quarterly.
   - Alert at 85% ($80.75) → your email
   - Alert at 100% ($95) → your email
   - This will not auto-stop the instance, but it's your guard-rail. Delete the
     instance from Lightsail console before you breach $95 if you want to stop
     paying.
3. **Calendar reminder** for ~Aug 1 (1 month in): check Lightsail billing dashboard.

---

## Provision the VM (~10 min)

### 1. Lightsail instance

1. Lightsail console → Create instance → Linux/Unix → OS only → **Ubuntu 24.04 LTS**.
2. Plan: **$20/month (2 vCPU, 4 GB RAM, 80 GB SSD)** — *do not pick smaller*; the 2 GB plan can't fit Neo4j + FastAPI + ML.
3. Instance name: `sentinel-g-prod`.
4. Region: `ap-south-1` (Mumbai) if your judges are in India, else closest to your users.
5. Create.

### 2. Attach a static IP

1. Lightsail → Networking → Create static IP → attach to `sentinel-g-prod`.
2. Note the IP (e.g. `13.234.x.x`).

### 3. Open the firewall

1. Click `sentinel-g-prod` → Networking → **IPv4 Firewall**.
2. Add: HTTP (80), HTTPS (443). SSH (22) is already on.
3. **Do NOT open 7687.** Neo4j Bolt stays internal to the docker compose network.

### 4. Download the SSH key

Lightsail console → Account → SSH keys → Download default key (`LightsailDefaultKey-<region>.pem`).
On Linux/Mac: `chmod 600` it. On Windows, set `Properties → Security → Disable inheritance, remove all` until only you remain.

---

## First-time deploy on the VM (~15 min)

### 5. SSH in

```bash
ssh -i LightsailDefaultKey-ap-south-1.pem ubuntu@<your-static-ip>
```

### 6. Clone the repo

```bash
cd ~
git clone https://github.com/MelvinDenish/SME_Fraud_Detection.git sentinel-g
cd sentinel-g/infra/aws
```

### 7. Fill in `.env`

```bash
cp .env.example .env
nano .env
```

You need to set five values. Generate secrets in your terminal first:

```bash
# JWT signing key
python3 -c "import secrets; print(secrets.token_hex(32))"

# Neo4j password
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

Then in `.env`:

| Key | Value |
|---|---|
| `DOMAIN` | `<your-static-ip>.sslip.io` (literally — sslip.io resolves to the IP for free) |
| `JWT_SECRET` | the 64-hex string from above |
| `NEO4J_PASSWORD` | the urlsafe string from above |
| `GEMINI_API_KEY` | get from https://aistudio.google.com/apikey (free) |
| `CORS_ALLOWED_ORIGINS` | your Vercel deploy URL — must match exactly, e.g. `https://sentinel-g.vercel.app` (no trailing slash) |

Leave the rest at their defaults.

### 8. Run the bootstrap

```bash
bash lightsail_bootstrap.sh
```

This:
- Installs Docker (~2 min on first run)
- Pulls the FastAPI image from public GHCR (~3 min — image is ~1.5 GB)
- Pulls Neo4j 5.20 + GDS (~2 min)
- Starts the compose stack
- Waits for Neo4j + FastAPI healthchecks (~3 min)
- Seeds the 4 demo users (`priya@demo.in`, `rajan@demo.in`, `deepa@demo.in`, `amir@demo.in`, all password `Sentinel@1`)
- Smoke-tests `/health` via the public domain

If the docker install ran for the first time, log out and back in (or run `newgrp docker`) before re-running.

If `/health` smoke-test fails on first run, Caddy is likely still issuing the Let's Encrypt cert. Wait 60s and `curl` it manually.

---

## Verify the deploy (~5 min)

From your laptop:

```bash
# Replace <ip> with your Lightsail static IP

curl https://<ip>.sslip.io/health
# Expect: {"status":"ok","version":"0.1.0","env":"prod"}

curl https://<ip>.sslip.io/health/neo4j
# Expect: {"neo4j_reachable":true,"gds_version":"2.x.x"}

curl https://<ip>.sslip.io/health/ml
# Expect: {"ok":true,"meta_learner":{"loaded":true},"analytics_cache":{"built":...}}
```

Then from the Vercel-hosted frontend:

1. Update Vercel env `VITE_API_BASE=https://<ip>.sslip.io` and trigger a redeploy.
2. Log in as `priya@demo.in` / `Sentinel@1`.
3. Search CIN `U45201MH2005PTC155294` (IL&FS).
4. **Expect:** CRITICAL band, full evidence chain, `data_confidence` ≥ 80.

Full walkthrough by role: see `docs/WALKTHROUGH.md`.

---

## (Optional) Seed the Tamil Nadu real-company registry

If you want `/search` to find real Indian SMEs (not just the 4 fixtures), upload the TN bulk CSV:

```bash
# From your laptop
scp -i LightsailDefaultKey-*.pem TN_Companies_Master_Data.csv \
  ubuntu@<ip>:~/sentinel-g/data/raw/data_gov_in/

# Then on the VM
ssh -i ... ubuntu@<ip>
docker exec sentinel-g-api python scripts/seed_data_gov_in.py --limit 200000
```

~30 minutes; runs in the background of the FastAPI container.

---

## Day-to-day ops

### Redeploy after a backend code change

The GHCR workflow auto-rebuilds the image on every push to `main` that touches `backend/`, `ml/`, or `pyproject.toml`. To pull the latest on the VM:

```bash
ssh -i ... ubuntu@<ip>
cd ~/sentinel-g/infra/aws
docker compose pull
docker compose up -d --remove-orphans
```

### View logs

```bash
docker compose logs -f sentinel-g-api    # backend
docker compose logs -f neo4j             # database
docker compose logs -f caddy             # TLS + proxy
```

### Weekly snapshot (manual; automate via Lightsail console)

Lightsail console → instance → Snapshots → Create snapshot. Costs ~$0.05/GB-mo (~$1/mo for the 80 GB instance). Set up an automatic weekly schedule from the same panel.

---

## Memory budget reference

| Process | Target RAM | Notes |
|---|---|---|
| Neo4j heap | 1.2 GB | `NEO4J_server_memory_heap_max__size` |
| Neo4j pagecache | 512 MB | `NEO4J_server_memory_pagecache_size` |
| FastAPI uvicorn | 600 MB | `mem_limit: 1g` in compose |
| ML models (lazy) | ~500 MB | TGN + LOF + TCN + AE + meta stack |
| data.gov.in cache | ~200 MB | After first `/search` that triggers it |
| Caddy + system | ~200 MB | |
| **Total at peak** | **~3.2 GB** | of 4 GB Lightsail RAM |

Check actual usage with: `docker stats --no-stream`.

If you see swap usage or OOM kills in `dmesg`, upgrade to the $40/mo Lightsail plan (8 GB RAM) — 1-click resize. That bumps your monthly to $40 and still fits inside $100 over 2 months.

---

## Shut down before credits expire

Around **Nov 20, 2026**:

1. Lightsail console → instance → **Delete**.
2. Static IP → Detach + Delete.
3. Snapshots → Delete each (or keep if you want to redeploy from one later — ~$1/mo to keep).

Confirm in **Billing → Bills** that the next month shows $0.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` returns 502 | FastAPI container is restarting | `docker compose logs sentinel-g-api`; usually env var typo |
| `/health/neo4j` returns 503 | Neo4j heap exhausted, container OOM-killed | `docker stats`; if Neo4j is hitting 1.2 GB constantly, upgrade plan |
| Cert errors in browser | Caddy still issuing first cert | Wait 60s; check `docker compose logs caddy` for ACME challenges |
| CORS errors in frontend | `CORS_ALLOWED_ORIGINS` typo | Must match Vercel URL exactly, no trailing slash, no path |
| `/analyse/{cin}` returns 404 for known TN CIN | Bulk CSV not loaded yet | Run `seed_data_gov_in.py` per "Optional" section above |
| Bootstrap hangs at "waiting for neo4j healthy" | First-time GDS plugin install slow | Normal up to 5 min; if longer, `docker compose logs neo4j` |
| `bash: docker: command not found` after install | Group membership not refreshed | `newgrp docker` then re-run bootstrap |

---

## What's NOT enabled on this deploy

- **Live MCA Public Portal scraping** — requires Playwright + Chromium in the image (~250 MB extra). Skipped to keep the deploy lightweight. Run from your local dev box and push results via `/upload`.
- **`mamba-ssm` D5 detector** — needs CUDA. Lightsail $20 plan is CPU-only; the TCN fallback is wired in `ml/detectors/d5_mamba.py`.
- **Auto-renewing snapshots** — manual setup in Lightsail console; takes 30 seconds, do it after first deploy.

See `docs/INGEST_MCA_PUBLIC.md` if you want to wire live scraping later.
