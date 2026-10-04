# Runbook: store accounts, products, and RevenueCat

**Needs:** P2 (Apple Developer Program and Google Play Console accounts for Digifender
LLC) and P3 (RevenueCat project). **Unblocks:** M4 sandbox verification and M6 listings.
**References:** [ADR-0005](../adr/0005-store-iap-via-revenuecat.md),
[SDD §4](../design/SDD.md#4-entitlement), [Roadmap D1, D2](../ROADMAP.md#6-decisions-made-under-delegated-authority).

## 1. Accounts

1. Apple Developer Program, enrolled as an organization (Digifender LLC needs a D-U-N-S
   number). Accept the Paid Apps agreement and complete tax and banking.
2. Google Play Console, organization account; complete payments profile.
3. App identifiers: bundle ID / application ID `com.digifender.itsthatgame`
   (`apps/shell/capacitor.config.ts`).

## 2. Products (identical on both stores)

| Product ID | Type | Price (D1) | Notes |
|---|---|---|---|
| `itg_full_monthly` | Auto-renewable subscription, 1 month, group "Full library" | $2.99 | No free trial at launch |
| `itg_full_lifetime` | Non-consumable (Apple) / one-time product (Google) | $19.99 | |

If the G1 rule (D2) moves the monthly price to $4.99, change the price in the stores;
no app release is needed.

## 3. RevenueCat

1. Create project "ItsThatGame"; add the iOS app (App Store Connect shared secret / API
   key) and the Android app (Play service account JSON).
2. Entitlement `full_library`; attach both products.
3. Offering `default` with packages `$rc_monthly` → `itg_full_monthly` and
   `$rc_lifetime` → `itg_full_lifetime`. Paywall order: monthly first, unless D2 says
   lifetime-first.
4. Copy the public SDK keys into the build environment as `VITE_RC_IOS_KEY` and
   `VITE_RC_ANDROID_KEY` (public keys; still keep them out of the repo, set them in CI).
5. Add RevenueCat to the privacy policy processor list (already drafted in
   `apps/landing/privacy.html`).

## 4. Sandbox verification (M4 acceptance)

On a device build ([mobile-builds.md](mobile-builds.md)) with a sandbox tester:

- [ ] Each product purchase unlocks all five premium games immediately.
- [ ] Delete and reinstall → "Restore purchases" unlocks again.
- [ ] Airplane mode with an active subscription → premium games stay unlocked; advance
      past expiry + 7 days (sandbox subscriptions renew every few minutes; let one
      lapse) → premium games relock; progress remains.
- [ ] Cancel at the purchase sheet → nothing changes; "Ask to Buy" → "Purchase pending".

Record results in the PR that marks M4 `Done`.
