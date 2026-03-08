ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# Extract just the package.json files from services/ for dependency installation.
# This layer is cached independently so code changes don't re-trigger pnpm install.
FROM base AS manifests
WORKDIR /app
COPY services/ ./services/
RUN find services -mindepth 2 -maxdepth 2 -name 'package.json' -exec sh -c \
    'for f; do mkdir -p "/tmp/manifests/$(dirname "$f")" && cp "$f" "/tmp/manifests/$f"; done' _ {} +

# --- Build stage ---
FROM base AS build
ARG SERVICE
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=manifests /tmp/manifests/services/ ./services/
RUN pnpm install --frozen-lockfile --filter ${SERVICE}
COPY tsup.config.ts ./
COPY services/ ./services/
RUN pnpm --filter ${SERVICE} build

# --- Production stage ---
FROM base AS production
ARG SERVICE
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=manifests /tmp/manifests/services/ ./services/
RUN pnpm install --frozen-lockfile --prod --filter ${SERVICE}
COPY --from=build /app/services/${SERVICE}/dist ./services/${SERVICE}/dist

ENV NODE_ENV=production
ENV PORT=8000
ENV SERVICE=${SERVICE}
EXPOSE 8000

CMD node services/${SERVICE}/dist/index.js
