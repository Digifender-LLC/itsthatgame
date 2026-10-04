// Client entitlement state machine (FRD §4; RULE-2, RULE-4, RULE-5; Roadmap D9).
// Pure: every function takes the current time explicitly so tests control the clock.

export type EntitlementState = "unknown" | "free" | "entitled" | "entitled_cached";

/** Last known store answer, persisted on device (SDD §4). */
export interface EntitlementCache {
  active: boolean;
  /** Epoch ms; null = lifetime (never expires). */
  expiresAt: number | null;
  /** Epoch ms of the last successful refresh. */
  checkedAt: number;
}

export interface EntitlementSnapshot {
  state: EntitlementState;
  cache: EntitlementCache | null;
}

/** What the store reported (refresh, purchase, or restore succeeded). */
export interface StoreInfo {
  active: boolean;
  expiresAt: number | null;
}

export type EntitlementEvent =
  | { type: "store_ok"; info: StoreInfo } // refresh, purchase or restore succeeded
  | { type: "refresh_failed" }
  | { type: "tick" }; // re-evaluate grace against the clock

export const DAY_MS = 24 * 60 * 60 * 1000;

export const INITIAL: EntitlementSnapshot = { state: "unknown", cache: null };

/**
 * RULE-4: a cached active entitlement is honored until expiry + grace; lifetime never
 * expires. The clock used is max(now, checkedAt), so moving the device clock back
 * before the last successful check cannot rewind grace (SDD §4).
 */
export function cacheValid(
  cache: EntitlementCache | null,
  now: number,
  graceDays: number,
): boolean {
  if (!cache?.active) return false;
  if (cache.expiresAt === null) return true;
  const effectiveNow = Math.max(now, cache.checkedAt);
  return effectiveNow <= cache.expiresAt + graceDays * DAY_MS;
}

export function transition(
  snap: EntitlementSnapshot,
  event: EntitlementEvent,
  now: number,
  graceDays: number,
): EntitlementSnapshot {
  switch (event.type) {
    case "store_ok": {
      const cache: EntitlementCache = {
        active: event.info.active,
        expiresAt: event.info.expiresAt,
        checkedAt: now,
      };
      // RULE-5: an inactive answer relocks (entitled → free); progress is never touched.
      return { state: event.info.active ? "entitled" : "free", cache };
    }
    case "refresh_failed": {
      if (snap.state === "free") return snap;
      const valid = cacheValid(snap.cache, now, graceDays);
      return { state: valid ? "entitled_cached" : "free", cache: snap.cache };
    }
    case "tick": {
      if (snap.state === "entitled_cached" && !cacheValid(snap.cache, now, graceDays)) {
        return { state: "free", cache: snap.cache };
      }
      return snap;
    }
  }
}

export function isEntitled(state: EntitlementState): boolean {
  return state === "entitled" || state === "entitled_cached";
}

/** SDD §4 gate: isUnlocked(game) = tier free || state in {entitled, entitled_cached}. */
export function isUnlocked(tier: "free" | "premium", state: EntitlementState): boolean {
  return tier === "free" || isEntitled(state);
}
