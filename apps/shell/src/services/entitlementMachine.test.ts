import { describe, expect, it } from "vitest";
import {
  cacheValid,
  DAY_MS,
  INITIAL,
  isUnlocked,
  transition,
  type EntitlementSnapshot,
  type EntitlementState,
} from "./entitlementMachine";

const GRACE = 7;
const T0 = Date.UTC(2026, 9, 4);
const active = (expiresAt: number | null) => ({
  type: "store_ok" as const,
  info: { active: true, expiresAt },
});
const inactive = { type: "store_ok" as const, info: { active: false, expiresAt: null } };
const failed = { type: "refresh_failed" as const };
const tick = { type: "tick" as const };

function snap(
  state: EntitlementState,
  expiresAt: number | null,
  checkedAt = T0,
): EntitlementSnapshot {
  return { state, cache: { active: true, expiresAt, checkedAt } };
}

describe("client entitlement state machine (FRD §4)", () => {
  it("unknown → free: refresh ok, none active", () => {
    const next = transition(INITIAL, inactive, T0, GRACE);
    expect(next.state).toBe("free");
    expect(next.cache).toEqual({ active: false, expiresAt: null, checkedAt: T0 });
  });

  it("unknown → entitled: refresh ok, active (cache written)", () => {
    const next = transition(INITIAL, active(T0 + 30 * DAY_MS), T0, GRACE);
    expect(next).toEqual({
      state: "entitled",
      cache: { active: true, expiresAt: T0 + 30 * DAY_MS, checkedAt: T0 },
    });
  });

  it("unknown → entitled_cached: refresh failed, cache valid", () => {
    const start = { state: "unknown" as const, cache: snap("entitled", T0 + DAY_MS).cache };
    expect(transition(start, failed, T0 + 2 * DAY_MS, GRACE).state).toBe("entitled_cached");
  });

  it("unknown → free: refresh failed with no cache, inactive cache, or grace already over", () => {
    expect(transition(INITIAL, failed, T0, GRACE).state).toBe("free");
    const inactiveCache = {
      state: "unknown" as const,
      cache: { active: false, expiresAt: null, checkedAt: T0 },
    };
    expect(transition(inactiveCache, failed, T0, GRACE).state).toBe("free");
    const old = { state: "unknown" as const, cache: snap("entitled", T0).cache };
    expect(transition(old, failed, T0 + 8 * DAY_MS, GRACE).state).toBe("free");
  });

  it("free → entitled: purchase or restore succeeded", () => {
    const free = transition(INITIAL, inactive, T0, GRACE);
    expect(transition(free, active(null), T0 + 1, GRACE).state).toBe("entitled");
  });

  it("free stays free when a refresh fails", () => {
    const free = transition(INITIAL, inactive, T0, GRACE);
    expect(transition(free, failed, T0 + 1, GRACE)).toBe(free);
  });

  it("entitled → entitled_cached: refresh failed", () => {
    expect(transition(snap("entitled", T0 + DAY_MS), failed, T0 + 1, GRACE).state).toBe(
      "entitled_cached",
    );
  });

  it("entitled_cached → entitled: refresh ok, active", () => {
    const next = transition(
      snap("entitled_cached", T0),
      active(T0 + 31 * DAY_MS),
      T0 + DAY_MS,
      GRACE,
    );
    expect(next.state).toBe("entitled");
    expect(next.cache?.checkedAt).toBe(T0 + DAY_MS);
  });

  it("entitled_cached → free: grace expired (exactly 7 days after expiry is still valid)", () => {
    const cached = snap("entitled_cached", T0);
    expect(transition(cached, tick, T0 + 7 * DAY_MS, GRACE)).toBe(cached);
    expect(transition(cached, tick, T0 + 7 * DAY_MS + 1, GRACE).state).toBe("free");
  });

  it("entitled_cached → free: refresh ok, inactive", () => {
    expect(transition(snap("entitled_cached", T0), inactive, T0 + 1, GRACE).state).toBe("free");
  });

  it("entitled → free: refresh ok, inactive (lapsed); cache records the lapse", () => {
    const next = transition(snap("entitled", T0), inactive, T0 + DAY_MS, GRACE);
    expect(next.state).toBe("free");
    expect(next.cache?.active).toBe(false);
  });

  it("refresh failing after grace has run out goes straight to free", () => {
    expect(transition(snap("entitled", T0), failed, T0 + 8 * DAY_MS, GRACE).state).toBe("free");
  });

  it("tick leaves entitled, free and unknown alone", () => {
    for (const s of ["entitled", "free", "unknown"] as const) {
      const x = snap(s, T0);
      expect(transition(x, tick, T0 + 100 * DAY_MS, GRACE)).toBe(x);
    }
  });

  it("lifetime entitlement never expires offline (RULE-4)", () => {
    const lifetime = transition(INITIAL, active(null), T0, GRACE);
    const offline = transition(lifetime, failed, T0 + 3650 * DAY_MS, GRACE);
    expect(offline.state).toBe("entitled_cached");
    expect(transition(offline, tick, T0 + 36500 * DAY_MS, GRACE).state).toBe("entitled_cached");
  });

  it("winding the clock back before the last check does not rewind grace", () => {
    const cache = { active: true, expiresAt: T0, checkedAt: T0 + 7 * DAY_MS + 1 };
    expect(cacheValid(cache, T0, GRACE)).toBe(false);
    expect(cacheValid({ ...cache, checkedAt: T0 }, T0, GRACE)).toBe(true);
  });
});

describe("isUnlocked gate (SDD §4, FR-ENT-1)", () => {
  it("free games are always playable", () => {
    for (const s of ["unknown", "free", "entitled", "entitled_cached"] as const) {
      expect(isUnlocked("free", s)).toBe(true);
    }
  });
  it("premium games need entitled or entitled_cached", () => {
    expect(isUnlocked("premium", "unknown")).toBe(false);
    expect(isUnlocked("premium", "free")).toBe(false);
    expect(isUnlocked("premium", "entitled")).toBe(true);
    expect(isUnlocked("premium", "entitled_cached")).toBe(true);
  });
});
