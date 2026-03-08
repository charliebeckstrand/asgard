FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# --- Build stage ---
FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/vidar/package.json ./services/vidar/
COPY services/mimir/package.json ./services/mimir/
RUN pnpm install --frozen-lockfile --filter vidar
COPY tsup.config.ts ./
COPY services/mimir/ ./services/mimir/
COPY services/vidar/ ./services/vidar/
RUN pnpm --filter vidar build

# --- Production stage ---
FROM base AS production
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/vidar/package.json ./services/vidar/
COPY services/mimir/package.json ./services/mimir/
RUN pnpm install --frozen-lockfile --prod --filter vidar
COPY --from=build /app/services/vidar/dist ./services/vidar/dist

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

CMD ["node", "services/vidar/dist/index.js"]
