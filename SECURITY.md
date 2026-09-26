# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Use GitHub's **Security → Report a vulnerability** on this repository.

## Handling credentials

Credentials are read from the environment only. They are never written to disk
and never committed. `.env` is gitignored, `.env.example` contains empty
placeholders only, and CI fails the build if a credential pattern is committed.

| Variable | Read by | Purpose |
|---|---|---|
| `PORT` | `config` | HTTP port, default `4100` |
| `CORS_ORIGIN` | `config` | Allowed browser origin, default `*` |
| `DB_PATH` | `config` | SQLite file location, default `data/video-pipeline.db` |
| `YOUTUBE_API_KEY` | YouTube adapter | YouTube Data API v3 key |
| `YOUTUBE_CHANNEL_ID` | YouTube adapter | Channel whose videos are read for metrics |
| `YOUTUBE_UPLOAD_TOKEN` | YouTube adapter | OAuth2 token; **read by the adapter, not by `config`** |
| `TIKTOK_ACCESS_TOKEN` | TikTok adapter | Content Posting API token |
| `TIKTOK_OPEN_ID` | TikTok adapter | Creator identifier |

## Known gaps

These are real and currently unaddressed. Read this section before exposing the
service to anything other than localhost.

**No authentication or authorization.** Every endpoint is public. Anyone who can
reach the service can create publish cycles, which — with credentials configured —
means they can publish to your real social accounts. There is no API key, no
JWT, and no per-user isolation.

**No rate limiting.** Unauthenticated callers can drive an unbounded number of
publish cycles, each of which fans out to five platforms.

**CORS defaults to `*`.** `CORS_ORIGIN` is not validated at startup, so a
production deploy that forgets to set it serves browser-readable responses to
every origin. Set it explicitly to a single origin.

**SQLite is the only store.** There is no `DATABASE_URL` handling; the service
reads `DB_PATH` and uses SQLite. On an ephemeral container filesystem all cycles
are lost on redeploy, so mount a volume or point `DB_PATH` at persistent storage.

**Simulated mode fails silently.** With no platform credentials, every adapter
returns realistic-looking sample URLs and metrics, and each metrics payload
carries `_simulated: true`. There is no warning at boot. **Do not mistake
simulated metrics for real performance data**, and do not read a
`"status": "live"` entry as proof that anything was actually published.

If a *real* metrics call fails, the adapter returns fallback numbers tagged
`_simulated: true` **and** records the failure in `cycle.errors` with code
`METRICS_UNAVAILABLE`. Check `cycle.errors` before trusting any metrics.

## Hardening before production

At minimum, for anything internet-facing:

1. Put the service behind a reverse proxy that requires authentication, and keep
   it off the public internet until then.
2. Set `CORS_ORIGIN` to one specific origin.
3. Mount a persistent volume and point `DB_PATH` at it.
4. Add request-level rate limiting.
5. Serve over TLS only, so platform tokens are never sent in cleartext.

Items 1 and 2 are the difference between "an anonymous user can post to your
accounts" and "it isn't".

## Token handling

Never commit a `.env` file, an access token, or a service-account key. If a
credential is ever committed, treat it as compromised: revoke it in the
provider's dashboard first, then purge it from git history.
