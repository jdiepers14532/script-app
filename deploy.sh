#!/bin/bash
set -e
cd /srv/script
git pull origin main

# Check what changed
CHANGED=$(git diff HEAD@{1} HEAD --name-only 2>/dev/null || echo "all")

if echo "$CHANGED" | grep -q "^backend/" || [ "$CHANGED" = "all" ]; then
  echo "Building backend..."
  cd backend && npm ci && npm run build && cd ..
  pm2 restart script-backend --update-env || pm2 start backend/ecosystem.config.cjs
fi

if echo "$CHANGED" | grep -q "^frontend/" || [ "$CHANGED" = "all" ]; then
  echo "Building frontend..."
  cd frontend && npm ci && npx vite build && cd ..
fi

echo "Deploy done"
