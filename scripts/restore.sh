#!/usr/bin/env bash
# Restore a backup created by scripts/backup.sh.
# Requires RESTORE_CONFIRM=restore-family-recipes.
# Stops the app, restores into the existing volumes, and starts the app again.
# It does not run `docker compose down -v`.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${RESTORE_CONFIRM:-}" != "restore-family-recipes" ]]; then
  echo "Refusing to restore. Set RESTORE_CONFIRM=restore-family-recipes after you have read docs/BACKUP.md." >&2
  exit 1
fi
if [[ -z "${BACKUP_PATH:-}" || ! -f "${BACKUP_PATH}/db.dump" || ! -f "${BACKUP_PATH}/uploads.tar" ]]; then
  echo "Set BACKUP_PATH to a backup directory that contains db.dump and uploads.tar." >&2
  exit 1
fi

docker compose stop app
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "${BACKUP_PATH}/db.dump"
docker compose run --rm --no-deps --entrypoint sh --user recipes \
  -v uploads:/data/uploads -v "${BACKUP_PATH}:/backup:ro" app \
  -c 'find /data/uploads -mindepth 1 -delete && tar -C /data/uploads -xf /backup/uploads.tar'
docker compose start app
echo "Restore finished. Check https://\${SITE_ADDRESS}/api/ready from the server before using the book."
