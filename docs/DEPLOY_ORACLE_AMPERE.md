# Deploying Sentinel-G to Oracle Cloud — Ampere A1 (single VM, free forever)

> Companion to [DEPLOY_ORACLE.md](DEPLOY_ORACLE.md) (AMD micro path). This
> document covers the **single-VM Ampere A1** path that runs **both
> FastAPI and Neo4j 5 + GDS on the same box** — no Railway, no second
> compute host, no recurring bill. Verified live against Oracle and Neo4j
> docs in May 2026; sources cited at the end.

## Why Ampere over the AMD path

| | AMD `VM.Standard.E2.1.Micro` (the existing path) | Ampere `VM.Standard.A1.Flex` (this doc) |
|---|---|---|
| Free-tier quota | 2 instances × 1 OCPU / 1 GB RAM each | Up to 4 instances summed to **4 OCPU / 24 GB RAM** |
| Architecture | x86_64 (amd64) | ARM64 (aarch64) |
| Can host Neo4j 5 + GDS + FastAPI together | ❌ 1 GB is below Neo4j's heap minimum + FastAPI's footprint | ✅ comfortably — 24 GB RAM, 4 OCPU |
| External Neo4j needed (Railway / AuraDB) | Yes (Railway free credits, or paid AuraDB Pro) | **No.** Self-host on the same VM. |
| Always-free for life | Yes | Yes |
| Capacity | Usually instant | "Out of host capacity" common; provisioning needs persistence (see §1) |
| Recurring cost | $0 if you don't bring up Railway | $0 |

If you can get Ampere capacity (often takes a day or two of retries in
popular regions), it's the clean path. The existing `DEPLOY_ORACLE.md`
plus a Railway Neo4j remains the fallback while you wait.

## Prerequisites

- Oracle Cloud Always Free account in any region. Frankfurt / Singapore /
  Mumbai typically provision Ampere quickest in 2026.
- A working SSH keypair (`.pem` or `.pub` + `.key`).
- Local Git + Docker for one-time seeding from your laptop.
- (Optional but recommended) a DuckDNS account (free, GitHub OAuth) for
  the free subdomain + Let's Encrypt auto-SSL.

---

## 1. Provision the Ampere A1 instance (≈ 15 min if lucky, days if not)

OCI Console → **Compute → Instances → Create instance**:

| Field | Value |
|---|---|
| Image | Canonical Ubuntu 22.04 LTS (or 24.04 LTS) |
| Shape | **VM.Standard.A1.Flex** (Ampere) |
| OCPU count | **4** (full free allocation in one VM) |
| Memory (GB) | **24** |
| Boot volume size (GB) | 100 (well within the 200 GB free pool) |
| SSH keys | Upload your public key |
| Networking | Default VCN, public IPv4 assigned |

Click **Create**. If you see **"Out of host capacity"**, do not give up:

