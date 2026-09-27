#!/bin/bash
# SessionStart hook for Claude Code on the web. The cloud container ships an
# older Node, so this installs the one in .nvmrc and the pnpm in package.json,
# puts them on the session's PATH, and installs dependencies.

set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
	exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

node_major=$(tr -d 'v[:space:]' < .nvmrc)

pnpm_version=$(sed -n 's/.*"packageManager": "pnpm@\([^"]*\)".*/\1/p' package.json)

node_dir="$HOME/.cache/node-v$node_major"

if [ ! -x "$node_dir/bin/node" ]; then
	tarball=$(curl -fsSL "https://nodejs.org/dist/latest-v$node_major.x/" |
		grep -o "node-v$node_major[0-9.]*-linux-x64.tar.xz" | head -1)

	mkdir -p "$node_dir"

	curl -fsSL "https://nodejs.org/dist/latest-v$node_major.x/$tarball" |
		tar -xJ -C "$node_dir" --strip-components=1
fi

export PATH="$node_dir/bin:$PATH"

echo "export PATH=\"$node_dir/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"

if [ "$("$node_dir/bin/pnpm" --version 2>/dev/null || true)" != "$pnpm_version" ]; then
	npm install --global --silent "pnpm@$pnpm_version"
fi

pnpm install --frozen-lockfile
