# Software Requirements Specification (SRS)

**Status:** Current, draft-1 (2026-10-04). **Owns:** every uniquely identified,
verifiable requirement. Other documents reference these IDs and must not restate them
with different wording. Workflows and rules referenced here are in the [FRD](FRD.md);
interfaces are detailed in the [LLD](../design/LLD.md).

**Columns.** *Pri*: Must / Should / Could. *Source*: capability or rule it derives from.
*Design*: where it is satisfied. *MS*: delivering milestone in the
[Roadmap](../ROADMAP.md#5-milestones). *Verification*: method (T = automated test,
I = inspection, D = demonstration, A = analysis/measurement) and the planned check.

**Verification status:** as of 2026-10-04, the automated checks listed in
[§6](#6-verification-evidence) exist and pass in PR #1. Checks that need production,
real stores, or devices (Roadmap P1–P4) are still *planned*. When a test is written, add
its path to §6.

**Targets vs. constraints.** Numbers marked `[Proposal]` are proposed targets, not
established commitments. They can be changed by the owner or by evidence (e.g. M2
measurements) without an ADR.

## 1. Functional requirements

### 1.1 Waitlist (`CAP-1`)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| `FR-WL-1` | The landing page shall present the value proposition, a price-preference choice (test arms per [BRD §6](BRD.md#6-business-model-options), including "only if it were free"), an email field, and a consent checkbox linked to the privacy notice. | Must | `CAP-1` | HLD §4.1 | M1 | T: Playwright renders all elements; I: copy review |
| `FR-WL-2` | The system shall store a waitlist entry only when the email is syntactically valid, consent is given, and the bot check passes. | Must | `RULE-6` | LLD §2 | M1 | T: Worker tests per failure case |
| `FR-WL-3` | Repeat signups with the same normalized email shall not create duplicates and shall return the same success response as a first signup. | Must | `RULE-6` | LLD §2, §5 | M1 | T: Worker test, two signups → one row |
| `FR-WL-4` | The system shall record first-party source attribution (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and referrer host) with each entry, without third-party pixels. | Must | `BO-4` | LLD §2 | M1 | T: stored fields match request; I: no third-party scripts on page |
| `FR-WL-5` | The operator shall be able to view signup totals by day, source, and price preference, and export entries as CSV, without direct database access. | Must | `CAP-1` | LLD §7 | M1 | T: stats match fixtures |
| `FR-WL-6` | A visitor shall be able to remove their entry by email (with a bot check); removal deletes the record. | Must | `DATA-1` | LLD §2 | M1 | T: unsubscribe deletes row |

### 1.2 App and games (`CAP-2`, `CAP-3`, `CAP-9`, `CAP-10`)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| `FR-APP-1` | The app shall list every game in the bundled catalog manifest with its name, icon, and locked/unlocked state. | Must | `CAP-2` | SDD §3, LLD §4 | M2 | T: shell renders manifest fixture |
| `FR-APP-2` | Tapping an unlocked game shall start it; exiting shall return to the library; backgrounding shall pause the game and foregrounding shall resume it. | Must | `CAP-2`, WF-2 | SDD §3, LLD §1 | M2 | T: lifecycle order test; D: device checklist |
| `FR-APP-3` | All installed games and the library shall be fully functional with no network connection from install onward. | Must | `CAP-3` | ADR-0007 | M2 | D: airplane-mode checklist on iOS and Android |
| `FR-APP-4` | Each game's progress shall persist on device across app restarts and updates, isolated per game. | Must | `CAP-10` | LLD §1 | M2 | T: storage scoping test; D: restart check |
| `FR-APP-5` | Games added in the installed app version shall display a "New" badge until first opened. | Should | `RULE-12` | LLD §4 | M3 | T: badge logic unit test |
| `FR-APP-6` | Settings shall provide toggles for sound effects, music, and haptics, persisted on device. | Must | `CAP-10` | SDD §3 | M2 | T: settings persistence test |
| `FR-GAME-1` | Every game shall implement the game module contract (`IF-5`) and pass the SDK conformance test. | Must | `CAP-9` | LLD §1 | M2 | T: conformance test per game in CI |
| `FR-GAME-2` | No game shall be marked releasable without a committed, completed originality checklist. | Must | `RULE-9`, `BC-4` | TDD §8 | M3 | T: CI check that every releasable catalog entry has a checklist file; I: review |

### 1.3 Entitlement (`CAP-4`, `CAP-5`, `CAP-6`)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| `FR-ENT-1` | Games with `tier: "free"` shall be playable without any purchase and without network access. | Must | `RULE-1` | SDD §4 | M4 | T: gating unit test |
| `FR-ENT-2` | Tapping a locked game shall show the paywall; the paywall shall not appear in any other situation except from Settings. | Must | `RULE-3` | SDD §4 | M4 | T: gating unit test; I: code review |
| `FR-ENT-3` | The app shall sell the products configured in RevenueCat (subscription and/or lifetime) via the store's in-app purchase, with prices displayed from the store, and shall unlock all premium games on success. | Must | `CAP-5`, `BC-3`, `BC-6` | ADR-0005, SDD §4 | M4 | D: sandbox purchase on iOS and Android |
| `FR-ENT-4` | The app shall provide "Restore purchases", which applies any active entitlement for the current store account. | Must | `CAP-6` | SDD §4 | M4 | D: reinstall-and-restore in sandbox |
| `FR-ENT-5` | When entitlement cannot be refreshed, the app shall honor a cached active entitlement per `RULE-4`. | Must | `RULE-4` | SDD §4, FRD §4 | M4 | T: state-machine unit tests with clock control |
| `FR-ENT-6` | When an entitlement lapses, premium games shall relock and their progress shall be retained. | Must | `RULE-5` | SDD §4 | M4 | T: unit test; D: sandbox subscription expiry |

### 1.4 Submissions (`CAP-7`, `CAP-8`)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| `FR-SUB-1` | The app shall let a player submit a game idea with fields and limits per `RULE-7`, validated on client and server. | Must | `CAP-7` | LLD §3 | M5 | T: Worker validation tests; client form test |
| `FR-SUB-2` | Submissions made offline shall be queued on device and delivered exactly once when connectivity returns. | Must | WF-5 | LLD §3, §8 | M5 | T: idempotent retry test (same client ID → one row) |
| `FR-SUB-3` | The server shall enforce `RULE-8` rate limits and respond 429 when exceeded. | Must | `RULE-8` | LLD §8 | M5 | T: Worker test |
| `FR-SUB-4` | Submission status shall follow the `RULE-10` state machine; invalid transitions shall be rejected. | Must | `RULE-10` | LLD §6 | M5 | T: transition table test |
| `FR-SUB-5` | The operator shall be able to list submissions by status and change status with an optional public note. | Must | `CAP-8` | LLD §7 | M5 | T: admin API tests |
| `FR-SUB-6` | The app shall show the player the status and public note of each submission made from that install. | Must | `CAP-7` | LLD §3 | M5 | T: status endpoint returns only that install's items |

### 1.5 Analytics (`CAP-11`)

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| `FR-AN-1` | The app shall send only the events listed in [LLD §3.3](../design/LLD.md#33-analytics-events-if-3) to the first-party endpoint, carrying no device identifiers, advertising IDs, location, or contact data. | Should | `CAP-11` | ADR-0003, LLD §3.3 | M6 | T: event schema test; I: payload review |
| `FR-AN-2` | Settings shall offer an analytics opt-out that takes effect immediately per `RULE-11`. | Should | `RULE-11` | SDD §5 | M6 | T: no events sent after opt-out |

## 2. Non-functional requirements

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| `NFR-1` | Cold start to interactive library ≤ 3 s on a reference mid-range Android device `[Proposal]`. | Should | PRD §7 | TDD §2 | M2 | A: measured on device, recorded in PR |
| `NFR-2` | Games target 60 fps and shall not drop below 30 fps sustained on the reference device `[Proposal]`. | Should | PRD §7 | TDD §2 | M2 | A: frame-time capture |
| `NFR-3` | Installed app size ≤ 150 MB at launch `[Proposal]`; CI reports size per build. | Should | `BC-2` | TDD §8 | M3 | A: CI size report |
| `NFR-4` | Accessibility: UI text respects system font scaling in the shell; touch targets ≥ 44×44 pt; no information conveyed by color alone; reduced-motion setting honored by shell animations; screen-reader labels on shell controls. | Must | PRD §7 | SDD §3 | M2 (shell), M3 (games) | T: axe check on shell web build; I: per-game checklist |
| `NFR-5` | Supported platforms: iOS 16+ and Android 8.0 (API 26)+ `[Proposal]`, phones in portrait. | Must | — | TDD §2 | M2 | D: run on oldest supported simulator/emulator |
| `NFR-6` | No player-facing app feature except purchase, restore, submission delivery, and analytics may require the backend; backend outages shall not prevent play. | Must | `CAP-3` | HLD §3 | M6 | D: play with API blocked |
| `NFR-7` | Backend running cost at MVP volume stays within Cloudflare's lowest paid tier `[Proposal]`. | Should | `BC-2` | TDD §9 | M6 | A: monthly bill review |
| `NFR-8` | Landing page Largest Contentful Paint < 2.5 s on a mid-range phone over 4G `[Proposal]`. | Should | `BO-1` | TDD §2 | M1 | A: Lighthouse mobile report |

## 3. Security and privacy requirements

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| `SEC-1` | The app and landing page shall include no advertising, ad-attribution, or third-party tracking SDKs or scripts. CI shall fail on dependencies from the denylist. | Must | `BC-1`, ADR-0003 | TDD §6 | M1 (guard), M6 (audit) | T: CI guard; I: release dependency audit |
| `SEC-2` | Secrets (Turnstile secret, RevenueCat keys other than the public SDK key, signing material) shall be stored only in Cloudflare/CI secret stores, never in the repository. | Must | — | TDD §7 | M1 | T: secret scanning in CI; I: review |
| `SEC-3` | All `/admin/*` routes shall require a valid Cloudflare Access identity for the operator, verified in the Worker. | Must | FRD §1 | LLD §7 | M1 | T: requests without valid JWT → 401/403 |
| `SEC-4` | Public write endpoints shall be protected by bot verification (Turnstile on web) and rate limits. | Must | `RULE-8` | LLD §8 | M1, M5 | T: Worker tests |
| `SEC-5` | All input shall be validated server-side against the LLD schemas; submission text shall be treated as untrusted and never rendered as HTML. | Must | — | LLD §2, §3 | M1, M5 | T: validation tests; I: rendering review |
| `SEC-6` | All network traffic shall use HTTPS; the API shall send HSTS and restrict CORS to the landing-page origin for web routes. | Must | — | TDD §7 | M1 | T: header test |
| `SEC-7` | The app shall not be directed at children and shall not knowingly collect personal data from children (`BC-5`); store age rating and listing copy shall be consistent with this. | Must | `BC-5` | HLD §5 | M6 | I: listing and rating review |

## 4. Data requirements

| ID | Requirement | Pri | Source | Design | MS | Verification |
|---|---|---|---|---|---|---|
| `DATA-1` | Waitlist entries store only: normalized email, price preference, consent timestamp and notice version, attribution fields (`FR-WL-4`), created/updated timestamps. Retained until removal request or 12 months after the G1 decision, whichever is first. | Must | `CAP-1` | LLD §5 | M1 | I: schema review; T: deletion |
| `DATA-2` | Submissions store: server ID, client ID, SHA-256 hash of install ID, description, optional link and "where seen", status, public note, timestamps. No names, emails, or IP addresses are stored with submissions. | Must | ADR-0008 | LLD §5 | M5 | I: schema review |
| `DATA-3` | Analytics events are stored only as aggregates or with a rotating install-scoped ID, retained ≤ 13 months `[Proposal]`. | Should | `FR-AN-1` | TDD §9 | M6 | I: storage configuration review |
| `DATA-4` | On-device data (progress, settings, entitlement cache, submission outbox, install ID) stays on device, is not backed up to any server we operate, and is removed on uninstall. | Must | ADR-0006 | SDD §3 | M2 | I: storage review |
| `DATA-5` | Production D1 data shall be recoverable to a point in time within the provider's retention window; restore shall be rehearsed once before M6. | Should | `BC-2` | TDD §7 | M6 | D: restore rehearsal recorded |

## 5. Interface requirements

| ID | Interface | Pri | MS | Contract |
|---|---|---|---|---|
| `IF-1` | Waitlist HTTP API (public) | Must | M1 | [LLD §2](../design/LLD.md#2-waitlist-api-if-1) |
| `IF-2` | Submissions HTTP API (app) | Must | M5 | [LLD §3](../design/LLD.md#3-submissions-api-if-2) |
| `IF-3` | Analytics ingest HTTP API (app) | Should | M6 | [LLD §3.3](../design/LLD.md#33-analytics-events-if-3) |
| `IF-4` | RevenueCat client SDK and store purchase APIs | Must | M4 | [ADR-0005](../adr/0005-store-iap-via-revenuecat.md), [SDD §4](../design/SDD.md#4-entitlement) |
| `IF-5` | Game module contract (internal TypeScript interface) | Must | M2 | [LLD §1](../design/LLD.md#1-game-sdk-contract-if-5) |
| `IF-6` | Admin HTTP API (operator) | Must | M1, M5 | [LLD §7](../design/LLD.md#7-admin-api-if-6) |

## 6. Verification evidence

Automated checks that exist as of 2026-10-04 (PR #1). Paths are relative to the repository
root. Requirements not listed have only planned verification, mostly on devices, stores, or
production (see the Roadmap status table).

| Requirements | Evidence |
|---|---|
| `FR-WL-1`, `FR-WL-4`, `NFR-4` (landing), `NFR-8` | `apps/landing/e2e/landing.spec.ts` (signup body with UTM, 320 px layout, axe on every page) |
| `FR-WL-2`, `FR-WL-3`, `SEC-4`, `SEC-5`, `DATA-1` | `services/api/test/waitlist.test.ts` |
| `FR-WL-5`, `FR-WL-6`, `SEC-3`, `IF-6` | `services/api/test/admin.test.ts`, `services/api/test/waitlist.test.ts` (unsubscribe) |
| `SEC-6` | `services/api/test/worker.test.ts` (CORS, HSTS, unknown routes) |
| `SEC-1` | `scripts/check_deps.mjs`, `scripts/check_deps.test.mjs`; ESLint bans network and platform APIs in `games/*` |
| `FR-APP-1`, `FR-APP-2`, `FR-APP-5` | `apps/shell/src/catalog.test.ts`, `apps/shell/src/screens/Library.test.tsx`, `apps/shell/e2e/shell.spec.ts` |
| `FR-APP-3`, `FR-APP-4`, `FR-APP-6`, `DATA-4` | `apps/shell/src/services/prefs.test.ts`, `apps/shell/src/host/gameHost.test.ts`, per-game progress tests in `games/*/src/*.test.ts` |
| `FR-GAME-1`, `IF-5` | `packages/game-sdk/src/index.test.ts`; `describeConformance` in every `games/*` test suite |
| `FR-GAME-2` | `scripts/check_catalog.mjs` (originality, QA, assets files required for releasable games) |
| `FR-ENT-1`…`FR-ENT-6`, `IF-4` (client side) | `apps/shell/src/services/entitlementMachine.test.ts`, `apps/shell/src/services/entitlement.test.ts`, `apps/shell/e2e/shell.spec.ts` (paywall, dev-adapter purchase) |
| `FR-SUB-1`…`FR-SUB-6`, `IF-2`, `DATA-2` | `services/api/test/submissions.test.ts`, `services/api/test/admin.test.ts`, `apps/shell/src/services/outbox.test.ts`, `apps/shell/e2e/shell.spec.ts` (offline request delivered once) |
| `FR-AN-1`, `FR-AN-2`, `IF-3` | `services/api/test/events.test.ts`, `apps/shell/src/services/analytics.test.ts` |
| `NFR-3` | `scripts/check_bundle_size.mjs` in CI (2026-10-04: 250.9 KB total, 44.5 KB initial JS gzip) |
