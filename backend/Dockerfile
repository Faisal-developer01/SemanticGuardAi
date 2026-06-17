# syntax=docker/dockerfile:1.7
# ─── SemanticGuard AI — API image (Flask + Socket.IO via Gunicorn/eventlet) ─────
# Lean image: web/API only. The heavy AI/ML stack lives in ai/Dockerfile.worker.
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Runtime libraries: libpq for psycopg2, curl for the container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# ── Builder: compile wheels with build toolchain, keep the final image slim ─────
FROM base AS builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip wheel --wheel-dir /wheels -r requirements.txt

# ── Final ───────────────────────────────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app

# Install pre-built wheels (no compiler needed in the runtime image).
COPY --from=builder /wheels /wheels
COPY requirements.txt ./
RUN pip install --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

# Application code.
COPY . .

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/var/uploads \
    && chmod +x docker-entrypoint.sh \
    && chown -R appuser:appuser /app
USER appuser

ENV FLASK_ENV=production \
    PORT=5000 \
    SOCKETIO_ASYNC_MODE=eventlet \
    GUNICORN_TIMEOUT=120

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
# Single eventlet worker per container; horizontal scale is handled by the
# Redis message queue (SOCKETIO_MESSAGE_QUEUE) plus ingress session affinity.
CMD ["sh", "-c", "exec gunicorn --worker-class eventlet --workers 1 --timeout ${GUNICORN_TIMEOUT} --bind 0.0.0.0:${PORT} --access-logfile - --error-logfile - wsgi:app"]
