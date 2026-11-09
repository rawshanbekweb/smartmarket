#!/usr/bin/env bash
# SMART MARKET — deploy a released version on the VPS (called by GitHub Actions over SSH,
# or by hand):   ./deploy.sh v1.2.0
#
# 1. back up the database (migrations are forward-only, so this is the way back)
# 2. pull the new images and restart
# 3. wait for /api/health; on failure roll back to the previous images
set -euo pipefail

cd "$(dirname "$0")"
TAG="${1:?usage: deploy.sh <image tag>}"
COMPOSE=(docker compose -f docker-compose.prod.yml)
PREV_FILE=.deployed_tag
PREV="$(cat "$PREV_FILE" 2>/dev/null || true)"

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

healthy() {
  for _ in $(seq 1 40); do
    if "${COMPOSE[@]}" exec -T api wget -qO- http://localhost:4000/api/health 2>/dev/null | grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 3
  done
  return 1
}

if [ -n "$PREV" ]; then
  log "pre-deploy backup"
  IMAGE_TAG="$PREV" "${COMPOSE[@]}" exec -T backup sh /usr/local/bin/backup.sh /backups
fi

log "deploying $TAG (previous: ${PREV:-none})"
export IMAGE_TAG="$TAG"
"${COMPOSE[@]}" pull api web
"${COMPOSE[@]}" up -d --remove-orphans

if healthy; then
  echo "$TAG" > "$PREV_FILE"
  docker image prune -f >/dev/null
  log "OK: $TAG is live"
  exit 0
fi

log "health check FAILED for $TAG"
"${COMPOSE[@]}" logs --tail=80 api || true
if [ -n "$PREV" ]; then
  log "rolling back to $PREV"
  export IMAGE_TAG="$PREV"
  "${COMPOSE[@]}" up -d
  if healthy; then log "rolled back to $PREV"; else log "ROLLBACK ALSO UNHEALTHY — manual action needed"; fi
  log "If a migration ran, restore the pre-deploy dump from ./backups (see docs/DEPLOY.md)."
fi
exit 1
