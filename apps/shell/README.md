# @itg/shell — ItsThatGame app shell

Preact + Vite web app wrapped by Capacitor for iOS and Android (M2-T2, M3 "New" badge,
M4 entitlement, M5 requests client, M6 analytics client). Specs: [SDD](../../docs/design/SDD.md),
[LLD §1, §3, §4, §8](../../docs/design/LLD.md), [FRD](../../docs/requirements/FRD.md).

## Commands

Run from the repo root (or drop `--filter` inside this folder):

| Command | What it does |
|---|---|
| `pnpm --filter @itg/shell dev` | Vite dev server on http://localhost:5174 |
| `pnpm --filter @itg/shell build` | Production web build into `dist/` (one chunk per game) |
| `pnpm --filter @itg/shell typecheck` | `tsc` in strict mode |
| `pnpm --filter @itg/shell test` | Vitest unit/component tests (happy-dom) |
| `pnpm --filter @itg/shell test:e2e` | Playwright (Chromium) against `vite preview` on port 4174, incl. axe scans |
| `pnpm --filter @itg/shell cap:sync` | Copy `dist/` and plugins into the native projects |

## Native projects

`ios/` and `android/` are generated, not committed (`.gitignore`). On a machine with Xcode /
Android Studio: `pnpm --filter @itg/shell build`, then `npx cap add ios` / `npx cap add android`
once, then `pnpm --filter @itg/shell cap:sync` after every web build and open the project with
`npx cap open ios|android`. App ID `com.digifender.itsthatgame` ([capacitor.config.ts](capacitor.config.ts)).

## Environment variables

Copy `.env.example` to `.env.local` (never commit real `.env` files). All are optional in dev.

| Variable | Use |
|---|---|
| `VITE_API_BASE` | API Worker base URL for `/v1/submissions` and `/v1/events`. Default `http://127.0.0.1:8787` (`wrangler dev`). |
| `VITE_RC_IOS_KEY`, `VITE_RC_ANDROID_KEY` | RevenueCat public SDK keys per platform. |
| `VITE_PRIVACY_URL`, `VITE_TERMS_URL`, `VITE_SUPPORT_URL` | Public pages linked from Settings and the paywall. |

## Purchase adapter selection

`src/services/purchases.ts` → `createAdapter()`:

- **Native (`Capacitor.isNativePlatform()`)**: `RevenueCatAdapter`. Configures the SDK with the
  platform key and an anonymous app user ID, reads only the `full_library` entitlement
  (never product IDs), and maps cancel / "Ask to Buy" pending errors.
- **Browser**: `DevAdapter`. Shows the Roadmap D1 prices ($2.99/month, $19.99 lifetime)
  marked "Sandbox: no real charge"; buying sets a local flag. Clear site data to relock.

The entitlement state machine (`entitlementMachine.ts`, FRD §4) is pure and tested with a
fake clock; `EntitlementService` refreshes on start and foreground and caches
`{active, expiresAt, checkedAt}` with a 7-day offline grace (`RULE-4`, D9).

## Adding a game to the catalog

1. Build the game in `games/<slug>/` from `games/_template` (it must pass the SDK conformance test).
2. Add `"@itg/game-<slug>": "workspace:*"` to this package's dependencies and run `pnpm install`.
3. Add a loader to `GAME_MODULES` in [src/catalog.ts](src/catalog.ts):
   `"<slug>": () => import("@itg/game-<slug>")`.
4. Add the entry to [src/catalog.json](src/catalog.json): `slug`, `title`, `tier`
   (`free`|`premium`), `addedInVersion` (the app version that ships it, so it shows "New"),
   `releasable` (only after the originality checklist, `RULE-9`), `icon`, `module`.
5. For the icon, either add a drawing to `src/components/GameIcon.tsx` and use
   `"icon": "drawn:<slug>"`, or point `icon` at an image path.
6. Run the tests: `validateCatalog()` checks every rule in LLD §4 at startup and in tests.

`validateCatalog(json, knownModules?)` is a pure export of `src/catalog.ts` so repo scripts
and CI can reuse it.

## Layout

```
src/
  config.ts            build-time config (APP_VERSION, API base, RC keys, grace)
  catalog.json/.ts     manifest, validation, module map, "New" logic
  platform.ts          Capacitor wrappers (app state, network, haptics)
  host/                game host (lifecycle, failure isolation) and WebAudio facade
  services/            prefs + install ID, entitlement, purchases, outbox, analytics
  screens/             Library, Game, Settings, Paywall, Request a game, My requests
e2e/                   Playwright specs
```
