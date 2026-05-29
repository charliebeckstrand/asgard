#!/bin/bash
# PreToolUse hook for Write/Edit/MultiEdit. When the target file path looks
# like a test file, emit an additionalContext reminder so the agent applies
# the conventions documented in the test-quality skill.

set -euo pipefail

input=$(cat)

file_path=$(printf '%s' "$input" | python3 -c "
import json, sys
try:
    payload = json.load(sys.stdin)
    print(payload.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
")

case "$file_path" in
    *.test.ts | *.test.tsx | *.spec.ts | *.spec.tsx | */__tests__/*)
        cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Test file detected. Invoke the `test-quality` skill before proceeding to apply Asgard's test conventions: blank lines between expects, vi.hoisted before source imports, prefer vali utilities (vali/auth, vali/env, vali/containers) over hand-rolled helpers, and use vi.waitFor instead of setTimeout for async assertions."
  }
}
JSON
        ;;
    *)
        :
        ;;
esac
