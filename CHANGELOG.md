# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  All degrade to a clearly-flagged simulated mode when credentials are absent.
- REST API: run a cycle, repost, list/fetch cycles, list registered platforms,
  validate arbitrary JSON against the contract, and manage the video library.
- SQLite storage for videos, cycles and per-platform publications, including a
  forward migration for databases created by earlier versions.
- Docker image, docker-compose setup, and GitHub Actions for tests, image build,
  GHCR publish and manual VPS deploy.
- 27 tests covering the schema contract, the optimization engine, variant
  generation, CORS handling and full API integration.

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
