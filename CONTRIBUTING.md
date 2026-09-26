# Contributing

## Setup

```bash
git clone https://github.com/kevin-10x/Live-video-cycle-tracking-schema.git
cd Live-video-cycle-tracking-schema
npm ci
cp .env.example .env
npm run seed
npm start
```

Node 20 is pinned in `.nvmrc`. `npm ci` is required in CI so the lockfile is
honoured exactly.

## Before opening a pull request

```bash
npm test
```

Every change needs a test. A bug fix needs a test that fails without the fix —
that is the only way to know the test is actually guarding anything.

## Conventions

- ES modules (`import` / `export`), 2-space indent, single quotes, semicolons.
- Match the style of the file you are editing; `.editorconfig` covers the basics.
- No new runtime dependencies without a stated reason. This service is small on
  purpose — `express`, `cors`, `dotenv`, `sqlite3`, `zod` is the whole list.

## Adding a platform

1. Create `src/adapters/<platform>.js` extending `BasePlatformAdapter`
   (`src/adapters/base.js`).
2. Implement `publish()` returning `{ url, external_id, variant_id }` and
   `fetchMetrics()` returning the metrics object.
3. Register it in `src/adapters/index.js`.
4. Add a variant profile in `src/utils/video.js` (`VARIANT_PROFILES`).
5. Add the platform to the `z.record` key union in `src/schema/cycle.js`.

Adapters must degrade to simulated mode when credentials are absent so the
service runs without secrets.

## Schema changes

`src/schema/cycle.js` is the contract. Changing it is a breaking change: bump the
major version, note it in `CHANGELOG.md`, and update any stored-cycle validation.

## Migrations

`CREATE TABLE IF NOT EXISTS` cannot alter an existing table. When changing a
column constraint on a deployed database, add an explicit rebuild in
`src/db/migrate.js` that preserves existing rows — verified against a database
created with the previous schema.
