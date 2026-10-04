# ADR-0005: Store in-app purchases via RevenueCat

- **Status:** Accepted
- **Date:** 2026-10-04
- **Provenance:** [Delegated]
- **Supersedes / superseded by:** —
- **Related requirements:** `FR-ENT-*`, `IF-4`, `BC-3`, `BC-6`

## Context

The paid unlock must work on iOS and Android (`CAP-5`), support a subscription, a
lifetime purchase, or both, because the model is undecided (Q1, `BC-6`), and work
offline (`FR-ENT-5`). Digital unlocks inside the apps use store purchases (`BC-3`,
assumption). Building and running receipt validation for two stores is significant work
for one operator.

## Decision

Use the stores' in-app purchase systems through RevenueCat's Capacitor SDK. Configure one
entitlement, `full_library`, granted by every product in the current offering. The app
checks the entitlement, not product IDs, and caches it for offline use per `RULE-4`. Our
backend does not track entitlement in MVP.

## Alternatives considered

- **Direct StoreKit 2 and Play Billing plugins plus our own validation server:** no
  vendor fee, but two integrations, server notifications, and edge cases (grace periods,
  refunds, family sharing) to build and maintain.
- **Web checkout (Stripe) with entitlement sync:** avoids some store fees in some
  markets, but rules vary by store and region and need legal review; deferred.

## Consequences

- Price and model changes happen in the RevenueCat dashboard without an app release.
- Adds a vendor that sees purchase data (store transaction info, anonymous app user ID);
  must be listed in the privacy policy.
- RevenueCat charges a share of revenue above its free threshold.
- Local cache can be tampered with on rooted devices; accepted (low-value, offline
  content).

## Revisit when

RevenueCat fees exceed the cost of maintaining direct integrations; accounts are added
(alias app user IDs); web purchasing is approved by the owner after legal review.
