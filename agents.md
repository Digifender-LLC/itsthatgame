# agents.md

Instructions for AI coding agents (and humans) working in this repository. This is the
authoritative agent instruction file. Do not create `AGENTS.md` or other case variants;
`CLAUDE.md` only imports this file.

## Project in one paragraph

ItsThatGame is a planned ad-free collection of original hypercasual mobile games
("we built the game from the ad"), with a player submission channel for games people
have seen in ads, plus a small supporting backend. As of 2026-10-04 the repository
contains documentation only: no application code, backend, tests, or infrastructure
exist yet. Do not describe anything as implemented unless the code is in this repository.

## Start here: the canonical roadmap

**Read [`docs/ROADMAP.md`](docs/ROADMAP.md) before planning or implementing anything.**
It is the single source of truth for scope, priorities, milestones, dependencies,
delivery status, and completion criteria. Then read the specification sections linked
from the roadmap task you are working on.

### Which document owns what

| Subject | Canonical home |
|---|---|
| Scope, priorities, sequencing, milestone status, done-criteria | [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| Business problem, outcomes (`BO-*`), business constraints (`BC-*`), success measures | [`docs/requirements/BRD.md`](docs/requirements/BRD.md) |
| Users, journeys (`UJ-*`), product capabilities (`CAP-*`), non-goals | [`docs/requirements/PRD.md`](docs/requirements/PRD.md) |
| Workflows, business rules (`RULE-*`), state transitions, failure paths | [`docs/requirements/FRD.md`](docs/requirements/FRD.md) |
| Verifiable requirements (`FR-*`, `NFR-*`, `SEC-*`, `DATA-*`, `IF-*`) | [`docs/requirements/SRS.md`](docs/requirements/SRS.md) |
| System boundaries, components, trust boundaries, topology | [`docs/design/HLD.md`](docs/design/HLD.md) |
| How subsystems collaborate; requirement-to-design mapping | [`docs/design/SDD.md`](docs/design/SDD.md) |
| Technology choices, tooling, testing, release, cross-cutting concerns | [`docs/design/TDD.md`](docs/design/TDD.md) (Technical Design Document) |
| Interfaces, schemas, state machines, error handling | [`docs/design/LLD.md`](docs/design/LLD.md) |
| Architecturally significant decisions | [`docs/adr/`](docs/adr/README.md) |

A requirement lives in exactly one place (the SRS). Other documents reference its ID;
they do not restate it with different wording.

## Rules for changing the plan or the code

1. **Keep docs and code in sync.** A change that implements, alters, or drops a
   requirement must update, in the same PR: the roadmap task/milestone status (with
   evidence: paths, test names), and any affected SRS/design section.
2. **Status needs evidence.** Mark a roadmap item `Done` only when the code is merged
   and its listed verification has actually been run. Planning text is not proof of
   implementation, and existing code is not proof of an intended requirement.
3. **Architectural changes need an ADR.** New runtime dependencies or services, changes
   to data storage, trust boundaries, auth/entitlement, platform, or anything that
   reverses an existing ADR: add a new ADR under `docs/adr/` (see its README). Never
   rewrite an accepted ADR to hide a change; mark it `Superseded by ADR-NNNN` and link
   both ways.
4. **Label provenance.** Use the provenance tags defined in the roadmap
   (`[User]`, `[Delegated]`, `[Assumption]`, `[Proposal]`, `[Open]`). Never present an
   agent-made decision as approved by the project owner.
5. **Conflicts.** If sources disagree, do not silently pick the newest. Resolve in this
   order: explicit owner decision → this file → accepted ADRs → canonical document for
   that subject → implementation evidence. Record unresolved conflicts in the roadmap's
   "Open questions and conflicts" section and, if they block work, ask the owner.
6. **Superseded documents** stay in the repo with a banner at the top linking to the
   replacement. Do not delete useful history.
7. **Run `python3 scripts/check_docs.py`** after editing anything under `docs/` or this
   file. It checks relative links, requirement-ID references, and roadmap coverage of
   must-have requirements.

## Product guardrails (non-negotiable unless an ADR changes them)

- **No advertising, ever**, and no third-party ad, attribution, or tracking SDKs in the
  app ([ADR-0003](docs/adr/0003-no-ads-no-third-party-tracking.md)). This is the product.
- **Original work only.** Game mechanics may be inspired by ads; art, names, characters,
  audio, UI, and overall look must be our own. Do not trace, rip, or closely imitate
  assets or trade dress from existing games (see `BC-4` in the BRD).
- **Offline-first.** Games must be fully playable with no network once installed.
- **Collect as little personal data as possible.** No accounts in the MVP; no data
  from players beyond what the SRS lists (see `SEC-*`, `DATA-*`).
- Never commit secrets, API keys, signing certificates, or `.env` files.

## Subagent routing and orchestration

The primary agent acts as an orchestrator, coordinating work through context-scoped
subagents rather than performing coding and edits directly. This division of labor
optimizes reasoning effort and keeps the main conversation focused on coordination and
decision-making.

When delegating to subagents, route work based on task complexity and requirements.
Models are listed from cheapest to most capable; prices are Anthropic first-party API
rates per million input/output tokens as of 2026-09-25 (see the Anthropic pricing page
for current rates):

- **Haiku 4.5 ($1/$5):** Cheapest and fastest. Use for simple, well-defined tasks such
  as file reads, pattern matching, routine edits, small scripts, exploratory searches
  and quick lookups.
- **Sonnet 5.5 ($2/$10):** Balanced speed and capability for general-purpose work such
  as multi-file refactoring, feature implementation, moderate analysis and code review.
  The default choice for most substantive tasks.
- **Opus 5.5 ($4/$20):** Strong reasoning for complex, high-stakes work such as
  architecture decisions, cross-system design, deep codebase analysis, security review
  and intricate bug diagnosis. Use when Sonnet's output quality is insufficient.
- **Fable 5.1 ($10/$50):** Anthropic's most capable widely released model and the most
  expensive. Turns on hard tasks can run for many minutes. Reserve it for the most
  demanding reasoning and long-horizon agentic work where Opus falls short.

**Orchestrator responsibilities:** Define the task scope, provide context and
constraints, verify subagent work, and coordinate across multiple efforts. Route simple,
independent subtasks to Haiku or Sonnet to reduce latency and cost. Reserve Opus and
Fable for genuinely complex problems requiring deep reasoning or when task failure would
be costly.

**Subagent responsibilities:** Execute focused work within defined scope—code writes,
edits, file operations, targeted analysis. Report results clearly so the orchestrator
can verify and coordinate the next step.

### Routing in this repository

| Work in this repo | Suggested tier |
|---|---|
| Doc link fixes, status updates in the roadmap, catalog manifest edits | Haiku 4.5 |
| Implementing a roadmap task, a new game from the game SDK template, API endpoints, tests | Sonnet 5.5 |
| Changes touching entitlement/purchases, privacy or security boundaries, new ADRs, cross-milestone replanning | Opus 5.5 |
| Repeated Opus failure on a hard, long-horizon problem | Fable 5.1 |

### Writing a good subagent brief

Every delegation should include:

1. **Goal and done-check** — the roadmap task ID (e.g. `M1-T3`) and its completion check.
2. **Context** — the exact spec sections and requirement IDs to read; the files in scope.
3. **Constraints** — the guardrails above, files the subagent must not touch, and
   whether it may add dependencies (usually: no, without an ADR).
4. **Report format** — what changed (paths), what was verified and how, what is left,
   and any assumption made. Ask for evidence (command output, test names), not claims.

The orchestrator verifies before accepting: re-run the stated checks, read the diff,
and confirm the roadmap and docs were updated. Run independent subtasks in parallel;
serialize tasks that edit the same files.

## Repository layout

Current: `docs/` (specifications), `scripts/check_docs.py` (doc validation), this file.
Planned layout (not yet created) is defined in
[TDD §3](docs/design/TDD.md#3-repository-layout). Create directories as the roadmap
tasks that need them are implemented, not before.

## Commits and pull requests

- One roadmap task (or a coherent part of one) per PR; reference the task ID in the
  title, e.g. `M1-T2: waitlist API`.
- PR description: what changed, which requirement IDs it satisfies, how it was verified,
  and which docs were updated.
- Do not mark a PR ready while `scripts/check_docs.py` or the repo's tests fail.
