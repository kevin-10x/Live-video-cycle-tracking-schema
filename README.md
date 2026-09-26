# Live Video Cycle Tracking Schema — Pipeline Service

A full backend service for the **cross-platform video publishing / reposting pipeline**. It
publishes a video to multiple platforms (YouTube, TikTok, Instagram, X, Facebook), collects
first-hour metrics per platform, derives **optimization insights**, and emits
**next-cycle recommendations** — all summarized in a single, schema-validated **cycle JSON**
envelope.

```
POST /api/cycles  ->  {
  "cycle_id": "uuid",
  "video_fingerprint": "sha256",
  "timestamp_utc": "ISO8601",
  "platforms": {
    "youtube": {"status": "live", "url": "...", "variant_id": "v1", "metrics_1h": {...}},
    "tiktok":  {"status": "live", "url": "...", "variant_id": "v2", "metrics_1h": {...}},
    ...
  },
  "errors": [],
  "optimization_insights": [],
  "next_cycle_recommendations": []
}
```

## Features

- **Multi-platform orchestration** — one cycle = publish the same source video to every target platform.
- **Per-platform variants** — the source is adapted to each platform's preferred aspect ratio / length
  (`youtube-v1-standard`, `tiktok-v2-vertical`, `instagram-v3-portrait`, `x-v4-landscape`, `facebook-v5-square`).
- **Real adapter hooks** — YouTube (Data API v3) and TikTok (Content Posting API) call their live APIs when
  credentials are configured; Instagram / X / Facebook ship as real-skeleton adapters. Without credentials,
  every adapter runs a deterministic **simulated mode** so the whole pipeline runs out of the box.
- **Optimization engine** — computes `optimization_insights` (breakout / underperformer / retention / edit /
  reverse) and `next_cycle_recommendations` (republish / retry / variant_change / hold) from engagement math.
- **Reposting** — schedule a fresh cycle for an existing video on demand (new `cycle_id`, `timestamp`, metrics).
- **Schema-validated contract** — every emitted and stored cycle is validated against a Zod schema; an
  endpoint validates arbitrary JSON against the same contract.
- **Docker + CI/CD** — Dockerfile, docker-compose, GitHub Actions (test, audit, secret scan, build image, publish to GHCR, deploy).

## Status

Independent, self-contained repository. Nothing in the code, Dockerfiles or
workflows depends on a parent directory or a sibling project. See
[CHANGELOG.md](CHANGELOG.md) for what is verified and
[SECURITY.md](SECURITY.md) for the required production configuration.

## Quick start (local)

Requirements: Node.js ≥ 18.

```bash
cd video-pipeline
npm install
cp .env.example .env     # optional; simulated mode works with no credentials
npm run seed             # creates 2 demo videos
npm start                # http://localhost:4100
```

## API

| Method | Endpoint                     | Description                                         |
|--------|------------------------------|-----------------------------------------------------|
| GET    | `/api/health`                | Health check                                        |
| GET    | `/api/cycles`                | List cycles (paginated)                             |
| GET    | `/api/cycles/:id`            | Fetch one cycle envelope                            |
| POST   | `/api/cycles`                | Run a new publish cycle for a video                 |
| POST   | `/api/cycles/:videoId/repost`| Run a new repost cycle for an existing video        |
| GET    | `/api/cycles/platforms`      | List registered platforms                           |
| POST   | `/api/cycles/validate`       | Validate arbitrary JSON against the cycle contract  |
| GET    | `/api/videos`                | List stored videos                                  |
| POST   | `/api/videos`                | Register a video for publishing                     |

### Run a cycle

```bash
# Inline video
curl -X POST http://localhost:4100/api/cycles \
  -H 'Content-Type: application/json' \
  -d '{
        "video": {
          "title": "Launch teaser",
          "file_path": "https://cdn.example.com/teaser.mp4",
          "duration": 30,
          "width": 1080, "height": 1920, "fps": 30
        },
        "platforms": ["youtube", "tiktok"]
      }'

# Existing stored video (id from /api/videos)
curl -X POST http://localhost:4100/api/cycles -H 'Content-Type: application/json' \
  -d '{"video_id": 1}'

# Repost
curl -X POST http://localhost:4100/api/cycles/1/repost -H 'Content-Type: application/json' -d '{}'
```

## Connecting real platforms

Set credentials in `.env` (or container env). When present, the adapter calls the real API;
otherwise it falls back to simulated mode (the default for local runs).

| Variable                | Platform  | API                                        |
|-------------------------|-----------|--------------------------------------------|
| `YOUTUBE_API_KEY`       | YouTube   | Data API v3 (metrics)                      |
| `YOUTUBE_CHANNEL_ID`    | YouTube   | Data API v3                                |
| `YOUTUBE_UPLOAD_TOKEN`  | YouTube   | OAuth2 upload token (videos.insert)        |
| `TIKTOK_ACCESS_TOKEN`   | TikTok    | Content Posting API                        |
| `TIKTOK_OPEN_ID`        | TikTok    | Content Posting API (creator)              |

## Docker

```bash
# Build & run with docker compose
docker compose up --build        # http://localhost:4100
```

## CI/CD

- `.github/workflows/ci.yml` — tests, production dependency audit, committed-secret
  scan, and a container build on every push/PR. Required checks: `Test`,
  `Dependency audit`, `Secret scan`, `Build Docker image`.
- `.github/workflows/docker-publish.yml` — builds and pushes the image to
  `ghcr.io/<owner>/live-video-cycle-tracking-schema` on `main` and version tags.
- `.github/workflows/deploy.yml` — (manually triggered) deploys to a VPS over SSH with
  `docker compose up -d --build`. Set repo secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

The package is private by default, so pulling the image needs
`docker login ghcr.io` with a token that has `read:packages`.

## Testing

```bash
npm test        # node --test: schema, optimizer, video util, and API integration
```

## Project structure

This repository is self-contained: the service is its own root, and no path in
the code, Dockerfiles or workflows refers to a parent directory or a sibling
project.

```
.
  Dockerfile, docker-compose.yml, railway.json, Procfile
  .nvmrc                  # pins Node 20 for local, CI and image
  .editorconfig           # shared formatting basics
  src/
    server.js           # entry point
    app.js              # Express wiring
    config/             # env config + per-platform credential resolution
    db/                 # SQLite provider + migrations (videos, cycles, pubs)
    schema/cycle.js     # the canonical cycle JSON contract (Zod)
    adapters/           # platform adapters (youtube, tiktok, instagram, x, facebook)
    engine/
      orchestrator.js   # full cycle lifecycle (create -> publish -> metrics -> insights)
      optimizer.js      # optimization_insights + next_cycle_recommendations
    routes/cycles.js    # REST API for cycles + videos
    utils/              # http helpers, store, video/fingerprint/variant utils, seed
  tests/                # unit + API integration tests
```
