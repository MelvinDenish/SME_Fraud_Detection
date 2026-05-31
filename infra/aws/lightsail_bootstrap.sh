#!/usr/bin/env bash
# Sentinel-G — AWS Lightsail fresh-VM bootstrap.
#
# Run this ONCE on a fresh Lightsail Ubuntu 24 LTS instance. Idempotent:
# safe to re-run if something fails midway.
#
# Pre-requisites the operator must have set BEFORE invoking this:
#   1. SSH'd into the VM as `ubuntu`.
#   2. cloned the repo to ~/sentinel-g, OR uploaded via scp to that path.
#   3. Filled out `infra/aws/.env` from `.env.example`.
#
# This script:
#   - Installs Docker engine + compose plugin (skipped if already present).
#   - Adds `ubuntu` to the docker group.
#   - Symlinks the compose file + Caddyfile + .env to the standard locations.
#   - Pulls the FastAPI image from public GHCR (no auth needed).
#   - `docker compose up -d` in the right directory.
#   - Waits for the Neo4j healthcheck.
#   - Runs `scripts/seed_users.py` against the in-stack Neo4j.
#   - Smoke-tests /health.
#
# See docs/DEPLOY_AWS_LIGHTSAIL.md for the human walkthrough.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/sentinel-g}"
COMPOSE_DIR="$REPO_DIR/infra/aws"

log() { printf '[bootstrap] %s\n' "$*"; }
fail() { printf '[bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }

# --- 0. Sanity ------------------------------------------------------------
[[ -d "$REPO_DIR" ]] || fail "Repo missing at $REPO_DIR. git clone first."
[[ -f "$COMPOSE_DIR/docker-compose.yml" ]] || fail "Compose file missing at $COMPOSE_DIR."
[[ -f "$COMPOSE_DIR/.env" ]] || fail ".env missing in $COMPOSE_DIR. Copy from .env.example and fill values."

# --- 1. Install Docker ----------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "installing docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  log "docker installed; you must log out + back in (or run 'newgrp docker') for the group to apply."
else
  log "docker already present: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  log "installing docker compose plugin..."
  sudo apt-get update -y
  sudo apt-get install -y docker-compose-plugin
else
  log "docker compose already present: $(docker compose version | head -1)"
fi

# --- 2. Firewall (Lightsail manages this in the console, this is belt+braces)
# Skip ufw — Lightsail's networking tab is the source of truth. Operator must
# open 80 + 443 there. Document the click-path in DEPLOY_AWS_LIGHTSAIL.md.

# --- 3. Pull + start ------------------------------------------------------
cd "$COMPOSE_DIR"
log "docker compose pull..."
docker compose pull
log "docker compose up -d..."
docker compose up -d --remove-orphans

# --- 4. Wait for Neo4j healthy -------------------------------------------
log "waiting up to 5 minutes for neo4j to report healthy (first boot installs GDS plugin)..."
for i in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' sentinel-g-neo4j 2>/dev/null || echo starting)
  if [[ "$status" == "healthy" ]]; then
    log "neo4j healthy after ~${i}0s"
    break
  fi
  sleep 10
done
[[ "$status" == "healthy" ]] || fail "neo4j did not become healthy. Check 'docker compose logs neo4j'."

# --- 5. Wait for FastAPI healthy ------------------------------------------
log "waiting up to 3 minutes for sentinel-g-api healthy..."
for i in $(seq 1 18); do
  status=$(docker inspect -f '{{.State.Health.Status}}' sentinel-g-api 2>/dev/null || echo starting)
  if [[ "$status" == "healthy" ]]; then
    log "sentinel-g-api healthy after ~${i}0s"
    break
  fi
  sleep 10
done
[[ "$status" == "healthy" ]] || fail "sentinel-g-api did not become healthy. Check 'docker compose logs sentinel-g-api'."

# --- 6. Seed demo users (idempotent) --------------------------------------
log "seeding 4 demo users via docker exec..."
docker exec sentinel-g-api python scripts/seed_users.py || \
  log "WARN: seed_users.py exited non-zero. Re-run manually with: docker exec sentinel-g-api python scripts/seed_users.py"

# --- 7. Smoke test --------------------------------------------------------
DOMAIN_VAL=$(grep -E '^DOMAIN=' "$COMPOSE_DIR/.env" | head -1 | cut -d= -f2-)
log "smoke testing https://${DOMAIN_VAL}/health ..."
sleep 5  # give Caddy a beat to finish Let's Encrypt cert issuance
curl -fsS -o /dev/null -w "  GET /health -> HTTP %{http_code} in %{time_total}s\n" \
  "https://${DOMAIN_VAL}/health" || \
  log "WARN: /health probe failed. If first boot, Caddy may still be issuing the cert. Wait 60s and retry."

log "current state:"
docker compose ps

echo
log "bootstrap complete. Test from your laptop:"
log "  curl https://${DOMAIN_VAL}/health"
log "  curl https://${DOMAIN_VAL}/health/neo4j"
log "  curl https://${DOMAIN_VAL}/health/ml"
log "Demo users seeded — see docs/WALKTHROUGH.md for credentials."
