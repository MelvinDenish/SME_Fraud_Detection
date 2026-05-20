# Production deploy on MilesWeb SM-L2 (₹749/mo intro · UPI · all-in-one VPS)

> Operator runbook for the cost-effective, UPI-payable deploy path.
> Sibling to [`DEPLOY_ORACLE.md`](DEPLOY_ORACLE.md) (AMD-micro + Railway)
> and [`DEPLOY_ORACLE_AMPERE.md`](DEPLOY_ORACLE_AMPERE.md) (free Ampere
> single-VM). Read this when: no credit card, no laptop self-host, need
> 24/7 production-grade for a 2-month judge window, ₹1,500-ish total
> budget. Verified live May 2026.

---

## Why MilesWeb SM-L2

Hard constraints that ruled out every other path:

- **No self-hosting** — laptop / home server out.
- **No credit card** — UPI / RuPay / PhonePe / Google Pay only.
- **Production-grade, 24/7, no cold starts**; judges may hit the link any
  time across 2+ months.
- **Cost-effective** — willing to pay, minimum spend.
- **Full PRD compliance** including the Neo4j GDS plugin — no soft-patch
  on `gds.version()`, no AuraDB-Free workaround.

| Considered path | Why it's out |
|---|---|
| Self-host + Cloudflare Tunnel | Laptop dependency rejected by operator |
| Hugging Face Space (free 16 GB) + keep-warm cron | Cron-miss + rebuild downtime unacceptable for a 2-month judge window |
| AuraDB Free + Oracle AMD 1 GB | OOM on FastAPI torch+lightgbm+spacy resident; needs GDS soft-patch |
| Oracle Ampere | Capacity-locked indefinitely |
| Render / Fly.io / DigitalOcean / Vercel paid | All require a credit card; no UPI |
| Cloudways | UPI only via third-party reseller workarounds |
| E2E Networks | UPI ✅ but ₹1,674+/mo entry — 3× MilesWeb |

**MilesWeb SM-L2** is the cheapest credible host in the
Indian-billed-UPI-accepting category, with a Hostinger fallback if needed
(both have Mumbai DCs, both natively accept UPI).

