# ספר מתכונים

A Hebrew-first family cookbook. Pages are RTL. Desktop is an open two-page spread, and a phone is a single page. Recipes, notes, uploads, and photos are available only after login.

This tree is the application source. It does not contain production host details, deploy credentials, CI workflows, or a real environment file.

## Local development

Requirements: Node.js 22 and PostgreSQL 16.

```bash
cp .env.example .env
# Put a local database password and a 32+ character SESSION_SECRET in .env.
# Do not commit .env.

npm ci
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:43123`. The first visit creates the single family account. There is no default password and no registration after that.

`npm run db:seed` inserts three recipes marked as example data. They are not family source material.

Structured URL import does not need an API key. Photo and unstructured extraction stay off until a server-side provider key and model are set. Those variables are read only on the server. See `docs/IMPORT_PROVIDERS.md`.

## Checks

```bash
export DATABASE_URL=postgres://recipes:replace-with-local-password@127.0.0.1:5432/recipes_test
export SESSION_SECRET="$(openssl rand -base64 32)"
./scripts/check.sh
```

`npm run test:e2e` runs the browser flow against the dev server. It needs `DATABASE_URL` for the same local database the server uses. Screenshots are written only when `E2E_SCREENSHOT_DIR` is set.

## Container

`Dockerfile` and `docker-compose.yml` are generic packaging. Compose does not publish Postgres or the upload volume. Set `SITE_ADDRESS` yourself. The image build in this workspace has not been verified where Docker is unavailable.

`scripts/backup.sh` writes a database dump and an upload archive. Keep that archive on private storage. Generic self-host steps are in `docs/SELF_HOST.md`.

GitHub Actions, on the public repository, runs the test suite and the production build, then builds a `linux/arm64` image and deletes it. The workflow does not push an image and does not deploy. Its logs are public. Test accounts and recipes are fictitious examples.
