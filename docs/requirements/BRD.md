# Business Requirements Document (BRD)

**Status:** Current, draft-1 (2026-10-04). **Owns:** business problem, outcomes (`BO-*`),
business constraints (`BC-*`), stakeholders, value proposition, business-model options,
and success measures. Scope and sequencing belong to the [Roadmap](../ROADMAP.md);
product capabilities to the [PRD](PRD.md). Provenance tags are defined in
[Roadmap §0](../ROADMAP.md#0-how-to-read-this-document).

## 1. Business problem

Hypercasual mobile games (sorting, stacking, pin-pull, merge, runners) are funded by
advertising. Players face frequent interstitial and rewarded ads, and many ads show
gameplay that does not exist in the advertised game. There is no well-known way to just
play these simple games without ads, or to play the game the ad actually showed. `[User]`

## 2. Value proposition

"The last mobile ad game you'll ever need": one ad-free collection of original
hypercasual games, including games built from what ads show, with a channel for players
to request the next one. `[User]` Secondary angles from the shared analysis, not yet
validated `[Proposal]`: offline play (travel, deployments, poor signal) and an ad-free
option for parents.

## 3. Business outcomes

| ID | Outcome | Provenance |
|---|---|---|
| `BO-1` | Establish, with evidence and before major build investment, whether enough people will pay for an ad-free hypercasual collection, and at what price structure. | `[Delegated]` from `[Proposal]` (validate first) |
| `BO-2` | Generate recurring or one-time revenue from players through a paid unlock of the library, with a free tier that contains no ads. | `[User]` paid model; free tier `[Proposal]` |
| `BO-3` | Retain paying players by shipping new original games regularly, partly sourced from player submissions. | `[User]` submission idea; cadence `[Delegated]` (Roadmap D8) |
| `BO-4` | Keep customer acquisition cost below the value of a paying customer, favoring organic short-video content ("we built the game from the ad"). | `[Proposal]` |

## 4. Stakeholders

| Stakeholder | Interest |
|---|---|
| Owner (Ender, Digifender LLC `[Assumption]`) | Decides scope, pricing, go/no-go; builds and operates the product |
| Players (see [PRD §2](PRD.md#2-users-and-personas)) | Ad-free play, fair price, new games |
| Apple App Store, Google Play | Distribution, payment processing, policy compliance |
| Payment/entitlement vendor (RevenueCat, [ADR-0005](../adr/0005-store-iap-via-revenuecat.md)) | Processes entitlement state |
| Short-video audience | Top of funnel for validation and growth |

## 5. Business constraints

| ID | Constraint | Provenance |
|---|---|---|
| `BC-1` | No advertising in any tier, and no ad-funded revenue. | `[User]` |
| `BC-2` | Low fixed cost and low operational burden: one operator `[Assumption]`, so prefer managed services and avoid systems that need on-call attention. | `[Assumption]` |
| `BC-3` | Digital content sold in the mobile apps uses the platform in-app purchase systems; the stores take their commission. | `[Assumption]` (conservative) |
| `BC-4` | Mechanics may be inspired by existing games and ads; art, names, characters, audio, UI and overall look and feel must be original. Close visual copies are not allowed (the analysis cites Tetris v. Xio). | `[User]` (from shared analysis) |
| `BC-5` | The product is not directed at children and collects no personal data from children (Roadmap D3). | `[Delegated]` |
| `BC-6` | Prices are set in the store/RevenueCat configuration (launch prices per Roadmap D1, adjustable per D2). Nothing in code may hard-code a price. | `[Delegated]` |

## 6. Business model options

Options considered. The system supports all of them. **Decision:** $2.99/month plus
$19.99 lifetime, with a free tier of 3 games (Roadmap D1, D6), adjusted by the G1 rule
(D2). `[Delegated]`

| Option | Source | Notes |
|---|---|---|
| Monthly subscription, $4.99 | `[User]` pitch ("$5/month") | Analysis flags as steep for time-killers versus Apple Arcade and Netflix Games |
| Monthly subscription, $1.99–2.99 | `[Proposal]` analysis | Lower barrier; needs higher volume |
| Lifetime unlock, $14.99–19.99 (chosen: $19.99) | `[Proposal]` analysis | Matches "people hate subscriptions for simple games"; no recurring revenue |
| Free tier: a few games, no ads | `[Proposal]` analysis | Adopted as the funnel in the plan (`CAP-4`) |

**M1 price test `[Delegated]`:** the landing page asks which option the visitor would pick:
$2.99/month, $4.99/month, $19.99 once, or "only if it were free". Stated preference is a weak signal; it informs
G1 but does not replace a real paid test.

## 7. Success measures

Measured in M1 (validation) and after launch. G1 thresholds are adopted `[Delegated]`
and applied by rule D2 in the Roadmap.

| Measure | Outcome | G1 threshold |
|---|---|---|
| Waitlist signups during the validation window | `BO-1` | ≥ 500 signups in 4 weeks |
| Visit-to-signup conversion on the landing page | `BO-1` | ≥ 10% |
| Share of signups choosing a paid option over "only if free" | `BO-1`, `BO-2` | ≥ 40% |
| Signups per 1,000 short-video views, by video | `BO-4` | Tracked; used to compare angles (ad-game, parents, offline) |
| Post-launch: free-to-paid conversion, paid retention at 30/90 days, refunds | `BO-2`, `BO-3` | Targets set in the G1 record from validation data |
| Post-launch: games shipped per month; share sourced from submissions | `BO-3` | 2 per month (Roadmap D8) |

## 8. Business risks

Maintained in [Roadmap §7](../ROADMAP.md#7-risks).
