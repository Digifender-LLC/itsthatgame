# Runbook: demand-validation campaign and G1 readout

**Needs:** the landing page live (M1-T5). **Produces:** M1-T6 readout and the Gate G1
outcome. **References:** [BRD §7](../requirements/BRD.md#7-success-measures),
[Roadmap D2](../ROADMAP.md#6-decisions-made-under-delegated-authority).

## 1. Campaign (4 weeks)

- Post short videos in the "we built the game from the ad" format, using footage of our
  own games only (never others' ads or gameplay). Test three angles: the ad-game hook,
  offline play, and ad-free for families (no child-directed claims, D3).
- Every link uses UTM parameters so signups are attributable (`FR-WL-4`):
  `?utm_source=<platform>&utm_medium=video&utm_campaign=<angle>&utm_content=<video-id>`.
- Record per video: views (from the platform), link clicks, and the `utm_content` id.
- Posting publicly is an outward action on the owner's accounts; agents prepare the
  videos and captions, and post only with account access.

## 2. Readout (commit as `docs/validation/<YYYY-MM-DD>-g1-readout.md`)

Pull numbers from `GET /admin/v1/waitlist/stats` for the window, then fill
[`../validation/readout-template.md`](../validation/readout-template.md). Apply rule D2
mechanically and record the outcome in [Roadmap Gate G1](../ROADMAP.md#gate-g1-demand-go--no-go).
