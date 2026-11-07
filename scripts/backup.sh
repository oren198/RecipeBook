#!/usr/bin/env bash
# Backup Postgres and the uploads volume. Does not delete volumes.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${BACKUP_DIR:-}" ]]; then
  echo "Set BACKUP_DIR to a directory outside the Compose volumes." >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="${BACKUP_DIR%/}/family-recipes-${stamp}"
mkdir -p "$dest"
chmod 700 "$dest"

docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "${dest}/db.dump"
docker compose run --rm --no-deps --entrypoint tar --user recipes \
  -v uploads:/data/uploads:ro -v "${dest}:/backup" app \
  -C /data/uploads -cf /backup/uploads.tar .

echo "Backup written to ${dest}"
echo "It contains the database dump and upload files. Store it privately."
