#!/usr/bin/env bash
# Forge-neutral checks. Does not print secret values.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" || -z "${SESSION_SECRET:-}" ]]; then
  echo "DATABASE_URL and SESSION_SECRET must be set in the environment. Values are not printed." >&2
  exit 1
fi
if [[ ${#SESSION_SECRET} -lt 32 ]]; then
  echo "SESSION_SECRET must be at least 32 characters." >&2
  exit 1
fi

npm run typecheck
npm run lint
npm test
npm run build
