# Technical Design Document (TDD)

*TDD here means Technical Design Document, not test-driven development.*

**Status:** Current, draft-1 (2026-10-04). Implemented in PR #1 except the production, store, and device parts (see the [Roadmap status](../ROADMAP.md#5-milestones)).
**Owns:** concrete engineering choices and their tradeoffs, repository layout, tooling,
testing strategy, CI/CD, environments and release, content pipeline, observability,
capacity, cost, and migration considerations. Architecture-level decisions are recorded
in [ADRs](../adr/README.md); this document applies them.

## 1. Scope

Covers the landing page, mobile app shell, games, game SDK, and API Worker through v1.0
(Roadmap M1–M6). Post-launch (M7) reuses the same pipeline.

## 2. Technology choices

All choices are `[Delegated]` unless noted. Versions are "latest stable at the time of
M1-T1", pinned in the lockfile; this document deliberately does not pin them.

| Area | Choice | Alternatives considered | Why |
|---|---|---|---|
| Language | TypeScript (strict) everywhere | Kotlin/Swift, C# (Unity), Dart (Flutter) | One language for app, games, and backend; best fit for agent-assisted development; [ADR-0002](../adr/0002-typescript-games-in-capacitor-shell.md) |
| Native shell | Capacitor | React Native, Flutter, Unity | Runs web games natively with minimal glue; access to store purchases via plugins; [ADR-0002](../adr/0002-typescript-games-in-capacitor-shell.md) |
| Shell UI | Plain TypeScript + lightweight view layer (Preact) built with Vite | React, Svelte, Ionic | Small bundle (`NFR-1`), familiar component model; no UI kit needed for a few screens |
| Game rendering | Plain Canvas 2D with SDK helpers (`createCanvas`, `createLoop`, `onPointer`); an engine such as Phaser is allowed per game | Phaser by default (the draft-1 choice), PixiJS, Babylon | The launch games are simple 2D puzzles; pin-drop's physics is a few lines of fixed-step integration. Canvas keeps the whole app near 250 KB. Games choose behind `IF-5`, so this is not an ADR-level lock-in (Roadmap D11) |
| Purchases | RevenueCat Capacitor SDK | Direct StoreKit/Play Billing plugins + own receipt server | [ADR-0005](../adr/0005-store-iap-via-revenuecat.md) |
| Backend | Cloudflare Workers, D1, Analytics Engine, Turnstile, Access, Pages | Firebase, Supabase, AWS Lambda | [ADR-0004](../adr/0004-cloudflare-workers-d1-backend.md) |
| Validation | Zod schemas in `packages/contracts`, shared by client and Worker | Hand-written validators, JSON Schema | One source for `RULE-*` limits (SDD §1.4) |
| Package manager | pnpm workspaces | npm, yarn | Strict dependency isolation; fast CI |
| Tests | Vitest; `@cloudflare/vitest-pool-workers` for Worker tests; Playwright for web builds | Jest | Vite-native; Workers runtime fidelity |
| Lint/format | ESLint + Prettier | Biome | Ecosystem coverage; replaceable later without impact |

**Reference devices `[Proposal]`:** iPhone SE (2nd gen) for iOS minimum, a mid-range
Android phone with ~4 GB RAM from 2021 or later for `NFR-1`/`NFR-2` measurements.

## 3. Repository layout

Layout as built (2026-10-05). The native Android project `apps/shell/android/` is
committed (Roadmap D15); `apps/shell/ios/` is not generated while iOS is deferred
([ADR-0009](../adr/0009-android-first-ios-deferred.md)).

```text
agents.md                 agent instructions (authoritative)
CLAUDE.md                 imports agents.md
docs/                     specifications (this set)
scripts/                  check_docs.py, check_deps.mjs, check_catalog.mjs, check_bundle_size.mjs
apps/landing/             landing page (M1-T2)
apps/shell/               Capacitor app shell and committed android/ project (M2-T2, D15)
packages/contracts/       shared Zod schemas and types for IF-1/2/3/6 (M1-T3)
packages/game-sdk/        IF-5 contract, helpers, game kit (kit.ts, juice.ts; D13), conformance test (M2-T1)
games/<slug>/             one package per game (M2-T3+)
games/_template/          game scaffold (M3)
services/api/             Cloudflare Worker, migrations/, wrangler config (M1-T3)
```

