# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Metrics for a real publication were never fetched. The external id was assigned
  to the adapter *after* `fetchMetrics()` had already run, so the
  `videos.list` / `video/query` lookups always saw an undefined id and silently
  fell back to simulated numbers. The id is now passed as an argument.
- Adapters are module-level singletons, so the previous per-publication
  `setExternalId` stored request-scoped state on shared instances. The id is now
  passed per call and `setExternalId` is gone, which removes the possibility of
  one cycle reading another cycle's video id.
- A single stored row that did not satisfy the schema made `GET /api/cycles`
  return 500, taking down the whole listing. Unreadable rows are now skipped,
  logged, and reported in `meta.skipped`.
- Unexpected errors echoed their message to the client, leaking zod issue paths
  and internal detail in 500 responses. Only authored `ApiError` messages are
  returned now; anything else is logged server-side and reported as
  `Internal server error`.
- `GET /api/cycles/platforms` was registered twice, the second copy after the
  `/:id` catch-all. The duplicate is removed so the route order is unambiguous.
- `YOUTUBE_UPLOAD_TOKEN` was read straight from `process.env` and was missing
  from `.env.example`, so a real YouTube publish failed with a confusing
  `YT_UPLOAD_TOKEN_MISSING` error. It is now documented.
- `BasePlatformAdapter.simulated` was initialised to `true` and never set to
  `false`, so metrics fetched from a real API were still tagged
  `_simulated: true` and the flag could not be trusted. Adapters now set it
  according to whether the data actually came from the platform.
- When a real metrics call failed, the adapter returned generated placeholder
  numbers with no indication that anything had gone wrong, making a failed
  lookup indistinguishable from a genuinely low-performing video. A failure is
  now recorded in `cycle.errors` as `METRICS_UNAVAILABLE` with the HTTP status.

### Documentation
- `SECURITY.md` described a production startup guard, a `JWT_SECRET` requirement
  and `DATABASE_URL`/Postgres support. **None of that exists in this service.**
  The file now documents the real configuration surface and states the known
  gaps plainly: no authentication, no rate limiting, `CORS_ORIGIN` defaulting to
  `*`, and SQLite as the only store.

## [0.1.0] - 2026-09-27

### Added
- Cross-platform publish cycle: one source video published to YouTube, TikTok,
  Instagram, X and Facebook, with a per-platform variant derived from the source
  (`youtube-v1-standard`, `tiktok-v2-vertical`, and so on).
- Zod-validated cycle envelope (`src/schema/cycle.js`) covering `cycle_id`,
  `video_fingerprint`, `timestamp_utc`, `platforms`, `errors`,
  `optimization_insights` and `next_cycle_recommendations`. Every emitted and
  every stored cycle is validated against it.
- Optimization engine producing breakout/underperformer/retention/edit/reverse
  insights and retry/republish/variant_change/hold recommendations.
- Platform adapters with real API hooks for YouTube Data API v3 and the TikTok
  Content Posting API; Instagram, X and Facebook ship as real-skeleton adapters.
  All degrade to a simulated mode when credentials are absent, and every metrics
  payload carries `_simulated` so the two are never confused.
- REST API: run a cycle, repost, list/fetch cycles, list registered platforms,
  validate arbitrary JSON against the contract, and manage the video library.
- SQLite storage for videos, cycles and per-platform publications, including a
  forward migration for databases created by earlier versions.
- Docker image, docker-compose setup, and GitHub Actions for tests, image build,
  GHCR publish and manual VPS deploy.
- Test suite covering the schema contract, the optimization engine, variant
  generation, CORS handling, full API integration, and regressions for the
  defects listed above. Run with `npm test`.

### Fixed
- CORS: a `*` origin was split into the array `['*']`, which the `cors` package
  treats as an exact-match allow-list, so no CORS headers were emitted at all.
  Health checks stayed green while every browser request failed.
- `POST /api/cycles` with an inline video returned 500 because `cycles.video_id`
  was `NOT NULL`; added a table-rebuild migration that preserves existing rows.
- SQLite parent directory is now created at startup, fixing `SQLITE_CANTOPEN` in
  fresh clones and containers where `data/` is absent.
- Workflow build contexts pointed at a non-existent nested directory after the
  service became its own repository root.
- `express` and `qs` upgraded to clear moderate-severity runtime advisories.

[Unreleased]: https://github.com/kevin-10x/Live-video-cycle-tracking-schema/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kevin-10x/Live-video-cycle-tracking-schema/releases/tag/v0.1.0
