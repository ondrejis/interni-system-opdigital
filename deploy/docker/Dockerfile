# syntax=docker/dockerfile:1.7
#
# Image jednoho klienta (ADR 001): `docker build --build-arg CLIENT=<slug> -f deploy/docker/Dockerfile .`
# Staví se v CI, na produkčním serveru se nikdy nebuilduje. Jedna image obsahuje aplikaci (standalone), úlohy na pozadí
# (worker) i nástroje (migrace, seed); co se spustí, určuje příkaz v docker-compose.yml.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# --- sestavení aplikace ---
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
ARG CLIENT=opsys
ARG APP_VERSION=0.0.0
ENV CLIENT=${CLIENT} APP_VERSION=${APP_VERSION}
RUN pnpm build

# --- produkční závislosti pro worker a nástroje (zdrojové balíčky + tsx) ---
FROM base AS prod-deps
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# --- běhové prostředí ---
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG CLIENT=opsys
ARG APP_VERSION=0.0.0
LABEL org.opencontainers.image.title="system-${CLIENT}" \
      org.opencontainers.image.version="${APP_VERSION}"
ENV NODE_ENV=production \
    CLIENT=${CLIENT} \
    APP_VERSION=${APP_VERSION} \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    FILES_DIR=/data/files
# písma pro vykreslování SVG (ikony aplikace, náhledy): bez konfigurace fontconfig vypisuje knihovna chybu do logu
RUN apt-get update \
    && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
# nástroje a worker: celý strom s produkčními závislostmi (spouští se přes tsx)
COPY --from=prod-deps --chown=node:node /app /app
# aplikace: Next standalone s vlastními minimálními závislostmi
COPY --from=build --chown=node:node /app/apps/web/.next/standalone /srv/web
RUN mkdir -p /data/files /data/status && chown -R node:node /data
USER node
WORKDIR /app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/srv/web/apps/web/server.js"]
