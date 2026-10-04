# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-04
- **Provenance:** [Delegated]
- **Supersedes / superseded by:** —

## Context

The project is built largely by AI agents across many sessions. Without a durable record,
later agents re-derive or silently reverse decisions.

## Decision

Record architecturally significant decisions as ADRs in `docs/adr/`, using
[`template.md`](template.md), with the rules in [README.md](README.md). The
[Roadmap](../ROADMAP.md) indexes material decisions; [agents.md](../../agents.md)
requires an ADR for architectural changes.

## Alternatives considered

- Decisions only in the roadmap: mixes sequencing with rationale; history gets edited away.
- Decisions in PR descriptions: not discoverable from the repository.

## Consequences

Small overhead per significant change; clear history and supersession chain.

## Revisit when

The ADR set becomes too large to scan (then add tags or an index by area).
