# @itg/api

Cloudflare Worker backing the waitlist (`IF-1`), player submissions (`IF-2`), first-party
analytics ingest (`IF-3`) and the operator admin API (`IF-6`). Specification:
[LLD §2, §3, §5–§8](../../docs/design/LLD.md), threats in [HLD §5](../../docs/design/HLD.md),
configuration in [TDD §7](../../docs/design/TDD.md). Request/response schemas come from
[`@itg/contracts`](../../packages/contracts/src/index.ts).

## Run locally

```sh
cp services/api/.dev.vars.example services/api/.dev.vars   # local-only secrets, git-ignored
pnpm --filter @itg/api db:migrate:local                     # apply migrations to the local D1
pnpm --filter @itg/api dev                                  # wrangler dev on http://localhost:8787
```

`.dev.vars.example` uses Cloudflare's always-pass Turnstile test secret, so any token
passes locally. Admin routes need a real Cloudflare Access JWT; test them through the
test suite instead.

```sh
pnpm --filter @itg/api test        # vitest in the Workers runtime (@cloudflare/vitest-pool-workers)
pnpm --filter @itg/api typecheck
```

Deploy: `pnpm --filter @itg/api deploy:preview` / `deploy:production` after replacing the
`REPLACE_WITH_*` placeholders in `wrangler.toml` and applying migrations
(`wrangler d1 migrations apply DB --remote --env <env>`), preview first (TDD §7).

## Configuration

| Name | Kind | Purpose |
|---|---|---|
| `DB` | D1 binding | `waitlist_entries`, `rate_limits`, `submissions` ([migrations](migrations)) |
| `EVENTS` | Analytics Engine binding | dataset `itsthatgame_events` (preview: `itsthatgame_events_preview`) |
| `ALLOWED_ORIGIN` | var | Landing-page origin allowed by CORS on `/v1/waitlist*` |
| `APP_ORIGINS` | var | Comma-separated app origins allowed by CORS on app routes |
| `OPERATOR_EMAILS` | var | Comma-separated Access identities allowed on `/admin/*` |
| `ACCESS_TEAM_DOMAIN` | var | `<team>.cloudflareaccess.com`; JWKS and issuer are derived from it |
| `WAITLIST_RETENTION_END` | var | Optional ISO date; from then on the cron deletes all waitlist entries (`DATA-1`) |
| `TURNSTILE_SECRET` | secret | Turnstile siteverify secret |
| `ACCESS_AUD` | secret | Access application audience tag checked in the JWT |
| `HASH_PEPPER` | secret | HMAC-SHA256 key for install IDs and IP addresses |

Secrets are set with `wrangler secret put <NAME> --env <preview|production>` and are never
committed (`SEC-2`).

## Routes

| Method & path | CORS | Purpose | Notes |
|---|---|---|---|
| `POST /v1/waitlist` | landing | Signup (`FR-WL-2..4`) | Turnstile, 10/IP/h, 4 KB body, idempotent by email |
| `POST /v1/waitlist/unsubscribe` | landing | Remove entry (`FR-WL-6`) | Turnstile, always `200` |
| `POST /v1/submissions` | app | Create submission (`FR-SUB-1..3`) | `X-Install-Id`, `Idempotency-Key`; 201 new / 200 replay / 409 other install; 5/install/24h, 20/IP/24h |
| `GET /v1/submissions` | app | Caller install's submissions (`FR-SUB-6`) | newest first, max 100 |
| `POST /v1/events` | app | Analytics batch (`FR-AN-1`) | ≤ 50 events, 32 KB, 60 batches/install/h; `202 {accepted, dropped}` |
| `GET /admin/v1/waitlist/stats?from=&to=` | none | Counts by day, source, price (`FR-WL-5`) | dates `YYYY-MM-DD`, inclusive |
| `GET /admin/v1/waitlist/export.csv` | none | CSV export (`FR-WL-5`) | quoted, formula-injection safe |
| `GET /admin/v1/submissions?status=&cursor=` | none | Moderation list (`FR-SUB-5`) | 50/page, keyset cursor |
| `PATCH /admin/v1/submissions/:id` | none | Status change (`FR-SUB-4`) | `{from,to,publicNote?}`; 400 disallowed transition, 409 stale `from` with `currentStatus` |
| `DELETE /admin/v1/submissions/:id` | none | Remove content (`SEC-7`) | `204` / `404` |

All `/admin/*` requests require a valid `Cf-Access-Jwt-Assertion` (RS256 via the team JWKS,
issuer, audience, expiry) for an operator email: `401` otherwise, `403` for a non-operator.
Errors use the LLD §8 envelope with a `requestId` (also in `X-Request-Id`); `429` carries
`Retry-After`. Every response sends HSTS. A daily cron deletes `rate_limits` windows older
than 48 hours (`DATA-2`).

Privacy: install IDs and IPs are stored only as `HMAC-SHA256(HASH_PEPPER, value)`; the
install ID is never written to Analytics Engine; request logs contain only request ID,
method, route, status and duration, never emails or bodies.
