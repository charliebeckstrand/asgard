FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# --- Build stage ---
FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/bifrost/package.json ./services/bifrost/
RUN pnpm install --frozen-lockfile --filter bifrost
COPY services/bifrost/ ./services/bifrost/
RUN pnpm --filter bifrost build

# --- Production stage ---
FROM base AS production
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/bifrost/package.json ./services/bifrost/
RUN pnpm install --frozen-lockfile --prod --filter bifrost
COPY --from=build /app/services/bifrost/dist ./services/bifrost/dist

ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

CMD ["node", "services/bifrost/dist/index.js"]
