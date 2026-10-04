# Content cadence (M7)

How new games go from idea to release after launch. Target: 2 new games per month
([Roadmap D8](../ROADMAP.md#6-decisions-made-under-delegated-authority)); no public
cadence promise until the target is met three months in a row.

## Monthly cycle

1. **Pick (week 1).** Triage new submissions (`GET /admin/v1/submissions?status=received`):
   move promising ones to `reviewing`, then two to `planned` with a public note such as
   "We're building this one." Prefer ideas that are mechanically distinct from the
   current library and that can be made original (`BC-4`). Also consider genres from the
   current ad landscape.
2. **Build (weeks 1–3).** One PR per game: copy `games/_template`, implement logic with
   tests and the conformance suite, write README/ASSETS/ORIGINALITY/QA
   ([TDD §8](../design/TDD.md#8-content-pipeline)), add to the catalog with
   `addedInVersion` = next MINOR version, `tier: "premium"` unless the free set is being
   rotated.
3. **Release (week 4).** Follow the [release checklist](../release-checklist.md). After
   approval, move the source submissions to `shipped` with a note naming the game.
4. **Review.** Record games shipped, the share sourced from submissions, and paid
   retention in a short monthly note under `docs/validation/` (`BO-3` measures).

## Rules

- Every game passes the originality review before `releasable: true` (`RULE-9`).
- No game ships without the device checklist on the release build.
- Two consecutive missed months → re-plan scope (smaller games, or one larger update)
  and record the change as a new decision in the roadmap.
