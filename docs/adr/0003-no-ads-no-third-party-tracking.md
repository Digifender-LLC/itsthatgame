# ADR-0003: No ads and no third-party ad or tracking SDKs

- **Status:** Accepted
- **Date:** 2026-10-04
- **Provenance:** [User] (product premise: ad-free collection), formalized as an
  architectural constraint [Delegated]
- **Supersedes / superseded by:** —
- **Related requirements:** `BC-1`, `SEC-1`, `FR-AN-1`, `DATA-3`

## Context

The product's whole value is "no ads". Ad and attribution SDKs also collect device
identifiers and add privacy obligations, which conflicts with the privacy stance and with
any future parent-oriented positioning (`BC-5`).

## Decision

No advertising SDKs, ad mediation, attribution SDKs (AppsFlyer, Adjust, Branch, etc.),
or third-party analytics/tracking SDKs in the app or landing page. Analytics is
first-party, aggregate, and opt-out (`FR-AN-1`, `FR-AN-2`). CI enforces a dependency
denylist ([TDD §6](../design/TDD.md#6-ci-quality-gates-and-security-checks)).
Third-party crash reporting requires its own ADR.

## Alternatives considered

- Third-party product analytics (Amplitude, Mixpanel): richer analysis, but adds
  tracking and data-sharing obligations that contradict the product.
- Ad-network attribution for paid user acquisition: would make paid UA easier to
  measure, but requires an attribution SDK. Paid UA, if pursued, is measured with
  store-provided reporting (App Store Connect and Play Console acquisition reports) and
  campaign-specific landing URLs instead.

## Consequences

- Clean privacy labels; simpler compliance.
- Less granular analytics and harder paid-UA measurement (`BO-4`); mitigated by
  first-party UTM attribution on the landing page (`FR-WL-4`).

## Revisit when

Never for ads. For attribution, only if paid UA becomes the main channel and store-native
attribution is insufficient; requires owner approval.
