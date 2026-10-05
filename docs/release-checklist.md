# Release checklist

Run for every store release ([TDD §5](design/TDD.md#5-testing-strategy)). Copy into the
release PR and tick each item with evidence.

## Automated (CI on the release commit)

- [ ] CI green: lint, typecheck, unit, Worker integration, conformance, E2E, docs check.
- [ ] Ad/tracking dependency guard passes (`SEC-1`); also review the lockfile diff since
      the last release for new SDKs.
- [ ] Catalog check passes: every releasable game has ORIGINALITY.md and QA.md
      (`FR-GAME-2`).
- [ ] Bundle-size report within budget (`NFR-3`).
- [ ] The release build environment does **not** set `VITE_ALLOW_DEV_PURCHASES`, and sets
      the RevenueCat key for the platform (Roadmap D16). A store build with the sandbox
      unlock would give premium games away.

## Manual

- [ ] Device checklist in [runbooks/mobile-builds.md](runbooks/mobile-builds.md) completed.
- [ ] Sandbox purchase and restore checks in
      [runbooks/stores-and-revenuecat.md](runbooks/stores-and-revenuecat.md) pass.
- [ ] Play with the API unreachable: all unlocked games work (`NFR-6`).
- [ ] Store privacy labels match `DATA-*`: Apple "Data Not Linked to You" — usage data
      (aggregate analytics), purchases (via store/RevenueCat); Google Data safety equivalent;
      no tracking.
- [ ] Age rating questionnaire consistent with D3 (not directed at children); no
      child-directed listing copy (`SEC-7`).
- [ ] Privacy policy and support pages live and linked from Settings and the listing.
- [ ] New games in this version have `addedInVersion` set to this version (`RULE-12`).
- [ ] Version bumped (`MAJOR.MINOR.PATCH`; new games bump MINOR).
- [ ] Backend changes deployed to production before the app release and compatible with
      older app versions still in use.
