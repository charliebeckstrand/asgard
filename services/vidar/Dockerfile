FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# --- Build stage ---
FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/vidar/package.json ./services/vidar/
COPY packages/mimir/package.json ./packages/mimir/
COPY packages/grid/package.json ./packages/grid/
RUN pnpm install --frozen-lockfile --filter vidar...
COPY tsup.config.ts tsconfig.base.json ./
COPY packages/mimir/ ./packages/mimir/
COPY packages/grid/ ./packages/grid/
COPY services/vidar/ ./services/vidar/
RUN pnpm --filter vidar... build

# --- Production stage ---
FROM base AS production
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/vidar/package.json ./services/vidar/
COPY packages/mimir/package.json ./packages/mimir/
COPY packages/grid/package.json ./packages/grid/
RUN pnpm install --frozen-lockfile --prod --filter vidar...
COPY --from=build /app/services/vidar/dist ./services/vidar/dist
COPY --from=build /app/services/vidar/manifest.json ./services/vidar/manifest.json
COPY --from=build /app/packages/mimir/dist ./packages/mimir/dist
COPY --from=build /app/packages/grid/dist ./packages/grid/dist

ENV NODE_ENV=production
ENV PORT=4002
EXPOSE 4002

CMD ["node", "services/vidar/dist/index.js"]