| Spec | SM-L2 |
|---|---|
| RAM | **8 GB** (Neo4j heap 4 GB + pagecache 1 GB + FastAPI 2 GB + Caddy + OS) |
| vCPU | 2 (KVM, dedicated) |
| Disk | 100 GB NVMe SSD |
| Bandwidth | 8 TB |
| DC | Mumbai |
| Virtualization | KVM full-root |
| Price | **₹749/mo intro**, ₹1,149/mo renewal |
| **2-month total** | **~₹1,498** (~$17.80) at intro rate; ₹1,898 if intro doesn't apply month 2 |
| Payments | **VISA, Mastercard, Rupay, UPI, Google Pay, PhonePe** |
| Source | [milesweb.in/hosting/vps-hosting/price](https://www.milesweb.in/hosting/vps-hosting/price), [milesweb.in/payment-methods](https://www.milesweb.in/payment-methods) |

### Why not the cheaper SM-L1 (4 GB / ₹549)

4 GB only works if Neo4j is on AuraDB Free — which requires GDS soft-patch
+ adds a second managed system. With Neo4j self-hosted alongside FastAPI:

- Neo4j JVM (heap 2-4 GB + pagecache 1-2 GB + GDS scratch) ≈ 3-5 GB
- FastAPI resident (torch + lightgbm + spacy + catboost) ≈ 1.5-2.5 GB
- Caddy + Ubuntu OS ≈ 0.5 GB

On 4 GB you'd get OOM-killed under any concurrent `/analyse` + GDS
projection. The ~₹200/mo extra for SM-L2 buys actual headroom. That's
the line between "works for the demo" and "stays up when a judge runs an
analysis on a Sunday night and stays for an hour".

### Fallback — Hostinger KVM 2 (₹999/mo intro)

If MilesWeb provisioning has issues, or you prefer a bigger brand:
8 GB / 2 vCPU / 100 GB NVMe / AMD EPYC / Mumbai DC / UPI accepted
([hostinger.com/in/vps-hosting](https://www.hostinger.com/in/vps-hosting)).
The compose and runbook below apply identically — only the provisioning
console differs.

---

## Architecture

```
                                Vercel (Hobby, free)
                                       │
                                       │ HTTPS, VITE_API_BASE
                                       ▼
                ┌──────────────────────────────────────┐
                │  https://<slug>.duckdns.org          │
                │  (Let's Encrypt auto-SSL via Caddy)  │
                └──────────────────────────────────────┘
                                       │
                                       ▼
                    ┌────── MilesWeb SM-L2 (8 GB) ──────┐
                    │                                   │
                    │   ┌─────────┐    ┌─────────────┐  │
                    │   │  Caddy  │ ─► │  FastAPI    │  │
                    │   │ :80/443 │    │  :8000      │  │
                    │   └─────────┘    └──────┬──────┘  │
                    │                         │ bolt    │
                    │                  ┌──────▼──────┐  │
                    │                  │  Neo4j 5    │  │
                    │                  │  + GDS      │  │
                    │                  └─────────────┘  │
                    │                                   │
                    └───────────────────────────────────┘
```

All three containers on one Docker Compose. Neo4j Bolt stays on the
Docker network — never exposed to the public internet. Caddy auto-issues
the Let's Encrypt cert against the DuckDNS subdomain.

---

## Reuse — what the repo already gives you

| Existing file | Reused as-is | Why |
|---|---|---|
| [`backend/Dockerfile`](../backend/Dockerfile) | yes | After the `7ef2ce4` fix, `uv pip install -r pyproject.toml` works correctly; amd64 builds cleanly on MilesWeb. |
| [`infra/oracle/Caddyfile`](../infra/oracle/Caddyfile) | yes (copy to `infra/vps/Caddyfile`) | Host-agnostic; uses `{$DOMAIN}` env var. |
| [`infra/oracle/.env.example`](../infra/oracle/.env.example) | yes (adapt to `infra/vps/.env.example`) | Existing shape works; only `NEO4J_URI` changes to the co-located service hostname. |
| [`infra/oracle/deploy.sh`](../infra/oracle/deploy.sh) | yes (fork to `infra/vps/deploy.sh`) | Add `docker compose build sentinel-g-api` before `up`; rest identical. |
| [`scripts/seed_neo4j.py`](../scripts/seed_neo4j.py) | yes | Wipes + reseeds demo backbone <60 s. |
| [`infra/docker-compose.dev.yml`](../infra/docker-compose.dev.yml) | reference | Local Neo4j 5 + GDS schema mirrors the production compose below. |

The **only new compose** adds Neo4j to the existing FastAPI+Caddy stack.

---

## Files to create

| Path | Role |
|---|---|
| `infra/vps/docker-compose.yml` | All-in-one stack: `neo4j` (5.20-community + GDS), `sentinel-g-api` (built from `backend/Dockerfile`), `caddy`. Body in §A below. |
| `infra/vps/Caddyfile` | Verbatim copy of `infra/oracle/Caddyfile`. |
| `infra/vps/.env.example` | Same shape as `infra/oracle/.env.example`; `NEO4J_URI=bolt://neo4j:7687`. Body in §B below. |
| `infra/vps/deploy.sh` | Idempotent `git pull → docker compose build → docker compose up -d → wait healthy`. Body in §C below. |

**Not touched:**
- `backend/Dockerfile` — correct after the GHCR fix.
- `infra/oracle/*` — left alone; AMD/Railway path stays available.
- `docs/DEPLOY_ORACLE.md`, `docs/DEPLOY_ORACLE_AMPERE.md` — sibling docs.
- `.github/workflows/docker-publish.yml` — GHCR amd64 builds keep
  publishing for the pull-rather-than-build path.
- Application code under `backend/`, `frontend/`, `ml/` — zero changes.

---

## Operator setup (~45 min total)

### 1. Provision MilesWeb VPS (~5 min)

1. Go to [milesweb.in/hosting/vps-hosting/price](https://www.milesweb.in/hosting/vps-hosting/price).
2. Pick **Cloud VPS SM-L2** (8 GB / 2 vCPU / 100 GB NVMe) — Mumbai DC.
3. OS: **Ubuntu 22.04 LTS** (or 24.04 if offered).
4. Billing cycle: 1 month (you can renew or upgrade later).
5. Checkout → pay via **UPI / Google Pay / PhonePe / Rupay** (whichever
   you have). Save the invoice — submission-evidence-friendly.
6. Within ~5 min you'll receive root SSH credentials by email.

### 2. SSH in + lock down (~10 min)

```bash
ssh root@<vps-ip>

# Firewall — only 22, 80, 443 ingress
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

# Create a non-root user (optional but cleaner)
adduser sentinel
usermod -aG sudo sentinel
mkdir -p /home/sentinel/.ssh
cp /root/.ssh/authorized_keys /home/sentinel/.ssh/
chown -R sentinel:sentinel /home/sentinel/.ssh
chmod 700 /home/sentinel/.ssh
chmod 600 /home/sentinel/.ssh/authorized_keys
```

### 3. Install Docker (~5 min)

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
usermod -aG docker sentinel
docker --version
docker compose version
```

Log out, log back in as `sentinel` so the group takes effect.

### 4. DuckDNS subdomain (~5 min)

1. [duckdns.org](https://www.duckdns.org) → Sign in with GitHub.
2. Claim `<your-slug>.duckdns.org` (free).
3. Copy your token from the home page.

On the VPS:
```bash
TOKEN=<your-duckdns-token>
SLUG=<your-slug>

# Pin the A record to this VPS's public IP
curl "https://www.duckdns.org/update?domains=$SLUG&token=$TOKEN&ip="

# Keep it fresh every 5 min
(crontab -l 2>/dev/null; \
 echo "*/5 * * * * curl -s 'https://www.duckdns.org/update?domains=$SLUG&token=$TOKEN&ip=' >/dev/null") \
 | crontab -

# Verify
dig +short $SLUG.duckdns.org   # should return the VPS public IP
```

### 5. Clone the repo, drop in the compose files (~5 min)

```bash
git clone https://github.com/MelvinDenish/SME_Fraud_Detection.git
cd SME_Fraud_Detection

# Create the new infra/vps/ directory with the files from §A-C below
mkdir -p infra/vps
# (paste docker-compose.yml, Caddyfile, .env.example, deploy.sh content)
```

You can either:
- Edit the files directly on the VPS with `nano`, OR
- Create them locally, commit on a `deploy/milesweb-vps` branch, push,
  and `git pull` on the VPS — same flow as the other deploy paths.

### 6. Fill `.env` (~3 min)

```bash
cd infra/vps
cp .env.example .env
nano .env
```

Required values:

```bash
DOMAIN=<your-slug>.duckdns.org
NEO4J_AUTH=neo4j/<strong-password>
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<same-password>
NEO4J_DATABASE=neo4j
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24
RATE_LIMIT_PER_MIN=10
GEMINI_API_KEY=<from https://aistudio.google.com/apikey>
GEMINI_MODEL=gemini-1.5-flash
CORS_ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app
SCHEDULER_ENABLED=true       # 8 GB absorbs it comfortably
APP_ENV=prod
LOG_LEVEL=INFO
TIMEZONE=Asia/Kolkata
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
```

### 7. Bring the stack up (~10 min for the first build)

```bash
cd infra/vps
docker compose build sentinel-g-api      # ~8 min for torch+lightgbm install
docker compose up -d
docker compose ps                         # verify all three services
docker compose logs -f caddy              # wait for "certificate obtained"
```

### 8. Seed Neo4j + smoke test (~3 min)

```bash
docker compose exec sentinel-g-api python scripts/seed_neo4j.py --clean
```

From your laptop:
```bash
curl -i https://<your-slug>.duckdns.org/health
# HTTP/2 200, valid Let's Encrypt cert

curl https://<your-slug>.duckdns.org/health/neo4j
# {"neo4j_reachable": true, "gds_version": "2.x.x"}

curl https://<your-slug>.duckdns.org/analyse/U45201MH2005PTC155294 \
  | python -m json.tool | grep -E "fraud_risk_score|risk_band"
# fraud_risk_score: 75.0, risk_band: "CRITICAL"
```

### 9. Close the CORS loop with Vercel (~5 min)

```bash
# From your laptop, in frontend/:
vercel env add VITE_API_BASE production
# paste: https://<your-slug>.duckdns.org
vercel --prod
```

Then on the VPS:
```bash
ssh sentinel@<vps-ip>
cd ~/SME_Fraud_Detection/infra/vps
nano .env
# set: CORS_ALLOWED_ORIGINS=https://<your-actual-vercel-prod-url>
docker compose up -d --force-recreate sentinel-g-api
```

### 10. Verify end-to-end + hand off

1. `docker compose ps` — all 3 services `healthy`.
2. `curl -i https://<slug>.duckdns.org/health` — HTTP/2 200 + valid cert.
3. `curl https://<slug>.duckdns.org/health/neo4j` — `neo4j_reachable: true`, `gds_version: "2.x.x"` (PRD §10 Day 1 acceptance ✓).
4. `curl https://<slug>.duckdns.org/analyse/U45201MH2005PTC155294` — `fraud_risk_score: 75.0`, `risk_band: "CRITICAL"`.
5. Open `https://<vercel-url>` in a browser — dashboard renders IL&FS CRITICAL card from the live VPS.
6. `PROD_API_URL=https://<slug>.duckdns.org python scripts/day27_rehearsal_multi.py` — Day-29 prod-rehearsal harness exercises all three demo scenarios against production.

Submit `https://<vercel-url>` as the project URL. Done.

---

## Ongoing monitoring (2-month judge window)

- **UptimeRobot free tier** ([uptimerobot.com](https://uptimerobot.com))
  — 50 monitors free, pings `/health` every 5 min, emails you when it
  fails. One monitor for `https://<slug>.duckdns.org/health` is enough.
- `docker compose logs --tail 200 sentinel-g-api` on demand.
- `docker stats` on the VPS to spot-check memory pressure.
- `df -h` once a month — 100 GB disk doesn't fill itself but Neo4j logs
  rotate and Docker image cache builds up.

---

## Redeploys

After a new backend commit lands on `main`:

```bash
ssh sentinel@<vps-ip>
cd ~/SME_Fraud_Detection/infra/vps
./deploy.sh
```

`deploy.sh` does `git pull → docker compose build → docker compose up -d`
and waits for healthy. Idempotent and safe to re-run.

Frontend redeploys are automatic on push to `main` (Vercel-linked).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl https://.../health` times out | UFW or MilesWeb firewall blocking 80/443 | re-run step 2; check MilesWeb panel for any provider-level firewall |
| Cert never issued, Caddy says "challenge failed" | DuckDNS A record doesn't match VPS IP | run the DuckDNS update curl once manually, wait 2 min |
| 502 Bad Gateway from Caddy | sentinel-g-api unhealthy | `docker compose logs sentinel-g-api` — usually a missing env var or wrong Neo4j password |
| `cypher-shell` healthcheck fails for Neo4j | `NEO4J_AUTH` format | must be `user/password`, not `user:password` |
| OOM kill on any container | budget exceeded | `docker stats`; first lever is `NEO4J_server_memory_pagecache_size=512M` |
| `docker compose build` runs out of disk | unlikely on 100 GB but possible after months of builds | `docker system prune -af --volumes` |
| Frontend gets CORS error | `CORS_ALLOWED_ORIGINS` doesn't match Vercel URL exactly | edit `.env`, `docker compose up -d --force-recreate sentinel-g-api` |
| `/analyse/<cin>` returns 422 | malformed CIN | use 21-char CIN matching `^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$` |

---

## §A — `infra/vps/docker-compose.yml`

```yaml
# Sentinel-G — MilesWeb SM-L2 (or any x86_64 KVM VPS, 8 GB+) single-VM stack.
# Neo4j 5 + GDS, FastAPI, Caddy auto-SSL all on one box.

services:
  neo4j:
    image: neo4j:5.20-community
    container_name: sentinel-g-neo4j
    restart: unless-stopped
    environment:
      NEO4J_AUTH: ${NEO4J_AUTH}
      NEO4J_PLUGINS: '["graph-data-science"]'
      NEO4J_dbms_security_procedures_unrestricted: "gds.*,apoc.*"
      NEO4J_dbms_security_procedures_allowlist: "gds.*,apoc.*"
      # 8 GB total: leave plenty for FastAPI + torch resident set.
      NEO4J_server_memory_heap_initial__size: "2G"
      NEO4J_server_memory_heap_max__size: "4G"
      NEO4J_server_memory_pagecache_size: "1G"
    volumes:
      - ./neo4j-data:/data
      - ./neo4j-logs:/logs
      - ./neo4j-plugins:/plugins
    expose:
      - "7687"
      - "7474"
    healthcheck:
      test: ["CMD-SHELL", "cypher-shell -u neo4j -p $${NEO4J_AUTH##*/} 'RETURN 1' || exit 1"]
      interval: 20s
      timeout: 10s
      retries: 10
      start_period: 60s
    mem_limit: 5g

  sentinel-g-api:
    build:
      context: ../..
      dockerfile: backend/Dockerfile
    image: sentinel-g-api:vps-local
    container_name: sentinel-g-api
    restart: unless-stopped
    env_file: .env
    environment:
      NEO4J_URI: bolt://neo4j:7687
    expose:
      - "8000"
    depends_on:
      neo4j:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 6
      start_period: 30s
    mem_limit: 2500m
    mem_reservation: 1g

  caddy:
    image: caddy:2-alpine
    container_name: sentinel-g-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      DOMAIN: ${DOMAIN}
    depends_on:
      sentinel-g-api:
        condition: service_healthy
    mem_limit: 128m

volumes:
  caddy_data:
  caddy_config:
```

---

## §B — `infra/vps/.env.example`

```bash
# Sentinel-G — MilesWeb SM-L2 deployment env template.
# Copy to .env, fill every value, then `docker compose up -d`.

# Caddy reverse-proxy
DOMAIN=<your-slug>.duckdns.org

# Neo4j (co-located on this VPS — talks over the Docker network)
NEO4J_AUTH=neo4j/<set-a-strong-password>
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<same-password>
NEO4J_DATABASE=neo4j

# FastAPI auth
JWT_SECRET=<run: python3 -c "import secrets; print(secrets.token_hex(32))">
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24
RATE_LIMIT_PER_MIN=10

# Gemini Flash narrative
GEMINI_API_KEY=<from https://aistudio.google.com/apikey>
GEMINI_MODEL=gemini-1.5-flash

# CORS — exact Vercel production URL after step 9
CORS_ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app

# 8 GB absorbs the source-side scheduler comfortably
SCHEDULER_ENABLED=true

# App env
APP_ENV=prod
LOG_LEVEL=INFO
TIMEZONE=Asia/Kolkata
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
```

---

## §C — `infra/vps/deploy.sh`

```bash
#!/usr/bin/env bash
# Sentinel-G — MilesWeb VPS one-shot redeploy.
# Run from infra/vps/ on the VPS. Pulls origin/main, rebuilds the FastAPI
# image, rolls the API container, leaves Neo4j + Caddy untouched.
# Safe to re-run.

set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "ERROR: .env missing in $(pwd). Copy .env.example to .env and fill it in." >&2
  exit 1
fi

echo "[deploy] git pull..."
git -C ../.. pull --ff-only

echo "[deploy] docker compose build sentinel-g-api..."
docker compose build sentinel-g-api

echo "[deploy] docker compose up -d..."
docker compose up -d --remove-orphans

echo "[deploy] waiting for sentinel-g-api to report healthy..."
for i in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' sentinel-g-api 2>/dev/null || echo "starting")
  if [[ "$status" == "healthy" ]]; then
    echo "[deploy] sentinel-g-api healthy (after ${i}0s)"
    break
  fi
  sleep 10
done

echo "[deploy] current state:"
docker compose ps

echo
DOMAIN_VAL=$(grep -E '^DOMAIN=' .env | head -1 | cut -d= -f2-)
if [[ -n "${DOMAIN_VAL:-}" ]]; then
  curl -fsS -o /dev/null -w "  /health -> HTTP %{http_code} in %{time_total}s\n" \
    "https://${DOMAIN_VAL}/health" || echo "  /health probe failed — check 'docker compose logs caddy'"
fi
```

Make executable: `chmod +x infra/vps/deploy.sh`.

---

## Cost recap

| Item | Cost | Total |
|---|---|---|
| MilesWeb SM-L2 (intro month 1) | ₹749 | ₹749 |
| MilesWeb SM-L2 (month 2 — renewal rate, worst case) | ₹1,149 | ₹1,898 |
| MilesWeb SM-L2 (month 2 — intro extended via 2-mo prepay if available) | ₹749 | ₹1,498 |
| Neo4j 5 Community + GDS | $0 | $0 |
| Caddy + Let's Encrypt | $0 | $0 |
| DuckDNS subdomain | $0 | $0 |
| UptimeRobot monitor | $0 | $0 |
| Vercel Hobby (frontend, already live) | $0 | $0 |
| **2-month total (worst case)** | | **~₹1,898 (~$22)** |
| **2-month total (best case, prepaid 2 mo)** | | **~₹1,498 (~$18)** |

Payment in INR via UPI. No credit card. No laptop. No cold starts. Full
PRD compliance including the GDS plugin. Judges can hit the URL any time
across the 2-month window.

---

## Sources (verified May 2026)

- [MilesWeb VPS pricing](https://www.milesweb.in/hosting/vps-hosting/price)
- [MilesWeb payment methods — UPI confirmed](https://www.milesweb.in/payment-methods)
- [Hostinger India VPS (fallback)](https://www.hostinger.com/in/vps-hosting)
- [Neo4j GDS plugin Docker install](https://neo4j.com/docs/graph-data-science/current/installation/installation-docker/)
- [DuckDNS free subdomain service](https://www.duckdns.org/)
- [Caddy auto-SSL via ACME](https://caddyserver.com/docs/automatic-https)