Workspace scripts at the root: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`,
`pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm deps:check`, `pnpm docs:check` (runs
`python3 scripts/check_docs.py`), and `pnpm check` (all fast checks).

## 4. Development workflow

- Trunk-based: short-lived branches, PR per roadmap task, squash merge to the default
  branch. The default branch must always pass CI.
- Agents follow [agents.md](../../agents.md): read the roadmap task, implement, update
  docs and roadmap status in the same PR.
- Local backend: `wrangler dev` with local D1; seed script for fixtures.
- Shell development: browser first (`vite dev`), then `npx cap sync` and run in
  simulators/emulators for lifecycle, storage, and purchase work.

## 5. Testing strategy

| Level | What | Where | Runs |
|---|---|---|---|
| Unit | Contracts, catalog loader, entitlement state machine (with fake clock), outbox, game logic (level solvability) | Vitest in each package | Every PR |
| Worker integration | Every route: success, validation, duplicate/idempotent, rate limit, auth failure | `services/api/test` with Workers pool and local D1 | Every PR |
| Game conformance | Each game mounts, starts, pauses, resumes, destroys without errors in a headless DOM/canvas; storage scoped | `packages/game-sdk/conformance` run per game | Every PR |
| E2E web | Landing signup flow; shell library and launch/exit with a stub game; axe accessibility scan of shell screens | Playwright (Chromium) | Every PR |
| Device checklist | Install, airplane-mode play, background/resume, restart persistence, purchase/restore (sandbox), oldest OS versions, frame rate | Manual, recorded as a checklist in the PR | M2-T5, M4, every release |
| Release checklist | Device checklist + dependency audit (`SEC-1`) + privacy label review + store metadata review | `docs/release-checklist.md` (created in M6) | Every store release |

The SRS lists the planned verification for every requirement; when a test is added, its
path is recorded in the SRS row.

## 6. CI quality gates and security checks

GitHub Actions on every PR and on the default branch:

1. `pnpm install --frozen-lockfile`
2. Lint, typecheck, unit and Worker integration tests, Playwright E2E
3. `python3 scripts/check_docs.py`
4. **Ad/tracking dependency guard** (`SEC-1`): fails if any workspace's resolved
   dependency tree contains a denylisted package. Initial denylist (extend as found):
   `@capacitor-community/admob`, `google-mobile-ads`, `react-native-google-mobile-ads`,
   `@react-native-firebase/analytics`, `firebase` (analytics module), `appsflyer*`,
   `react-native-appsflyer`, `adjust*`, `branch-sdk`, `react-native-branch`,
   `applovin*`, `ironsource*`, `unity-ads*`, `facebook-*sdk*`, `mixpanel*`, `amplitude*`,
   `@segment/*`. Crash/error SDKs (e.g. Sentry) are not denylisted but require an ADR.
5. Secret scanning on push (`SEC-2`).
6. From M3: app bundle size report (`NFR-3`) and originality-checklist presence check
   (`FR-GAME-2`).

The `android` CI job builds a debug APK on every PR and main push and uploads it as a
workflow artifact; on main it also refreshes the rolling `android-debug` prerelease
(Roadmap D16, [runbooks/android-sideload.md](../runbooks/android-sideload.md)). Release
builds (upload-key signing, store upload) run in a separate workflow triggered manually or
by release tags; iOS builds need a macOS runner `[Assumption]` and are deferred
([ADR-0009](../adr/0009-android-first-ios-deferred.md)).

## 7. Environments, configuration, and release

| Concern | Approach |
|---|---|
| Environments | `local`, `preview`, `production` ([HLD §6](HLD.md#6-deployment-topology)) |
| Config | `wrangler.toml` per environment for bindings (D1, Analytics Engine) and non-secret vars (allowed origin, operator emails); app config via Vite env at build time (API base URL, RevenueCat public SDK key) |
| Secrets | `wrangler secret put` (`TURNSTILE_SECRET`, `ACCESS_AUD`, `HASH_PEPPER`); GitHub Actions secrets for deploy token and signing; never in repo (`SEC-2`) |
| Backend deploy | Merge to default branch deploys `preview` automatically; `production` deploy is a manual, approved workflow run. Rollback: `wrangler rollback` to previous Worker version; Pages rollback to previous deployment |
| DB migrations | Forward-only, additive SQL in `services/api/migrations`; applied to preview first, then production before the code that needs them; destructive changes take two releases (stop using, then drop) |
| Backups and recovery | D1 point-in-time recovery (Time Travel) within Cloudflare's retention window; rehearse one restore into a scratch database before M6 (`DATA-5`) |
| App release | Version `MAJOR.MINOR.PATCH`; new games bump MINOR. TestFlight and Play internal testing first, then staged rollout on Play; phased release on App Store |
| App rollback | Not possible in stores; mitigate with staged rollout, and keep the backend backward-compatible with every app version still in use |

## 8. Content pipeline

Per game (enforced from M3, `FR-GAME-1`, `FR-GAME-2`, `RULE-9`):

1. Scaffold from `games/_template` (contract, Canvas skeleton, conformance test).
2. Design note in `games/<slug>/README.md`: mechanic, inspiration (genre/ad format, not a
   specific copyrighted game's assets), level plan.
3. Original assets only: drawn, generated with tools whose license permits commercial use,
   or licensed (license file committed). Record sources in `games/<slug>/ASSETS.md`.
4. **Originality checklist** `games/<slug>/ORIGINALITY.md`: name searched for conflicts in
   both stores; no traced or ripped art/audio; distinct color scheme, characters, UI, and
   title screen from the closest known commercial game; reviewer sign-off (owner).
5. **QA checklist** `games/<slug>/QA.md`: conformance test, level solvability test,
   accessibility items (`NFR-4`), device checklist.
6. Add to `catalog.json` with `tier` and `addedInVersion`; mark `releasable: true` only
   after steps 4–5.

## 9. Observability, capacity, and cost

- **Backend:** Workers logs and metrics in the Cloudflare dashboard; structured JSON logs
  with request ID, route, status, latency; no request bodies or emails logged. Alerting:
  Cloudflare notifications on Worker error-rate spikes to the owner's email.
- **App:** platform crash reporting (App Store Connect, Play Console vitals); no
  third-party crash SDK in MVP. Game errors also emit the `game_error` analytics event.
- **Analytics storage:** Workers Analytics Engine data points (event name, game slug,
  app version, platform, day); per-install rotating ID is not stored in v1, so analytics
  are aggregate-only. Retention per provider (currently shorter than the 13-month
  ceiling in `DATA-3`).
- **Capacity `[Assumption]`:** validation traffic in the thousands of visits; launch in
  the low tens of thousands of installs. All are far within Workers/D1 limits; no
  scaling design is needed for v1. Revisit if daily active installs exceed 100k.
- **Cost `[Proposal]`:** Workers paid plan base fee plus negligible usage; RevenueCat
  free until its revenue threshold; store fees (15–30%) dominate unit economics and must
  be included in BO-4 calculations.

## 10. Migration and evolution considerations

- **Adding accounts later** (revisits [ADR-0006](../adr/0006-no-accounts-install-scoped-identity.md)):
  RevenueCat app user IDs can be aliased to an account ID; local progress can be uploaded
  on first sign-in. Nothing in v1 blocks this.
- **Changing price model:** remote in RevenueCat offerings; no app change if the
  `full_library` entitlement is kept.
- **Switching render engine for a game:** contained in that game's package.
- **Moving off Cloudflare:** Worker code is standard `fetch`-handler TypeScript; D1 is
  SQLite-compatible SQL. Main lock-in is Access and Turnstile, both replaceable.

## 11. Conditions to revisit

- M2 measurements miss `NFR-1`/`NFR-2` badly on the reference Android device → evaluate a
  native or engine-based shell (new ADR superseding ADR-0002).
- Store review rejects the web-based shell → same.
- Owner wants web checkout to avoid store fees → legal review, then ADR superseding
  ADR-0005.
