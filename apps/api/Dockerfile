# API de Petjada. Es construeix des de l'arrel del monorepo:
#   docker compose build api
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# Sense apps/web: el build de l'API no en depèn.
RUN pnpm install --frozen-lockfile --filter @petjada/shared --filter @petjada/api --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @petjada/shared build && pnpm --filter @petjada/api build

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter @petjada/shared --filter @petjada/api --ignore-scripts
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/migrations apps/api/migrations
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && node dist/seed.js && node dist/main.js"]
