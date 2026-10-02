#!/usr/bin/env bash
# ─── SemanticGuard AI — Azure App Service startup (Linux, Python) ────────────────
# Runs DB migrations, seeds RBAC roles (idempotent), then launches Gunicorn with
# the gthread worker so Flask-SocketIO (threading mode) real-time features work
# behind App Service.
# Python dependencies are vendored in the deployment package (see the deploy
# workflow), so we run everything with `python -m ...` against PYTHONPATH rather
# than relying on Azure's server-side build or console-script shims.
set -e

# Oryx extracts the compressed app to a temp dir and runs this script from there,
# so resolve the app root relative to this script rather than hardcoding wwwroot.
APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$APP_ROOT/backend"
VENDOR_DIR="$APP_ROOT/.python_packages/lib/site-packages"
DATA_DIR=/home/data

cd "$APP_DIR"

# Persistent SQLite location (/home is durable across restarts/scale operations).
mkdir -p "$DATA_DIR"

export FLASK_ENV="${FLASK_ENV:-production}"
# Vendored dependencies take precedence over anything on the base image.
export PYTHONPATH="$APP_DIR:$VENDOR_DIR:${PYTHONPATH:-}"

echo "[startup] Applying database migrations..."
python -m flask --app wsgi db upgrade || echo "[startup] WARN: 'db upgrade' failed; continuing."

echo "[startup] Seeding default roles/permissions (idempotent)..."
python -m flask --app wsgi seed-roles || echo "[startup] WARN: 'seed-roles' failed; continuing."

# One worker keeps Socket.IO's in-memory state shared; threads serve concurrent
# long-poll + POST requests (Flask-SocketIO threading mode).
echo "[startup] Launching Gunicorn (gthread, 1 worker, 25 threads) on :8000..."
exec python -m gunicorn \
    --worker-class gthread \
    --workers 1 \
    --threads 25 \
    --timeout 600 \
    --bind=0.0.0.0:8000 \
    --access-logfile '-' \
    --error-logfile '-' \
    wsgi:app
