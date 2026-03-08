FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# --- Build stage ---
FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/ratatoskr/package.json ./services/ratatoskr/
COPY services/mimir/package.json ./services/mimir/
RUN pnpm install --frozen-lockfile --filter ratatoskr
COPY tsup.config.ts ./
COPY services/ratatoskr/ ./services/ratatoskr/
COPY services/mimir/ ./services/mimir/
RUN pnpm --filter ratatoskr build

# --- Production stage ---
FROM base AS production
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/ratatoskr/package.json ./services/ratatoskr/
COPY services/mimir/package.json ./services/mimir/
RUN pnpm install --frozen-lockfile --prod --filter ratatoskr
COPY --from=build /app/services/ratatoskr/dist ./services/ratatoskr/dist

ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

CMD ["node", "services/ratatoskr/dist/index.js"]
