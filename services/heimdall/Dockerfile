FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# --- Build stage ---
FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/heimdall/package.json ./services/heimdall/
COPY services/mimir/package.json ./services/mimir/
RUN pnpm install --frozen-lockfile --filter heimdall
COPY tsup.config.ts ./
COPY services/heimdall/ ./services/heimdall/
COPY services/mimir/ ./services/mimir/
RUN pnpm --filter heimdall build

# --- Production stage ---
FROM base AS production
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/heimdall/package.json ./services/heimdall/
COPY services/mimir/package.json ./services/mimir/
RUN pnpm install --frozen-lockfile --prod --filter heimdall
COPY --from=build /app/services/heimdall/dist ./services/heimdall/dist

ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

CMD ["node", "services/heimdall/dist/index.js"]
