#!/bin/bash
#
# deploy.sh [prod|staging] — deployt die Script-App auf die gewählte Umgebung.
#
#   prod    → /srv/script          · PM2 script-backend          · Port 3014
#   staging → /srv/script-staging  · PM2 script-backend-staging  · Port 3114
#
# Eigenschaften:
#   - flock-Lock: keine parallelen Deploys derselben Umgebung
#   - npm ci nur wenn package-lock.json sich geändert hat (sonst nur Build → schnell, kein Chromium-Reload)
#   - Build VOR Restart (set -e): kaputter Code wird nie live geschaltet
#   - Restart nur wenn backend/ geändert wurde (Frontend ist statisch → kein Restart)
#   - Health-Check nach Deploy
#   - Prod: Rollback-Tag auf den vorherigen Stand (git tag prod-<datum>)
#
set -euo pipefail

ENV="${1:-prod}"
REF="${2:-}"   # optionaler Branch/Ref — NUR Staging; Prod deployt immer main
case "$ENV" in
  prod)    DIR=/srv/script;         PM2=script-backend;         PORT=3014 ;;
  staging) DIR=/srv/script-staging; PM2=script-backend-staging; PORT=3114 ;;
  *) echo "Usage: deploy.sh [prod|staging] [branch]"; exit 1 ;;
esac

if [ -n "$REF" ] && [ "$ENV" = "prod" ]; then
  echo "✗ Prod deployt ausschließlich main — kein Branch-Argument erlaubt."; exit 1
fi

# Lock pro Umgebung
exec 9>"/tmp/deploy-script-$ENV.lock"
flock -n 9 || { echo "✗ Deploy ($ENV) läuft bereits — abgebrochen."; exit 1; }

cd "$DIR"
OLD=$(git rev-parse HEAD)
echo "▶ Deploy $ENV ($DIR) — Stand vorher: ${OLD:0:7}"
if [ -n "$REF" ]; then
  echo "▶ Branch-Deploy (nur Staging): $REF"
  git fetch origin "$REF"
  git checkout -B "$REF" "origin/$REF"
else
  git pull origin main          # unverändertes Default-Verhalten (Prod + Staging/main)
fi
NEW=$(git rev-parse HEAD)

if [ "$OLD" = "$NEW" ]; then
  echo "✓ Kein neuer Commit — nichts zu deployen."
  exit 0
fi
echo "▶ Neuer Stand: ${NEW:0:7}"

# Rollback-Tag (nur Prod) auf den alten Stand
if [ "$ENV" = "prod" ]; then
  git tag -f "prod-$(date +%Y%m%d-%H%M%S)" "$OLD" >/dev/null 2>&1 || true
fi

CHANGED=$(git diff "$OLD" "$NEW" --name-only)
BACKEND_CHANGED=$(echo "$CHANGED" | grep -q '^backend/'  && echo 1 || echo 0)
FRONTEND_CHANGED=$(echo "$CHANGED" | grep -q '^frontend/' && echo 1 || echo 0)

if [ "$BACKEND_CHANGED" = 0 ] && [ "$FRONTEND_CHANGED" = 0 ]; then
  echo "✓ Weder backend/ noch frontend/ geändert — kein Build nötig."
  exit 0
fi

if [ "$BACKEND_CHANGED" = 1 ]; then
  echo "▶ Backend build…"
  cd backend
  if echo "$CHANGED" | grep -q '^backend/package-lock.json' || [ ! -d node_modules ]; then
    echo "  (package-lock geändert → npm ci)"; npm ci
  fi
  npm run build
  cd ..
fi

if [ "$FRONTEND_CHANGED" = 1 ]; then
  echo "▶ Frontend build…"
  cd frontend
  if echo "$CHANGED" | grep -q '^frontend/package-lock.json' || [ ! -d node_modules ]; then
    echo "  (package-lock geändert → npm ci)"; npm ci
  fi
  npx vite build
  cd ..
fi

# Restart nur bei Backend-Änderung (Frontend ist statisch)
if [ "$BACKEND_CHANGED" = 1 ]; then
  echo "▶ Restart $PM2…"
  pm2 restart "$PM2" --update-env || pm2 start backend/ecosystem.config.cjs
fi

# Health-Check
echo "▶ Health-Check (Port $PORT)…"
for i in $(seq 1 15); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "✓ $ENV gesund nach ${i}s — jetzt auf ${NEW:0:7}"
    exit 0
  fi
  sleep 1
done
echo "✗ Health-Check fehlgeschlagen! Prüfe: pm2 logs $PM2"
exit 1
