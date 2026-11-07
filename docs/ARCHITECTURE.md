# Architecture

Next.js 16 (App Router), TypeScript, Tailwind CSS, Drizzle ORM, and PostgreSQL 16. Uploads live on a local disk directory (`UPLOAD_DIR`), not in the database and not in `public/`.

## Request path

`src/proxy.ts` only checks that a session cookie exists before rendering a page. It does not trust that cookie. Server layouts and every API handler load the session from Postgres. A missing or expired session gets 401 on APIs and a redirect to `/login` on pages.

Photos are served by `GET /api/photos/[id]` after the session's family is checked. Another family's id returns 404. Responses use `Cache-Control: private, no-store`.

The first account is created through `/setup`. The insert takes an exclusive lock on `users`, so two simultaneous setups cannot both win. In production, setup also requires `SETUP_SECRET`. There is no registration route after that.

Passwords are scrypt hashes. Session tokens are random, stored as HMAC-SHA256 with `SESSION_SECRET`, and set in an HttpOnly, SameSite=Lax cookie. Mutations require a matching Origin and Host.

## Recipe model

A recipe has a title, intro, servings (number and original text), prep and cook minutes, ingredient groups, instruction groups, tags, one category, notes, provenance, and photos. Missing numbers stay null. Example rows are flagged `is_example`.

Edits write the previous snapshot to `recipe_revisions` before changing the row. Restore writes another snapshot first, then puts the chosen snapshot back. `import_sources` keeps the raw JSON-LD or provider payload and the normalized draft from before the person edited it. Later edits do not overwrite that row.

## Import

`src/server/import/ssrf.ts` allows only http(s), blocks local names, and blocks private, loopback, link-local, metadata, documentation, and mapped addresses for IPv4 and IPv6. Every DNS answer is checked. The connection is pinned to the address that was checked. Redirects are followed manually, at most three times, and each target is checked again. Bodies are size-capped and timed out.

JSON-LD Recipe objects, including arrays and `@graph`, are normalized in `src/server/import/normalize.ts`. That path does not call a model. If no structured recipe exists, the OpenRouter adapter can read page text only when `RECIPE_EXTRACT_PROVIDER=openrouter` and both `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are set. Otherwise the request fails and nothing is saved.

Photo import re-encodes through sharp (magic bytes, pixel limit, EXIF stripped) and only then calls the same adapter. The provider response must match a zod schema. Invalid or empty output is an error, not a recipe. A successful extraction becomes a draft. The source photo is stored only with that draft and is kept when the draft is saved.

## Modules

- `src/domain` shared types and zod input
- `src/server/auth` password, session, rate limit, setup
- `src/server/recipes` repository and cookbook service
- `src/server/import` fetch, JSON-LD, normalization, provider adapter
- `src/server/storage` path confinement and image re-encoding
- `src/app` Hebrew RTL interface and thin route handlers
