# ADR-0008: Text-only, private, moderated submissions

- **Status:** Accepted
- **Date:** 2026-10-04
- **Provenance:** [Delegated] (the submission feature itself is [User])
- **Supersedes / superseded by:** —
- **Related requirements:** `FR-SUB-*`, `IF-2`, `IF-6`, `DATA-2`, `SEC-4`, `SEC-5`, `SEC-7`

## Context

Players can submit games they saw in ads (`CAP-7`). User-generated content brings abuse,
copyright (uploaded ad videos are third-party content), personal-data, and child-safety
risks, plus store requirements for UGC moderation and reporting if content is shown to
other users.

## Decision

Submissions are a text description, an optional link, and an optional "where I saw it"
field. No image or video uploads. Submissions are visible only to the operator and (as
status plus an operator-written note) to the submitting install. Nothing is shown to other
players. The operator moderates via the admin API.

## Alternatives considered

- **Screenshot/video uploads:** clearer requests, but storage, malware and abuse
  scanning, copyright exposure, and higher child-safety risk.
- **Public idea board with voting:** engagement and roadmap signal, but triggers UGC
  moderation and reporting obligations and needs durable identity
  ([ADR-0006](0006-no-accounts-install-scoped-identity.md)). Deferred.

## Consequences

- Minimal storage and moderation surface; no UGC shown to others, so store UGC rules for
  user-to-user content do not apply in v1 `[Assumption]`.
- Requests may be vaguer; the link field covers most cases.

## Revisit when

Submission volume justifies voting, or text-only requests prove too ambiguous to act on.
