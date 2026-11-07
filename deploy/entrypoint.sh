#!/bin/sh
set -eu
if [ -z "${DATABASE_URL:-}" ] || [ -z "${SESSION_SECRET:-}" ]; then
  echo "DATABASE_URL and SESSION_SECRET are required. Values are not printed." >&2
  exit 1
fi
mkdir -p "${UPLOAD_DIR:-/data/uploads}"
if [ "$(id -u)" = "0" ]; then
  chown -R recipes:recipes "${UPLOAD_DIR:-/data/uploads}"
  exec su --preserve-environment -s /bin/sh recipes -c "exec node server.js"
fi
exec node server.js
