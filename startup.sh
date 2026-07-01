#!/usr/bin/env bash
# ─── SemanticGuard AI — Azure App Service startup (Linux, Python/Oryx) ──────────
# Runs DB migrations, seeds RBAC roles (idempotent), then launches Gunicorn with
# the eventlet worker so Flask-SocketIO real-time features work behind App Service.
set -e

# Oryx extracts the compressed app to a temp dir and runs this script from there,
# so resolve the app root relative to this script rather than hardcoding wwwroot.
APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$APP_ROOT/backend"
DATA_DIR=/home/data

cd "$APP_DIR"

# Persistent SQLite location (/home is durable across restarts/scale operations).
mkdir -p "$DATA_DIR"

export FLASK_ENV="${FLASK_ENV:-production}"
export PYTHONPATH="$APP_DIR:${PYTHONPATH:-}"

echo "[startup] Applying database migrations..."
flask --app wsgi db upgrade || echo "[startup] WARN: 'db upgrade' failed; continuing."

echo "[startup] Seeding default roles/permissions (idempotent)..."
flask --app wsgi seed-roles || echo "[startup] WARN: 'seed-roles' failed; continuing."

echo "[startup] Launching Gunicorn (eventlet, 1 worker) on :8000..."
exec gunicorn \
    --worker-class eventlet \
    --workers 1 \
    --timeout 600 \
    --bind=0.0.0.0:8000 \
    --access-logfile '-' \
    --error-logfile '-' \
    wsgi:app
