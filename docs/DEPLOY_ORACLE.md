# Deploying Sentinel-G to Oracle Cloud Free Tier

> PRD §10 Day 28 deployment runbook. Target VM: **VM.Standard.E2.1.Micro**
> (1/8 OCPU, 1 GB RAM, x86_64). Estimated operator time: 2–3 hours.

Three platforms must be live before the demo:
1. **Railway** — Neo4j 5 + GDS (the data store).
2. **Oracle Cloud** — FastAPI backend behind Caddy auto-SSL (this doc).
3. **Vercel** — React frontend (small section at the end).

This doc covers all three. Do them in the order below — each step depends
on output from the prior one.

---

## 0. Prerequisites

- An Oracle Cloud Always Free account with **VM.Standard.E2.1.Micro**
  provisioned (Ubuntu 22.04 LTS recommended). You have the `.pem` SSH key.
- A Railway account (free tier, $5 in monthly credit).
- A Vercel account (free Hobby tier).
- A DuckDNS account (free, GitHub OAuth — no card).
- Git + Docker on your laptop (for local seeding only).
- The repo cloned locally for final smoke tests.

---

## 1. Railway — Neo4j (≈ 15 min)

```bash
npm i -g @railway/cli
railway login                       # opens browser   
```

In the Railway web console (railway.app → New Project → Empty Project):

1. **+ New** → **Database** → **Add Custom** → image `neo4j:5.20-community`.
2. Open the service → **Variables** tab → add:

   | Key | Value |
   |---|---|
   | `NEO4J_AUTH` | `neo4j/<pick-a-strong-password>` |
   | `NEO4J_PLUGINS` | `["graph-data-science"]` |
   | `NEO4J_dbms_security_procedures_unrestricted` | `gds.*,apoc.*` |
   | `NEO4J_dbms_security_procedures_allowlist` | `gds.*,apoc.*` |
   | `NEO4J_server_memory_heap_max__size` | `512M` |
   | `NEO4J_server_memory_pagecache_size` | `256M` |

3. **Settings → Volumes** → add 1 GB volume, mount path `/data`.
4. **Settings → Networking** → **Generate Domain** → choose **TCP Proxy** on port `7687`.

Copy the proxy host shown — looks like `roundhouse.proxy.rlwy.net:12345`.

**Outputs you keep:**
- `NEO4J_URI = bolt://<host>:<port>`
- `NEO4J_USER = neo4j`
- `NEO4J_PASSWORD = <whatever you set>`

---

## 2. Oracle Cloud — FastAPI (≈ 2 hours)

### 2a. Open ports 80/443 in the OCI VCN (Console)

OCI Console → **Networking → Virtual Cloud Networks** → your VCN →
**Security Lists** → **Default Security List** → **Add Ingress Rules**:

| Source CIDR | IP Protocol | Destination Port Range |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

### 2b. SSH into the VM and open ports in iptables

> **THIS IS THE STEP EVERY OCI FIRST-TIMER MISSES.** The VCN rule above
> isn't enough — Oracle ships Ubuntu with iptables locked down.

```bash
ssh -i ~/path/to/your-key.pem ubuntu@<vm-public-ip>

sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

If you're on Oracle Linux 8 instead of Ubuntu:
```bash
sudo firewall-cmd --add-port=80/tcp  --permanent
sudo firewall-cmd --add-port=443/tcp --permanent
sudo firewall-cmd --reload
```

### 2c. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo systemctl enable --now docker
exit                                # log out + back in for group to apply
ssh -i ~/path/to/your-key.pem ubuntu@<vm-public-ip>
docker --version                    # sanity check
docker compose version
```

### 2d. DuckDNS subdomain

Visit https://www.duckdns.org → "Sign in with GitHub" → claim
`sentinel-g.duckdns.org` (or any free slug). Note the `token` shown on the
home page.

On the VM:
```bash
TOKEN=<your-duckdns-token>

# One-time pin of the current public IP
curl "https://www.duckdns.org/update?domains=sentinel-g&token=$TOKEN&ip="

# Keep the record current via cron
(crontab -l 2>/dev/null; \
 echo "*/5 * * * * curl -s 'https://www.duckdns.org/update?domains=sentinel-g&token=$TOKEN&ip=' >/dev/null") \
 | crontab -
```

### 2e. Publish the FastAPI image to GHCR (one-time)

Push to `main` triggers `.github/workflows/docker-publish.yml` which builds
the amd64 image and publishes to `ghcr.io/melvindenish/sme_fraud_detection`.

After the first successful workflow run:
1. GitHub → your profile → **Packages** → `sme_fraud_detection`.
2. **Package settings** → **Change visibility** → **Public**.

This lets the VM pull anonymously — no GHCR PAT needed on the VM. If you
prefer keeping the package private, instead run on the VM:

```bash
# fine-grained PAT with `read:packages` scope from GitHub → Settings → Developer settings
docker login ghcr.io -u melvindenish -p <ghcr-pat>
```

