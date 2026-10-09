# Low-Level Design (LLD)

**Status:** Current for the interfaces needed by M1, M2, and M5 (2026-10-04).
Implemented in PR #1; the executable schemas are in `packages/contracts`. Where the code
differs from draft-1 of this document, the text below has been updated and the change
is marked *(as built)*. **Owns:** module contracts, API contracts, schemas, state
machines, error handling, retries, idempotency, and concurrency behavior. Detail is
given only where a near-term roadmap task needs it; M4 entitlement internals follow
RevenueCat's SDK and are specified in [SDD §4](SDD.md#4-entitlement).

Schemas below are normative in meaning. When implemented, the Zod schemas in
`packages/contracts` become the executable source, and this document must be updated in
the same PR if they differ.

## 1. Game SDK contract (`IF-5`)

```ts
// packages/game-sdk/src/index.ts
export interface GameModule {
  readonly slug: string;                      // must equal catalog entry slug
  mount(container: HTMLElement, ctx: GameContext): Promise<void>;
  start(): void;                              // called once after mount resolves
  pause(): void;                              // app backgrounded or overlay shown
  resume(): void;
  destroy(): void;                            // must release timers, listeners, audio, WebGL
}

export interface GameContext {
  storage: ScopedStorage;                     // namespaced "game:<slug>:"
  audio: AudioFacade;                         // play(sfx, { pitch?, volume? }); no-op when sound is off
  haptics: { impact(style: "light" | "medium" | "heavy"): void };
  viewport: { width: number; height: number; safeArea: Insets; onResize(cb: () => void): () => void };
  prefersReducedMotion: boolean;
  exit(): void;                               // ask host to return to library
}

export interface ScopedStorage {
  get<T>(key: string): Promise<T | undefined>;  // JSON-serializable values only
  set<T>(key: string, value: T): Promise<void>; // value ≤ 64 KB serialized
  remove(key: string): Promise<void>;
}
```

`Sfx` is a closed set of synthesized effects (`SFX_NAMES` in the SDK: tap, select, move,
drop, pop, bump, whoosh, success, combo, perfect, star, unlock, fail, win). `pitch` is a
multiplier the host clamps to 0.5–3 (games raise it for combos); `volume` is 0–1. The
host synthesizes every effect with WebAudio (`apps/shell/src/host/audio.ts`), so games
ship no audio files.

**Game kit (Roadmap D13).** Games normally do not implement `GameModule` by hand. The SDK
provides `createLevelGame` (numbered levels with 1–3 stars, a level map, win/stuck cards)
and `createRunGame` (endless runs with a best score) in `packages/game-sdk/src/kit.ts`, plus
effects in `juice.ts` (tweens, particles, screen shake, floating text). A game supplies a
controller with its rules, drawing and touch handling. Both shells store one value under
the scoped key `progress`:

```ts
interface LevelProgress { currentLevel: number; bestLevel: number; stars: number[] } // stars[i] ∈ 0..3
interface RunProgress { best: number; runs: number }
```

Saves without `stars` (pre-kit) load with one star per cleared level. The shell reads
these values read-only to show a progress line on library tiles
(`apps/shell/src/services/progress.ts`). `createRunGame` reports each finished run through
`events.levelComplete(runNumber)`.

**Lifecycle rules (conformance test asserts these):**

- Host call order: `mount → start → (pause ↔ resume)* → destroy`. `pause` is idempotent;
  `resume` without a prior `pause` is ignored.
- `mount` must resolve within 5 s `[Proposal]` or the host treats it as a load failure.
- After `destroy`, the game must not touch the DOM, storage, or audio; the test checks
  for leaked timers and listeners.
- Games must not call `fetch`, `XMLHttpRequest`, `WebSocket`, or Capacitor plugins
  directly; ESLint rule `no-restricted-globals`/`no-restricted-imports` in `games/*`.

## 2. Waitlist API (`IF-1`)

Base URL: the Worker's `*.workers.dev` URL in M1, a custom domain from M6 (Roadmap D5). JSON over HTTPS. CORS allows only the landing
page origin.

### `POST /v1/waitlist`

Request:

```json
{
  "email": "person@example.com",
  "pricePreference": "monthly_299 | monthly_499 | lifetime_1999 | free_only",
  "consent": true,
  "consentNoticeVersion": "2026-10-01",
  "attribution": { "utmSource": "tiktok", "utmMedium": "video", "utmCampaign": "ad-game-1", "utmContent": "v3", "referrerHost": "www.tiktok.com" },
  "turnstileToken": "..."
}
```

