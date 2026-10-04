# Product Requirements Document (PRD)

**Status:** Current, draft-1 (2026-10-04). **Owns:** personas, user journeys (`UJ-*`),
product capabilities (`CAP-*`), priorities, non-goals, and product-level acceptance.
Detailed behavior is in the [FRD](FRD.md); verifiable requirements in the [SRS](SRS.md);
sequencing in the [Roadmap](../ROADMAP.md).

## 1. Product statement

An iOS and Android app containing a growing library of original, ad-free hypercasual
games that work offline, with a free starter set and a paid unlock for everything,
plus a way to tell us which ad game to build next. Before the app, a landing page
measures demand. Serves outcomes `BO-1`…`BO-4` in the [BRD](BRD.md#3-business-outcomes).

## 2. Users and personas

| Persona | Description | Primary need | Provenance |
|---|---|---|---|
| P1 Ad-weary player | Adult who plays short casual games and is tired of ads | Play without interruptions | `[User]` |
| P2 Ad-curious player | Saw a game in an ad and wants to play *that* game | The game the ad showed | `[User]` ("fake ad" hook) |
| P3 Offline player | Travels, flies, deploys, or has poor signal | Games that work with no network | `[Proposal]` |
| P4 Parent | Buys or installs games for a child and dislikes ads in kids' games | A clean, ad-free option | `[Proposal]`; marketing to this persona is gated by `BC-5` |
| P5 Prospect | Watches a short video and visits the landing page | Quick understanding, easy signup | `[Delegated]` (M1) |
| P6 Operator | The owner, triaging submissions and reading metrics | Low-effort triage and clear numbers | `[Delegated]` |

## 3. User journeys

| ID | Journey | Personas | Capabilities |
|---|---|---|---|
| `UJ-1` | Sees a "we built the game from the ad" video, opens the landing page, picks a price preference, joins the waitlist | P5 | `CAP-1` |
| `UJ-2` | Installs the app, browses the library, plays free games, including with no connection | P1–P4 | `CAP-2`, `CAP-3`, `CAP-4`, `CAP-10` |
| `UJ-3` | Taps a locked game, sees the paywall, buys, and the whole library unlocks | P1–P3 | `CAP-5` |
| `UJ-4` | Reinstalls or gets a new phone on the same store account, restores the purchase | P1–P3 | `CAP-6` |
| `UJ-5` | Describes an ad game they want built and later sees its status | P1, P2 | `CAP-7` |
| `UJ-6` | Operator reviews new submissions and sets their status | P6 | `CAP-8` |
| `UJ-7` | Updates the app and sees the newly added games marked as new | P1–P3 | `CAP-9` |

## 4. Product capabilities

Priority: **Must** (required for the release named), **Should**, **Could**.

| ID | Capability | Priority | Release | Requirements (SRS) |
|---|---|---|---|---|
| `CAP-1` | Landing page and waitlist with price-preference signal and source attribution | Must | M1 | `FR-WL-*` |
| `CAP-2` | Game library: browse and launch bundled games | Must | v1.0 | `FR-APP-1`, `FR-APP-2` |
| `CAP-3` | Offline play of all installed games | Must | v1.0 | `FR-APP-3` |
| `CAP-4` | Free tier: a subset of games playable with no purchase and no ads | Must | v1.0 | `FR-ENT-1` |
| `CAP-5` | Paid unlock of the full library (subscription and/or lifetime, configurable) | Must | v1.0 | `FR-ENT-2`, `FR-ENT-3`, `FR-ENT-5`, `FR-ENT-6` |
| `CAP-6` | Restore purchases | Must | v1.0 | `FR-ENT-4` |
| `CAP-7` | Submit a game idea seen in an ad, and see its status | Must | v1.0 | `FR-SUB-1`, `FR-SUB-2`, `FR-SUB-3`, `FR-SUB-6` |
| `CAP-8` | Operator triage of submissions | Must | v1.0 | `FR-SUB-4`, `FR-SUB-5` |
| `CAP-9` | Content pipeline and "new" indicators for added games | Must | v1.0 | `FR-GAME-1`, `FR-GAME-2`, `FR-APP-5` |
| `CAP-10` | Local progress and settings | Must | v1.0 | `FR-APP-4`, `FR-APP-6` |
| `CAP-11` | Privacy-preserving aggregate analytics with opt-out | Should | v1.0 | `FR-AN-1`, `FR-AN-2` |

Pitch elements: library, ad-free, paid, submissions `[User]`; free tier, offline, and
analytics `[Proposal]`/`[Delegated]` as labeled in the BRD.

## 5. Non-goals and deferred capabilities

Non-goals (will not be built unless the owner changes direction):

- Any ads, ad-supported tier, rewarded video, or offerwalls (`BC-1`).
- Third-party ad, attribution, or tracking SDKs ([ADR-0003](../adr/0003-no-ads-no-third-party-tracking.md)).
- Copies of existing games' art, names, or look (`BC-4`).

Deferred (may come later; see [Roadmap §5 Deferred](../ROADMAP.md#deferred)): accounts and
cloud save; Kids Category and kid-targeted marketing; public submission voting;
leaderboards and multiplayer; web purchases or web player; localization; user-uploaded
images or video in submissions.

## 6. Product-level acceptance criteria

The v1.0 product is acceptable when:

1. A new player can install, open, and play every free game within the first minute with
   no account, no ads, and no network after install (`UJ-2`).
2. A player can buy the full library and immediately play every premium game, and can
   restore it after reinstalling (`UJ-3`, `UJ-4`).
3. A player can submit an idea in under a minute, including offline, and later see its
   status (`UJ-5`).
4. The operator can review all new submissions in one place (`UJ-6`).
5. The app contains no ad or third-party tracking SDKs, verified by dependency audit
   (`SEC-1`).

## 7. Experience principles

- **Instant play.** Library to gameplay in one tap; no splash ads, no login, no nags.
- **Respect.** No dark patterns: the paywall shows the price and terms plainly and is
  shown only when a locked game is tapped or from Settings (`RULE-3`).
- **Accessible by default.** See `NFR-4`.
- **Original look.** Each game has its own name and art in a shared, recognizable house
  style `[Proposal]`.
