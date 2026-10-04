import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { harness, jsonInit, resetDb } from "./helpers";

const INSTALL = "0d6e4b1a-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
const headers = { "X-Install-Id": INSTALL, "X-App-Version": "1.0.3", "X-Platform": "android" };

describe("POST /v1/events", () => {
  beforeEach(resetDb);

  it("writes allowed events, drops unknown names, never writes the install id", async () => {
    const h = harness();
    const res = await h.call(
      "/v1/events",
      jsonInit(
        "POST",
        {
          events: [
            { name: "app_open", ts: 1 },
            { name: "game_start", gameSlug: "ring-sort", ts: 2 },
            { name: "device_fingerprint", ts: 3 },
          ],
        },
        headers,
      ),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 2, dropped: 1 });
    expect(h.events.writeDataPoint).toHaveBeenCalledTimes(2);
    expect(h.events.writeDataPoint.mock.calls).toEqual([
      [{ blobs: ["app_open", "", "android", "1.0.3"], doubles: [1], indexes: ["app_open"] }],
      [
        {
          blobs: ["game_start", "ring-sort", "android", "1.0.3"],
          doubles: [1],
          indexes: ["game_start"],
        },
      ],
    ]);
    expect(JSON.stringify(h.events.writeDataPoint.mock.calls)).not.toContain(INSTALL);
  });

  it("rejects malformed batches", async () => {
    const h = harness();
    const empty = await h.call("/v1/events", jsonInit("POST", { events: [] }, headers));
    expect(empty.status).toBe(400);
    const tooMany = await h.call(
      "/v1/events",
      jsonInit(
        "POST",
        { events: Array.from({ length: 51 }, () => ({ name: "app_open", ts: 1 })) },
        headers,
      ),
    );
    expect(tooMany.status).toBe(400);
    const noInstall = await h.call(
      "/v1/events",
      jsonInit("POST", { events: [{ name: "app_open", ts: 1 }] }),
    );
    expect(noInstall.status).toBe(400);
    expect(h.events.writeDataPoint).not.toHaveBeenCalled();
  });

  it("limits 60 batches per install per hour", async () => {
    const h = harness({ now: () => new Date("2026-10-04T10:59:00.000Z") });
    const batch = jsonInit("POST", { events: [{ name: "app_open", ts: 1 }] }, headers);
    for (let i = 0; i < 60; i++) expect((await h.call("/v1/events", batch)).status).toBe(202);
    const limited = await h.call("/v1/events", batch);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    const rows = await env.DB.prepare("SELECT scope FROM rate_limits").all<{ scope: string }>();
    expect(rows.results).toEqual([{ scope: "events:install" }]);
  });
});
