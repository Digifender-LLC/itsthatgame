import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import { runScheduledCleanup } from "../src/scheduled";
import { resetDb } from "./helpers";

async function insertWindow(windowStart: string) {
  await env.DB.prepare(
    "INSERT INTO rate_limits (scope, key_hash, window_start, count) VALUES ('waitlist:ip', ?, ?, 1)",
  )
    .bind(crypto.randomUUID(), windowStart)
    .run();
}

async function count(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("scheduled cleanup", () => {
  beforeEach(resetDb);

  it("deletes rate_limits windows older than 48 hours via the cron handler", async () => {
    await insertWindow("2026-10-01T00:00:00.000Z"); // 3.5 days old
    await insertWindow("2026-10-02T11:00:00.000Z"); // 49 h old
    await insertWindow("2026-10-02T13:00:00.000Z"); // 47 h old
    await insertWindow("2026-10-04T11:00:00.000Z");
    const controller = createScheduledController({
      scheduledTime: new Date("2026-10-04T12:00:00.000Z"),
      cron: "17 3 * * *",
    });
    const ctx = createExecutionContext();
    worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);
    const left = await env.DB.prepare("SELECT window_start FROM rate_limits ORDER BY 1").all();
    expect(left.results).toEqual([
      { window_start: "2026-10-02T13:00:00.000Z" },
      { window_start: "2026-10-04T11:00:00.000Z" },
    ]);
  });

  it("enforces waitlist retention only once WAITLIST_RETENTION_END has passed", async () => {
    await env.DB.prepare(
      `INSERT INTO waitlist_entries (id, email_normalized, price_preference, consent_at,
         consent_notice_version, created_at, updated_at)
       VALUES ('1', 'a@example.com', 'free_only', 'x', 'v', 'x', 'x')`,
    ).run();
    const now = new Date("2026-10-04T12:00:00.000Z");
    await runScheduledCleanup({ ...env, WAITLIST_RETENTION_END: "" }, now);
    await runScheduledCleanup({ ...env, WAITLIST_RETENTION_END: "2027-01-01" }, now);
    expect(await count("waitlist_entries")).toBe(1);
    const res = await runScheduledCleanup({ ...env, WAITLIST_RETENTION_END: "2026-10-01" }, now);
    expect(res.waitlistRowsDeleted).toBe(1);
    expect(await count("waitlist_entries")).toBe(0);
  });
});

describe("deployed worker entrypoint", () => {
  it("serves 404 envelopes with HSTS and a request id", async () => {
    const res = await exports.default.fetch("https://api.test/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("not_found");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(res.headers.get("X-Request-Id")).toBe(body.error.requestId);
  });

  it("answers CORS preflight for the landing origin", async () => {
    const res = await exports.default.fetch("https://api.test/v1/waitlist", {
      method: "OPTIONS",
      headers: {
        Origin: env.ALLOWED_ORIGIN.split(",")[0]!,
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(env.ALLOWED_ORIGIN.split(",")[0]!);
  });

  it("rejects admin calls without Access identity", async () => {
    const res = await exports.default.fetch("https://api.test/admin/v1/submissions");
    expect(res.status).toBe(401);
  });
});
