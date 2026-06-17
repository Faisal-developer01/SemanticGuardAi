#!/usr/bin/env sh
# ─── SemanticGuard AI — container entrypoint ───────────────────────────────────
# Applies database migrations, then hands off to the container CMD (gunicorn or
# the Celery worker). Safe to run on every container start: `flask db upgrade`
# is idempotent and a no-op when the schema is already current.
set -eu

# Only the web/API role owns schema migrations. Workers wait for the API to
# have applied them (set RUN_MIGRATIONS=0 on worker containers).
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
    echo "[entrypoint] Applying database migrations..."
    flask --app wsgi db upgrade
fi

echo "[entrypoint] Starting: $*"
exec "$@"
