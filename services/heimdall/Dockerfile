FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# --- Workspace manifests ---
# Copy all workspace package.json files so pnpm can resolve any dependency.
# Using a temporary stage avoids manually listing each package.
FROM base AS manifests
WORKDIR /app
COPY services/ ./services/
RUN find services -name 'package.json' -mindepth 2 -maxdepth 2 > /tmp/manifest-list.txt \
    && mkdir -p /tmp/manifests \
    && while read f; do mkdir -p "/tmp/manifests/$(dirname "$f")" && cp "$f" "/tmp/manifests/$f"; done < /tmp/manifest-list.txt

# --- Build stage ---
FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=manifests /tmp/manifests/services/ ./services/
RUN pnpm install --frozen-lockfile --filter heimdall
COPY tsup.config.ts ./
COPY services/ ./services/
RUN pnpm --filter heimdall build

# --- Production stage ---
FROM base AS production
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=manifests /tmp/manifests/services/ ./services/
RUN pnpm install --frozen-lockfile --prod --filter heimdall
COPY --from=build /app/services/heimdall/dist ./services/heimdall/dist

ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

CMD ["node", "services/heimdall/dist/index.js"]
