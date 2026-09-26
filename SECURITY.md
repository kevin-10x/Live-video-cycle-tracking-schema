# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Use GitHub's **Security → Report a vulnerability** on this repository.

## Handling credentials

This service talks to third-party publishing APIs. Credentials are read from the
environment only and are never written to disk or committed:

| Variable | Purpose | Required in production |
|---|---|---|
| `JWT_SECRET` | Signs session tokens | Yes (see below) |
| `DATABASE_URL` | Postgres connection string | Yes |
| `CORS_ORIGIN` | Allowed frontend origin | Yes |
| `YOUTUBE_API_KEY` | YouTube Data API | Optional |
| `YOUTUBE_UPLOAD_TOKEN` | YouTube OAuth2 upload token | Only for real YouTube publishing |
| `TIKTOK_ACCESS_TOKEN` | TikTok Content Posting API | Optional |
| `TIKTOK_OPEN_ID` | TikTok creator identifier | Optional |

`.env` is gitignored. `.env.example` contains empty placeholders only.

## Production startup checks

`src/config/index.js` refuses to start when `NODE_ENV=production` and any of the
following is true:

- `JWT_SECRET` is unset, still the dev placeholder, or shorter than 32 characters
- `DATABASE_URL` is unset (which would silently use an ephemeral SQLite file and
  lose all data on redeploy)
- `CORS_ORIGIN` is unset (which would allow any origin)

This is intentional. A misconfigured production deploy should fail at boot rather
than at the first user request.

## Simulated mode

With no platform credentials configured, adapters return realistic-looking sample
URLs and metrics, and each metrics payload includes `_simulated: true`. **Do not
mistake simulated metrics for real performance data.**

## Token handling

Never commit a `.env` file, an access token, or a service-account key. If a
credential is ever committed, treat it as compromised: revoke it in the provider's
dashboard first, then purge it from git history.