- Retry every 10–60 minutes; Oracle releases capacity in bursts.
- Persistence helper (community-maintained, runs in your laptop's shell):
  ```bash
  # See: https://hitrov.medium.com/resolving-oracle-cloud-out-of-capacity-issue-...
  while true; do
    oci compute instance launch --from-json file://launch.json && break
    sleep 60
  done
  ```
- Or switch availability domain / region.

Once it boots, note the public IPv4 address.

---

## 2. Open ports + lock down the OS

### 2a. VCN security list (Oracle Console)

OCI Console → **Networking → VCNs → your VCN → Security Lists → Default →
Add Ingress Rules**:

| Source CIDR | Protocol | Port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |
| `<your-laptop-IP>/32` | TCP | 7474 (Neo4j Browser — **only** while seeding) |
| `<your-laptop-IP>/32` | TCP | 7687 (Bolt — **only** while seeding) |

After the one-time seed (§7), **remove the 7474 / 7687 rules**. Neo4j
should never face the public internet — FastAPI talks to it on the Docker
network, not via the host's public IP.

### 2b. OS firewall (THIS IS THE STEP EVERYONE MISSES)

SSH in (`ssh -i ~/path/to/key.pem ubuntu@<public-ip>`), then:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

If you're on Oracle Linux 8/9 instead of Ubuntu:
```bash
sudo firewall-cmd --add-port=80/tcp  --permanent
sudo firewall-cmd --add-port=443/tcp --permanent
sudo firewall-cmd --reload
```

---

## 3. Install Docker (ARM64-aware)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo systemctl enable --now docker
exit
ssh -i ~/path/to/key.pem ubuntu@<public-ip>
docker --version           # verify
docker compose version     # verify v2
uname -m                   # confirm aarch64
```

`get.docker.com` auto-detects ARM64 and pulls the correct packages — no
manual selection needed.

---

## 4. DuckDNS subdomain (≈ 5 min)

Visit [duckdns.org](https://www.duckdns.org), sign in with GitHub, claim
`<your-slug>.duckdns.org`. Copy the token from the home page.

On the VM:
```bash
TOKEN=<your-duckdns-token>
SLUG=<your-slug>

# Pin the A record to this VM's IP
curl "https://www.duckdns.org/update?domains=$SLUG&token=$TOKEN&ip="

# Keep it fresh every 5 minutes (Oracle never changes the public IP on free
# VMs, but it's cheap insurance)
(crontab -l 2>/dev/null; \
 echo "*/5 * * * * curl -s 'https://www.duckdns.org/update?domains=$SLUG&token=$TOKEN&ip=' >/dev/null") \
 | crontab -
```

Verify: `dig +short $SLUG.duckdns.org` should return the VM's public IP.

---

## 5. Clone the repo

```bash
git clone https://github.com/MelvinDenish/SME_Fraud_Detection.git
cd SME_Fraud_Detection
```

---

## 6. Single docker-compose for Neo4j + FastAPI + Caddy

The existing `infra/oracle/docker-compose.yml` is tuned for the 1 GB AMD
box and pulls a pre-built amd64 image from GHCR. On Ampere we want **two
differences**:

1. Add a `neo4j` service co-located on the VM.
2. **Build the FastAPI image locally** rather than pulling — GHCR
   currently publishes `linux/amd64` only (see
   [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml)),
   so an ARM64 box has to compile the image itself. With 24 GB RAM the
   torch + lightgbm wheel install is comfortable.

Create `infra/oracle/docker-compose.ampere.yml`:

```yaml
# Sentinel-G — Ampere A1 single-VM stack.
# Neo4j 5 + GDS, FastAPI, and Caddy auto-SSL on one box.
# Target: VM.Standard.A1.Flex (4 OCPU / 24 GB RAM, aarch64).

services:
  neo4j:
    image: neo4j:5.20-community           # ARM64 official image; GDS-compatible
    container_name: sentinel-g-neo4j
    restart: unless-stopped
    environment:
      NEO4J_AUTH: ${NEO4J_AUTH}           # e.g. neo4j/<strong-password>
      NEO4J_PLUGINS: '["graph-data-science"]'
      NEO4J_dbms_security_procedures_unrestricted: "gds.*,apoc.*"
      NEO4J_dbms_security_procedures_allowlist: "gds.*,apoc.*"
      # 24 GB total: leave plenty for FastAPI + torch resident set.
      NEO4J_server_memory_heap_initial__size: "2G"
      NEO4J_server_memory_heap_max__size: "4G"
      NEO4J_server_memory_pagecache_size: "2G"
    volumes:
      - ./neo4j-data:/data
      - ./neo4j-logs:/logs
      - ./neo4j-plugins:/plugins
    # No public ports — FastAPI reaches it on the Docker network.
    expose:
      - "7687"
      - "7474"
    healthcheck:
      test: ["CMD-SHELL", "cypher-shell -u neo4j -p $${NEO4J_AUTH##*/} 'RETURN 1' || exit 1"]
      interval: 20s
      timeout: 10s
      retries: 10
      start_period: 60s
    mem_limit: 7g

  sentinel-g-api:
    build:
      context: ../..
      dockerfile: backend/Dockerfile
    image: sentinel-g-api:ampere-local
    container_name: sentinel-g-api
    restart: unless-stopped
    env_file: .env
    environment:
      # Override .env's NEO4J_URI so the API talks to the in-compose service.
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
    mem_limit: 6g
    mem_reservation: 1g

  caddy:
    image: caddy:2-alpine
    container_name: sentinel-g-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"          # HTTP/3
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

The existing `infra/oracle/Caddyfile` works unchanged — it already
reverse-proxies `{$DOMAIN} → sentinel-g-api:8000`.

> **Note on the `neo4j:5.20-community` pin.** A 2025 bug (neo4j/neo4j#13563)
> blocks GDS install into Neo4j 5.26.0's Docker image. Stay on the 5.20
> line until the upstream fix lands. The 5.20 ARM64 image is published on
> Docker Hub and supports the same GDS 2.x line we use throughout the
> repo.

---

## 7. Configure `.env`

```bash
cd infra/oracle
cp .env.example .env
nano .env
```

For Ampere with co-located Neo4j, fill it like this — note the differences
from the AMD path (Neo4j now talks over the Docker network, not Railway):

```bash
# Caddy
DOMAIN=<your-slug>.duckdns.org

# Neo4j (co-located on this VM)
NEO4J_AUTH=neo4j/<paste-a-strong-password>
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<the-same-password>
NEO4J_DATABASE=neo4j

# FastAPI auth — generate locally with `python -c "import secrets; print(secrets.token_hex(32))"`
JWT_SECRET=<64-hex-chars>
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24
RATE_LIMIT_PER_MIN=10

# Gemini Flash (free tier, 60 req/min)
GEMINI_API_KEY=<from https://aistudio.google.com/apikey>
GEMINI_MODEL=gemini-1.5-flash

# CORS — set after Vercel deploy
CORS_ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app

# Scheduler — safe to leave ON; 24 GB RAM absorbs it
SCHEDULER_ENABLED=true

# App env
APP_ENV=prod
LOG_LEVEL=INFO
TIMEZONE=Asia/Kolkata
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
```

---

## 8. Bring the stack up

```bash
cd infra/oracle

# Build the FastAPI image locally (≈ 5–10 min for the first torch+lightgbm install)
docker compose -f docker-compose.ampere.yml build sentinel-g-api

# Boot everything in dependency order
docker compose -f docker-compose.ampere.yml up -d

# Watch the stack become healthy (Neo4j first, then the API, then Caddy)
docker compose -f docker-compose.ampere.yml ps
docker compose -f docker-compose.ampere.yml logs -f caddy        # wait for "certificate obtained"
```

Once Caddy reports the certificate issued (≈ 30 s after the domain points
correctly), smoke-test from your laptop:

```bash
curl -i https://<your-slug>.duckdns.org/health
# HTTP/2 200, valid Let's Encrypt chain
```

---

## 9. Seed Neo4j (one-time)

Until you remove the 7474 / 7687 ingress rules from §2a, you can seed
remotely from your laptop the same way the AMD path documents:

```bash
# .env.local on your laptop with:
#   NEO4J_URI=bolt://<your-slug>.duckdns.org:7687
#   NEO4J_PASSWORD=<the-password-you-set-in-step-7>
.venv/Scripts/python.exe scripts/seed_neo4j.py --clean
```

Or seed from inside the VM (more secure — no public Bolt exposure
needed):

```bash
ssh ubuntu@<public-ip>
cd ~/SME_Fraud_Detection/infra/oracle
docker compose -f docker-compose.ampere.yml exec sentinel-g-api \
  python scripts/seed_neo4j.py --clean
```

The in-container path uses the Docker network's `bolt://neo4j:7687` —
no public exposure required.

Verify:
```bash
curl https://<your-slug>.duckdns.org/analyse/U45201MH2005PTC155294 \
  | python -m json.tool | grep -E "fraud_risk_score|risk_band"
# Expect: 75.0, "CRITICAL"
```

After this succeeds, **delete the 7474 + 7687 ingress rules** from §2a.
Future seeds use the `docker compose exec` form.

---

## 10. Close the CORS loop (Vercel)

After Vercel finishes deploying the frontend, copy its production URL
(e.g. `https://sentinel-g.vercel.app`) and:

```bash
ssh ubuntu@<public-ip>
cd ~/SME_Fraud_Detection/infra/oracle
nano .env
# set: CORS_ALLOWED_ORIGINS=https://<actual-vercel-url>
docker compose -f docker-compose.ampere.yml up -d --force-recreate sentinel-g-api
```

Also set the build-time env in Vercel:
```bash
vercel env add VITE_API_BASE production
# paste: https://<your-slug>.duckdns.org
vercel --prod
```

---

## 11. Redeploys

After a backend commit lands on `main`:

```bash
ssh ubuntu@<public-ip>
cd ~/SME_Fraud_Detection
git pull --ff-only
cd infra/oracle
docker compose -f docker-compose.ampere.yml build sentinel-g-api
docker compose -f docker-compose.ampere.yml up -d sentinel-g-api
docker compose -f docker-compose.ampere.yml ps
```

A wrapper `infra/oracle/deploy.sh` exists for the AMD path; adapt it by
adding `-f docker-compose.ampere.yml` to each `docker compose` call.

Frontend redeploys are automatic on push to `main` if the Vercel project
is linked.

---

## 12. Resource budget — eyeballed at the demo scale

| Container | mem_limit | typical RSS | notes |
|---|---|---|---|
| `neo4j` | 7 GB | 3–4 GB with heap 2–4 GB + pagecache 2 GB + GDS scratch | GDS in-memory graphs need headroom; raise heap to 6 GB if you start running heavier algorithms. |
| `sentinel-g-api` | 6 GB | 1.5–3 GB (torch + lightgbm + spacy resident) | Each `/analyse` fan-out spikes briefly; keep `RATE_LIMIT_PER_MIN=10` until you've measured. |
| `caddy` | 128 MB | < 50 MB | Idle 99 % of the time. |
| Host OS overhead | — | ~ 500 MB | Ubuntu + Docker daemon. |
| **Total** | **~ 13 GB cap, ~ 8 GB typical** | leaves 11 GB free | Plenty of headroom on 24 GB. |

If memory pressure ever bites (`docker stats` shows containers near their
caps), the first lever is dropping `NEO4J_server_memory_pagecache_size`
to `1G` — at ~50 demo CINs the pagecache is overprovisioned.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl https://.../health` times out | iptables blocking 80/443 | redo §2b |
| Cert never issued, Caddy log says "challenge failed" | DuckDNS A record doesn't match VM IP | run the DuckDNS update curl once manually, wait 2 min |
| 502 Bad Gateway from Caddy | sentinel-g-api container unhealthy | `docker compose logs sentinel-g-api` — usually a missing env var or Neo4j auth |
| `cypher-shell` exec fails in Neo4j healthcheck | wrong `NEO4J_AUTH` format | must be `user/password`, not `user:password` |
| GDS install errors at startup | upstream bug if pinned to `5.26.0` | use `neo4j:5.20-community` per §6 |
| `docker compose build` runs out of disk | 50 GB boot volume too small | expand boot volume to 100 GB in OCI Console (free pool is 200 GB) |
| FastAPI image build fails on `lightgbm`/`torch` wheel | wheel resolution for ARM64 | upstream wheels exist; if not, fall back to multi-stage build with `build-essential` (already in `backend/Dockerfile`) |
| Frontend gets CORS error | `CORS_ALLOWED_ORIGINS` doesn't match the exact Vercel URL | edit `.env`, force-recreate the API container |
| OOM kill on any container | budget exceeded | check `docker stats`; lower `NEO4J_server_memory_pagecache_size` first |

---

## When you should NOT use this path

- You can't get Ampere capacity after a week of retries. Fall back to
  AMD + Railway-Neo4j per `DEPLOY_ORACLE.md`.
- You want the same image to run on both AMD and Ampere boxes (rare).
  Then update `.github/workflows/docker-publish.yml` to produce a
  multi-arch image:
  ```yaml
  platforms: linux/amd64,linux/arm64
  ```
  and pull from GHCR instead of building locally on Ampere.
- Your demo CIN universe grows past ~ 50k companies. The 4 OCPU / 24 GB
  Ampere quota is still ample for that, but at the millions-of-nodes
  scale, Neo4j wants dedicated hardware. Not a concern for HackHazards.

---

## Files referenced

- [`docs/DEPLOY_ORACLE.md`](DEPLOY_ORACLE.md) — sibling doc, AMD-micro path.
- [`infra/oracle/docker-compose.yml`](../infra/oracle/docker-compose.yml) — AMD compose.
- `infra/oracle/docker-compose.ampere.yml` — Ampere compose to create per §6.
- [`infra/oracle/Caddyfile`](../infra/oracle/Caddyfile) — used unchanged.
- [`infra/oracle/.env.example`](../infra/oracle/.env.example) — template; edit per §7.
- [`backend/Dockerfile`](../backend/Dockerfile) — already multi-arch-capable; built locally on the VM.
- [`scripts/seed_neo4j.py`](../scripts/seed_neo4j.py) — seeding script.
- [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) — produces amd64-only at present; bump to multi-arch when needed.

---

## Sources (verified May 2026)

- Oracle Cloud Free Tier — quota & shape limits:
  - [docs.oracle.com Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
  - [oracle.com/cloud/free FAQ](https://www.oracle.com/cloud/free/faq/)
  - [Out-of-capacity workaround (Hitrov)](https://hitrov.medium.com/resolving-oracle-cloud-out-of-capacity-issue-and-getting-free-vps-with-4-arm-cores-24gb-of-a3d7e6a027a8)
- Neo4j ARM64 Docker images — confirmed available since 4.4.0:
  - [neo4j/docker-neo4j README](https://github.com/neo4j/docker-neo4j)
  - [hub.docker.com/r/arm64v8/neo4j](https://hub.docker.com/r/arm64v8/neo4j)
- Neo4j GDS plugin Docker install:
  - [neo4j.com/docs Graph Data Science — Docker](https://neo4j.com/docs/graph-data-science/current/installation/installation-docker/)
- Neo4j 5.26 GDS install bug (the reason to pin 5.20):
  - [neo4j/neo4j issue #13563](https://github.com/neo4j/neo4j/issues/13563)