Validation (`FR-WL-2`, `SEC-5`): email ≤ 254 chars and passes a pragmatic RFC 5322
pattern; `pricePreference` from the enum (values track [BRD §6](../requirements/BRD.md#6-business-model-options));
`consent` must be `true`; each attribution field optional, ≤ 100 chars; body ≤ 4 KB.

Processing: verify Turnstile → rate limit (10 per IP-hash per hour) → normalize email
(`RULE-6`) → `INSERT … ON CONFLICT(email_normalized) DO UPDATE SET price_preference,
updated_at` (keeps original attribution, `FR-WL-3`).

Responses: `200 {"status":"ok"}` for both new and existing emails; `400` validation
error; `403` bot check failed; `429` rate limited; `500` internal. Envelope in §8.

### `POST /v1/waitlist/unsubscribe`

Request `{ "email": "...", "turnstileToken": "..." }`. Deletes the row if present.
Always `200 {"status":"ok"}` (no disclosure of membership) (`FR-WL-6`).

## 3. Submissions API (`IF-2`)

Headers on all app routes: `X-Install-Id: <UUIDv4>` (required), `X-App-Version`,
`X-Platform: ios|android`. The Worker computes
`installHash = HMAC-SHA256(HASH_PEPPER, installId)` and never stores the raw ID. IP addresses used for rate limiting are hashed the same way (`HMAC-SHA256(HASH_PEPPER, ip)`).

### 3.1 `POST /v1/submissions`

Headers: `Idempotency-Key: <clientId UUIDv4>`.

```json
{ "description": "Tower of colored rings you drop to sort...", "link": "https://...", "seenIn": "Some puzzle app" }
```

Validation per `RULE-7`. Processing *(as built)*: look up `client_id` first; an existing
row from the same install is returned as a replay (`200`) without consuming rate-limit
budget, so outbox retries never trip `RULE-8`. Otherwise: rate limit (`RULE-8`) →
`INSERT … ON CONFLICT(client_id) DO NOTHING` → select row by `client_id`. If the row's
`install_hash` differs from the caller's, respond `409`. The app headers are required;
a missing or invalid `X-Install-Id` is `400`.

Responses: `201 {"id": "<serverId>", "status": "received", "createdAt": "..."}` on first
insert; `200` with the same body on idempotent replay; `400`, `409`, `429`, `500`.

### 3.2 `GET /v1/submissions`

Returns the caller install's submissions, newest first, max 100:
`{"items":[{"id","clientId","status","publicNote","createdAt","updatedAt"}]}`. Never
returns description text of other installs (`FR-SUB-6`).

### 3.3 Analytics events (`IF-3`)

`POST /v1/events` with `{"events":[{"name","gameSlug?","ts"}]}`, max 50 per batch, plus
the app headers above. The install ID header is accepted for rate limiting only and is
**not** written to Analytics Engine.

Allowed event names (`FR-AN-1`): `app_open`, `game_start`, `game_complete_level`,
`game_exit`, `game_error`, `paywall_view`, `purchase_success`, `purchase_cancel`,
`restore_success`, `submission_sent`. Unknown names are dropped and counted.

Data point written: blobs `[name, gameSlug|"", platform, appVersion]`, double `[1]`,
index `name`. Responses: `202 {"accepted": n, "dropped": m}` *(as built)*; `400` on
malformed batch; `429`.

## 4. Catalog manifest

`apps/shell/src/catalog.json`, validated at build time (CI) and at startup:

```json
{
  "schemaVersion": 1,
  "games": [
    {
      "slug": "ring-sort",
      "title": "Ring Sort",
      "tier": "free",
      "addedInVersion": "1.0.0",
      "releasable": true,
      "icon": "drawn:ring-sort",
      "module": "ring-sort"
    }
  ]
}
```

Rules: `slug` is unique, `^[a-z0-9-]{3,40}$`; `tier` is `free|premium` (`RULE-1`);
`addedInVersion` is semver; only `releasable: true` entries are shown in release builds
(`RULE-9`); "New" is shown when `major.minor(addedInVersion) == major.minor(appVersion)`
and the local key `seen:<slug>` is unset (`RULE-12`). *(As built)* `icon: "drawn:<slug>"`
means the shell draws the icon in code (no image files); a path is still allowed for
future games. The startup validator is hand-written rather than Zod, to keep Zod out of
the shell's initial bundle.

## 5. D1 schema

Migration `0001_init.sql` (M1-T3) and `0002_submissions.sql` (M5):

```sql
-- 0001_init.sql
CREATE TABLE waitlist_entries (
  id                     TEXT PRIMARY KEY,            -- UUIDv4
  email_normalized       TEXT NOT NULL UNIQUE,
  price_preference       TEXT NOT NULL CHECK (price_preference IN ('monthly_299','monthly_499','lifetime_1999','free_only')),
  consent_at             TEXT NOT NULL,               -- ISO 8601 UTC
  consent_notice_version TEXT NOT NULL,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, referrer_host TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX idx_waitlist_created ON waitlist_entries(created_at);

CREATE TABLE rate_limits (
  scope        TEXT NOT NULL,                         -- e.g. 'waitlist:ip', 'sub:install', 'sub:ip'
  key_hash     TEXT NOT NULL,                         -- HMAC of IP or install ID
  window_start TEXT NOT NULL,                         -- start of fixed window, UTC
  count        INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash, window_start)
);

-- 0002_submissions.sql
CREATE TABLE submissions (
  id           TEXT PRIMARY KEY,                      -- server UUIDv4
  client_id    TEXT NOT NULL UNIQUE,                  -- Idempotency-Key
  install_hash TEXT NOT NULL,
  description  TEXT NOT NULL,
  link         TEXT,
  seen_in      TEXT,
  status       TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','reviewing','planned','declined','shipped')),
  public_note  TEXT,
  app_version  TEXT,
  platform     TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_sub_install ON submissions(install_hash, created_at);
CREATE INDEX idx_sub_status ON submissions(status, created_at);
```

`rate_limits` rows older than 48 hours are deleted by a daily Cron Trigger on the Worker,
so IP hashes are short-lived (`DATA-2`). Retention for `DATA-1` is enforced by the same
cron once the G1 date is set in configuration.

## 6. Submission status state machine

Allowed transitions (`RULE-10`, `FR-SUB-4`), implemented as a lookup table:

| From | To |
|---|---|
| `received` | `reviewing`, `declined` |
| `reviewing` | `planned`, `declined` |
| `planned` | `shipped`, `declined` |
| `declined` | `reviewing` |
| `shipped` | — |

Updates use optimistic concurrency: `UPDATE submissions SET status=?, public_note=?,
updated_at=? WHERE id=? AND status=?` (expected current status). *(As built)* A `from →
to` pair not in the table is `400 validation_failed`; a valid pair whose `from` no
longer matches the stored status is `409 conflict` with `currentStatus` in the error
envelope. An empty `publicNote` clears the note.

## 7. Admin API (`IF-6`)

All routes under `/admin/v1/`, behind Cloudflare Access; the Worker also verifies the
`Cf-Access-Jwt-Assertion` JWT (issuer, audience `ACCESS_AUD`, signature via the team's
JWKS, email in `OPERATOR_EMAILS`) and returns `401`/`403` otherwise (`SEC-3`). Unknown
paths under `/admin/` also return `401` before routing, so they do not reveal which
routes exist *(as built)*.

| Route | Purpose | Req |
|---|---|---|
| `GET /admin/v1/waitlist/stats?from=&to=` | Counts by day, `utm_source`, and `price_preference` | `FR-WL-5` |
| `GET /admin/v1/waitlist/export.csv` | All entries as CSV | `FR-WL-5` |
| `GET /admin/v1/submissions?status=&cursor=` | List, newest first, 50 per page, keyset cursor on `(created_at,id)` | `FR-SUB-5` |
| `PATCH /admin/v1/submissions/:id` | Body `{"from","to","publicNote?"}`; applies §6 | `FR-SUB-4`, `FR-SUB-5` |
| `DELETE /admin/v1/submissions/:id` | Remove abusive or personal content | `SEC-7` |

## 8. Error handling, retries, and idempotency

**Error envelope** for all non-2xx JSON responses:

```json
{ "error": { "code": "validation_failed", "message": "Human-readable text", "fields": { "email": "invalid" }, "requestId": "..." } }
```

Oversized bodies are rejected as `validation_failed` (400) rather than 413 *(as built)*.
Codes: `validation_failed` (400), `bot_check_failed` (403), `unauthorized` (401),
`forbidden` (403), `not_found` (404), `conflict` (409), `rate_limited` (429, with
`Retry-After`), `internal` (500).

**Rate limiting:** fixed windows in `rate_limits` via a single `INSERT … ON CONFLICT DO
UPDATE SET count = count + 1 RETURNING count` statement, which is atomic in D1; reject
when the returned count exceeds the limit. Limits: waitlist 10/IP-hash/hour; submissions
5/install/24h and 20/IP-hash/24h (`RULE-8`); events 60 batches/install/hour. Waitlist
unsubscribe shares the waitlist limit *(as built)*.

**Idempotency:** waitlist by unique normalized email; submissions by unique `client_id`
(retries return the original row). Analytics is not idempotent (duplicates acceptable).

**Client retries (outbox):** on network error, `5xx`, or `429`: retry with exponential
backoff starting at 30 s, doubling to a 6 h cap, honoring `Retry-After`; give up after
14 days `[Proposal]` and show the item as "Couldn't send". On `400`/`409`: mark `failed`
immediately with the server message. Only one delivery loop runs at a time (in-memory
lock), so an item is never sent concurrently by the same app process. *(As built)* Each
item stores `clientId`, `payload`, `attempts`, `nextAttemptAt`, `state`, `createdAt`,
and the last error, server ID, status, and public note; when the device comes back
online, items waiting after a network failure become due immediately.

**Turnstile failures** are not retried automatically; the web form asks the visitor to
try again.
