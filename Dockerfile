# syntax=docker/dockerfile:1.7
# ─── SemanticGuard AI — frontend image (Vite build served by nginx) ─────────────

# ── Build stage ─────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV CI=true

# Install deps with the lockfile-aware flag set used by this repo (React 19 peer
# conflict with react-helmet-async requires --legacy-peer-deps).
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
        npm ci --legacy-peer-deps; \
    else \
        npm install --legacy-peer-deps; \
    fi

COPY . .
# VITE_API_BASE_URL is intentionally left unset so the SPA calls the same origin
# (/api/v1), which nginx proxies to the backend.
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
# The official nginx image renders /etc/nginx/templates/*.template at startup,
# substituting only defined environment variables (so ${BACKEND_URL} is replaced
# while nginx's own $host / $http_upgrade / $uri are preserved).
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template

ENV BACKEND_URL=http://api:5000
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
