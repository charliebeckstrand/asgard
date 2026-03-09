#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"

YELLOW='\033[0;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

DOCKER_RUNNING=false

cleanup() {
	if [ "$DOCKER_RUNNING" = true ]; then
		echo ""
		echo -e "${CYAN}Stopping dev containers...${RESET}"

		docker compose -f "$COMPOSE_FILE" down 2>/dev/null

		echo -e "${GREEN}Dev containers stopped.${RESET}"
	fi
}

trap cleanup EXIT INT TERM

if command -v docker &>/dev/null && docker info &>/dev/null; then
	echo -e "${CYAN}Starting dev containers...${RESET}"

	docker compose -f "$COMPOSE_FILE" up -d --wait

	DOCKER_RUNNING=true

	echo -e "${GREEN}PostgreSQL is ready${RESET} ${DIM}(localhost:5432)${RESET}"
	echo -e "${GREEN}Redis is ready${RESET}      ${DIM}(localhost:6379)${RESET}"
	echo ""
else
	echo -e "${YELLOW}Docker not available — skipping dev containers${RESET}"
	echo -e "${DIM}Install Docker to enable Redis and other dev services${RESET}"
	echo ""
fi

pnpm turbo run dev --concurrency=15 &
TURBO_PID=$!

wait $TURBO_PID 2>/dev/null