### 2f. Deploy the stack

```bash
git clone https://github.com/MelvinDenish/SME_Fraud_Detection.git
cd SME_Fraud_Detection/infra/oracle
cp .env.example .env
nano .env
```

Fill the `.env` template with:
- `DOMAIN=sentinel-g.duckdns.org`
- The three `NEO4J_*` values from step 1.
- `JWT_SECRET=` → run `python3 -c "import secrets; print(secrets.token_hex(32))"` locally.
- `GEMINI_API_KEY=` from https://aistudio.google.com/apikey.
- `CORS_ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app` — placeholder for now, you'll fix this after Vercel deploys in step 3.

Bring the stack up:
```bash
docker compose pull
docker compose up -d
```

### 2g. Smoke test

```bash
docker compose ps                   # both services should report healthy
docker compose logs -f caddy        # watch for "certificate obtained" line
```

From your laptop:
```bash
curl -i https://sentinel-g.duckdns.org/health
# HTTP/2 200 + valid Let's Encrypt cert chain
```

### 2h. Seed Neo4j from your laptop (one-time)

```bash
cd "<repo-root>"
# .env.local on your laptop with the Railway Neo4j credentials
./.venv/Scripts/python.exe scripts/seed_neo4j.py --clean
# Day-28 --clean wipes the DB then reseeds in <60s
```

Verify end-to-end:
```bash
curl https://sentinel-g.duckdns.org/analyse/U45201MH2005PTC155294 \
  | python -m json.tool | grep -E "fraud_risk_score|risk_band"
# Expect: 75.0 and "CRITICAL"
```

---

## 3. Vercel — React frontend (≈ 15 min)

```bash
npm i -g vercel
cd "<repo-root>/frontend"
vercel login
vercel                              # accept defaults; project name "sentinel-g"
```

Set the backend URL so the build wires every fetch call at the Oracle host:
```bash
vercel env add VITE_API_BASE production
# paste: https://sentinel-g.duckdns.org
vercel --prod                       # rebuild + deploy with the env var
```

Vercel prints the production URL — note it.

---

## 4. Close the CORS loop

Now that you have the Vercel URL, edit `.env` on the Oracle VM:
```bash
ssh -i ~/path/to/your-key.pem ubuntu@<vm-public-ip>
cd SME_Fraud_Detection/infra/oracle
nano .env
# change: CORS_ALLOWED_ORIGINS=https://<actual-vercel-url>
docker compose up -d --force-recreate sentinel-g-api
```

Open `https://<your-vercel-app>.vercel.app` in a browser, log in, paste
the IL&FS CIN (`U45201MH2005PTC155294`) — you should see the CRITICAL
dashboard with 18 evidence signals. The PRD §14 demo is now reproducible
from production.

---

## 5. Redeploys

When you ship a new backend commit:
1. Push to `main` → GitHub Actions rebuilds + republishes the GHCR image.
2. On the VM: `cd ~/SME_Fraud_Detection/infra/oracle && ./deploy.sh`.

`deploy.sh` does `git pull → docker compose pull → docker compose up -d`
and waits for `healthy`. Idempotent and safe to re-run.

When you ship a new frontend commit:
1. Vercel auto-deploys on push to `main` if the project is linked.
2. Otherwise: `cd frontend && vercel --prod`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl https://.../health` times out | iptables blocking 80/443 on VM | re-run step 2b |
| Cert never issued, Caddy log says "challenge failed" | DuckDNS A record doesn't match VM IP | run the DuckDNS update curl once manually, wait 2 min |
| 502 Bad Gateway from Caddy | sentinel-g-api container crashed | `docker compose logs sentinel-g-api` — usually a missing env var |
| Frontend gets CORS error | `CORS_ALLOWED_ORIGINS` doesn't match the exact Vercel URL | edit `.env`, `docker compose up -d --force-recreate sentinel-g-api` |
| `/analyse/<cin>` returns 422 | malformed CIN | use 21-char CIN matching `^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$` (Day 24 sanitisation) |
| `docker compose pull` says "denied" | GHCR package still private | flip to Public in GitHub package settings, or `docker login ghcr.io` |
| OOM kill on the FastAPI container | 1 GB RAM exceeded | check `docker stats`; set `SCHEDULER_ENABLED=false` in `.env` if it isn't already |

## Upgrading to Ampere later

If Oracle Ampere A1 capacity opens up:
1. Provision a new Ampere instance (4 OCPU, up to 24 GB RAM).
2. SSH in, run steps 2b–2d as above.
3. In `infra/oracle/docker-compose.yml`, replace the `image:` line on
   `sentinel-g-api` with:
   ```yaml
       build:
         context: ../..
         dockerfile: backend/Dockerfile
   ```
4. `docker compose up -d --build` — the 24 GB box compiles the image
   locally in a couple of minutes. GHCR workflow is no longer needed.

Everything else (Caddy, DuckDNS, env vars, CORS) carries over identically.
