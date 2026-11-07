# Self-hosting

These instructions build and run the app on a machine you control. They do not publish an image and they do not connect to a registry.

Requirements: Docker with Compose, and a hostname you already own if you want TLS.

```bash
cp .env.example .env
```

Edit `.env` on that machine. Set a database password, a `SESSION_SECRET` of at least 32 characters, and a `SETUP_SECRET` of at least 16 characters. Leave `RECIPE_EXTRACT_PROVIDER=none` unless you intentionally add a server-side extraction key. Do not commit `.env`.

In the shell that runs Compose, also set:

```bash
export POSTGRES_USER=recipes
export POSTGRES_PASSWORD='replace-with-a-database-password'
export POSTGRES_DB=recipes
export SESSION_SECRET='replace-with-at-least-32-random-characters'
export SETUP_SECRET='replace-with-at-least-16-random-characters'
export SITE_ADDRESS=recipes.example.com
export RECIPE_EXTRACT_PROVIDER=none
```

`SITE_ADDRESS` is the name Caddy should serve. Replace `recipes.example.com` with your own name. Compose publishes ports 80 and 443 only. Postgres and the upload volume have no host port.

```bash
docker compose up -d --build
```

The app container applies database migrations on startup, then drops to uid 1001. Open the site once and create the family account. The setup form asks for `SETUP_SECRET`. There is no default account.

`https://$SITE_ADDRESS/api/health` does not touch the database. `/api/ready` does.

```bash
export BACKUP_DIR=/var/backups/family-recipes
./scripts/backup.sh
```

The backup contains the database and any uploaded photos. Keep it on private storage. Restore with `scripts/restore.sh` only after you set `RESTORE_CONFIRM=restore-family-recipes` and `BACKUP_PATH` to that backup. Restore does not delete volumes.

This repository's GitHub Actions workflow builds a `linux/arm64` image to prove the Dockerfile builds, then deletes it. It does not push an image.
