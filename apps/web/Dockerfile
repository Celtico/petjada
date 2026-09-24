# PWA de Petjada. Es construeix des de l'arrel del monorepo:
#   docker compose build web
#
# Les variables VITE_* es fixen en temps de build (Vite les incrusta al bundle).
# Es passen com a build args des del docker-compose; les buides s'ignoren i
# s'apliquen els valors per defecte de `apps/web/src/config.ts`.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @petjada/shared --filter @petjada/web --ignore-scripts
COPY packages/shared packages/shared
COPY apps/web apps/web

ARG VITE_MAPBOX_TOKEN
ARG VITE_API_URL
ARG VITE_ENABLE_SIM
ARG VITE_CAPTURE_RADIUS_M
ARG VITE_VISIBILITY_RANGE_M
ARG VITE_CAMERA_FOV_DEG
ARG VITE_MIN_ACCURACY_M
ARG VITE_MAX_WALKING_SPEED_MPS
ARG VITE_LOCK_ANGLE_DEG
ARG VITE_UNLOCK_ANGLE_DEG
ARG VITE_LOCK_HOLD_MS
ARG VITE_MOVING_RATE_DPS
ARG VITE_NEARBY_RADIUS_M
# Només les VITE_* amb valor van a .env.production (Vite el llegeix de envDir = arrel).
RUN env | grep -E '^VITE_[A-Z0-9_]+=.+' > /repo/.env.production || true
RUN pnpm --filter @petjada/shared build && pnpm --filter @petjada/web build

# Només fitxers estàtics amb l'nginx de sèrie (port 80 dins del contenidor).
# El compose el publica al port lliure 7274 del servidor. L'encaminament de /api
# cap a l'API es fa al proxy invers extern (Nginx Proxy Manager, "Custom Location").
FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
