import { ANALYTICS_EVENTS, analyticsBatchRequest } from "@itg/contracts";
import { describe, expect, it } from "vitest";
import { Analytics, BATCH_INTERVAL_MS, BATCH_SIZE, type Timers } from "./analytics";

const identity = {
  installId: "11111111-1111-4111-8111-111111111111",
  appVersion: "1.0.0",
  platform: "android" as const,
};

function fakeTimers() {
  let pending: { cb: () => void; ms: number } | null = null;
  const timers: Timers = {
    setTimeout: (cb, ms) => (pending = { cb, ms }),
    clearTimeout: () => (pending = null),
  };
  return {
    timers,
    get pending() {
      return pending;
    },
    fire() {
      const p = pending;
      pending = null;
      p?.cb();
    },
  };
}

function setup(enabled = true) {
  const bodies: unknown[] = [];
  const headers: Record<string, string>[] = [];
  const t = fakeTimers();
  const a = new Analytics({
    fetch: async (_url, init = {}) => {
      bodies.push(JSON.parse(init.body as string));
      headers.push(init.headers as Record<string, string>);
      return new Response(null, { status: 202 });
    },
    now: () => 1_700_000_000_000,
    apiBase: "https://api.test",
    identity,
    enabled,
    timers: t.timers,
  });
  return { a, bodies, headers, t };
}

describe("Analytics client (FR-AN-1)", () => {
  it("batches until 60 s and posts a schema-valid batch", async () => {
    const { a, bodies, t } = setup();
    a.track("app_open");
    a.track("game_start", "ring-sort");
    expect(bodies).toHaveLength(0);
    expect(t.pending?.ms).toBe(BATCH_INTERVAL_MS);
    t.fire();
    await Promise.resolve();
    expect(bodies).toHaveLength(1);
    expect(analyticsBatchRequest.safeParse(bodies[0]).success).toBe(true);
    expect(bodies[0]).toEqual({
      events: [
        { name: "app_open", ts: 1_700_000_000_000 },
        { name: "game_start", gameSlug: "ring-sort", ts: 1_700_000_000_000 },
      ],
    });
  });

  it("sends as soon as 20 events are buffered", async () => {
    const { a, bodies } = setup();
    for (let i = 0; i < BATCH_SIZE; i++) a.track("game_complete_level", "pin-drop");
    await Promise.resolve();
    expect(bodies).toHaveLength(1);
    expect((bodies[0] as { events: unknown[] }).events).toHaveLength(BATCH_SIZE);
  });

  it("drops names outside the allowed list", async () => {
    const { a } = setup();
    a.track("screen_view" as never);
    expect(a.pending).toHaveLength(0);
    for (const name of ANALYTICS_EVENTS) a.track(name);
    expect(a.pending).toHaveLength(ANALYTICS_EVENTS.length);
  });

  it("carries no device identifiers in the body; only the app headers", async () => {
    const { a, bodies, headers } = setup();
    a.track("paywall_view");
    await a.flush();
    const text = JSON.stringify(bodies[0]);
    expect(text).not.toContain(identity.installId);
    expect(Object.keys((bodies[0] as { events: object[] }).events[0]!).sort()).toEqual([
      "name",
      "ts",
    ]);
    expect(Object.keys(headers[0]!).sort()).toEqual([
      "Content-Type",
      "X-App-Version",
      "X-Install-Id",
      "X-Platform",
    ]);
  });

  it("opt-out discards the buffer and stops sending immediately (RULE-11, FR-AN-2)", async () => {
    const { a, bodies, t } = setup();
    a.track("app_open");
    a.setEnabled(false);
    expect(a.pending).toHaveLength(0);
    expect(t.pending).toBeNull();
    a.track("game_start", "ring-sort");
    await a.flush();
    expect(bodies).toHaveLength(0);
    a.setEnabled(true);
    a.track("game_start", "ring-sort");
    await a.flush();
    expect(bodies).toHaveLength(1);
  });

  it("starts disabled when the player opted out earlier", async () => {
    const { a, bodies } = setup(false);
    a.track("app_open");
    await a.flush();
    expect(bodies).toHaveLength(0);
  });

  it("swallows network errors (events are not persisted)", async () => {
    const a = new Analytics({
      fetch: async () => {
        throw new TypeError("offline");
      },
      now: () => 1,
      apiBase: "x",
      identity,
      enabled: true,
      timers: fakeTimers().timers,
    });
    a.track("app_open");
    await expect(a.flush()).resolves.toBeUndefined();
    expect(a.pending).toHaveLength(0);
  });
});
