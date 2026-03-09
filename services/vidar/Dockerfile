FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# --- Build stage ---
FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/vidar/package.json ./services/vidar/
COPY packages/mimir/package.json ./packages/mimir/
COPY packages/norns/package.json ./packages/norns/
RUN pnpm install --frozen-lockfile --filter vidar...
COPY tsup.config.ts ./
COPY packages/mimir/ ./packages/mimir/
COPY packages/norns/ ./packages/norns/
COPY services/vidar/ ./services/vidar/
RUN pnpm --filter vidar... build

# --- Production stage ---
FROM base AS production
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/vidar/package.json ./services/vidar/
COPY packages/mimir/package.json ./packages/mimir/
COPY packages/norns/package.json ./packages/norns/
RUN pnpm install --frozen-lockfile --prod --filter vidar...
COPY --from=build /app/services/vidar/dist ./services/vidar/dist
COPY --from=build /app/packages/mimir/dist ./packages/mimir/dist
COPY --from=build /app/packages/norns/dist ./packages/norns/dist

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

CMD ["node", "services/vidar/dist/index.js"]
