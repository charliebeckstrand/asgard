#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

cleanup() {
	echo ""
	echo -e "${CYAN}Stopping dev containers...${RESET}"

	docker compose -f "$COMPOSE_FILE" down 2>/dev/null

	echo -e "${GREEN}Dev containers stopped.${RESET}"
}

trap cleanup EXIT INT TERM

echo -e "${CYAN}Starting dev containers...${RESET}"

docker compose -f "$COMPOSE_FILE" up -d --wait

echo -e "${GREEN}Redis is ready${RESET} ${DIM}(localhost:6379)${RESET}"
echo ""

exec pnpm turbo run dev --concurrency=15
