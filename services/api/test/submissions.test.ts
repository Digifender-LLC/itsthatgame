import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { hmacHex } from "../src/crypto";
import { harness, jsonInit, resetDb } from "./helpers";

const INSTALL_A = "6f1c2b8e-3d4a-4f5b-8c6d-7e8f9a0b1c2d";
const INSTALL_B = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f2a3b4c5d";
const APP_ORIGIN = env.APP_ORIGINS.split(",")[0]!;

const body = {
  description: "Tower of colored rings you drop to sort by color",
  link: "https://example.com/ad",
  seenIn: "Some puzzle app",
};

function submit(
  h: ReturnType<typeof harness>,
  opts: { install?: string; key?: string; payload?: unknown; ip?: string } = {},
) {
  return h.call("/v1/submissions", {
    ...jsonInit("POST", opts.payload ?? body, {
      "X-Install-Id": opts.install ?? INSTALL_A,
      "Idempotency-Key": opts.key ?? crypto.randomUUID(),
      "X-App-Version": "1.2.0",
      "X-Platform": "ios",
    }),
    ...(opts.ip ? { ip: opts.ip } : {}),
  });
}

async function count(): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions").first<{ n: number }>();
  return row?.n ?? 0;
}

describe("POST /v1/submissions", () => {
  beforeEach(resetDb);

  it("creates a submission (201) storing only the install hash", async () => {
    const h = harness();
    const key = crypto.randomUUID();
    const res = await submit(h, { key });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; status: string; createdAt: string };
    expect(json.status).toBe("received");
    expect(json.id).toMatch(/^[0-9a-f-]{36}$/);
    const row = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?")
      .bind(json.id)
      .first<Record<string, unknown>>();
    expect(row).toMatchObject({
      client_id: key,
      install_hash: await hmacHex("test-pepper", INSTALL_A),
      description: body.description,
      link: body.link,
      seen_in: body.seenIn,
      status: "received",
      app_version: "1.2.0",
      platform: "ios",
    });
    expect(JSON.stringify(row)).not.toContain(INSTALL_A);
  });

  it("replays with the same Idempotency-Key return 200 and one row", async () => {
    const h = harness();
    const key = crypto.randomUUID();
    const first = await submit(h, { key });
    const second = await submit(h, { key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(await count()).toBe(1);
  });

  it("returns 409 when another install reuses the key", async () => {
    const h = harness();
    const key = crypto.randomUUID();
    expect((await submit(h, { key })).status).toBe(201);
    const res = await submit(h, { key, install: INSTALL_B });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("conflict");
    expect(await count()).toBe(1);
  });

  it.each([
    ["short description", { description: "too short" }, "description"],
    ["long description", { description: "x".repeat(1001) }, "description"],
    ["non-http link", { ...body, link: "javascript:alert(1)" }, "link"],
    ["long seenIn", { ...body, seenIn: "s".repeat(101) }, "seenIn"],
  ])("rejects %s", async (_label, payload, field) => {
    const h = harness();
    const res = await submit(h, { payload });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { error: { code: string; fields: Record<string, string> } };
    expect(err.error.code).toBe("validation_failed");
    expect(err.error.fields).toHaveProperty(field);
    expect(await count()).toBe(0);
  });

  it("requires valid X-Install-Id and Idempotency-Key headers", async () => {
    const h = harness();
    const noInstall = await h.call("/v1/submissions", {
      ...jsonInit("POST", body, { "Idempotency-Key": crypto.randomUUID() }),
    });
    expect(noInstall.status).toBe(400);
    expect(
      ((await noInstall.json()) as { error: { fields: Record<string, string> } }).error.fields,
    ).toHaveProperty("X-Install-Id");

    const noKey = await h.call("/v1/submissions", {
      ...jsonInit("POST", body, { "X-Install-Id": INSTALL_A }),
    });
    expect(noKey.status).toBe(400);
    expect(
      ((await noKey.json()) as { error: { fields: Record<string, string> } }).error.fields,
    ).toHaveProperty("Idempotency-Key");

    const badPlatform = await h.call("/v1/submissions", {
      ...jsonInit("POST", body, {
        "X-Install-Id": INSTALL_A,
        "Idempotency-Key": crypto.randomUUID(),
        "X-Platform": "windows",
      }),
    });
    expect(badPlatform.status).toBe(400);
  });

  it("limits 5 submissions per install per 24h (429 + Retry-After)", async () => {
    const h = harness({ now: () => new Date("2026-10-04T18:00:00.000Z") });
    for (let i = 0; i < 5; i++) expect((await submit(h)).status).toBe(201);
    const res = await submit(h);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe(String(6 * 3600));
    expect(await count()).toBe(5);
    // A different install on a different IP is unaffected.
    expect((await submit(h, { install: INSTALL_B, ip: "198.51.100.9" })).status).toBe(201);
  });

  it("limits 20 submissions per IP per 24h across installs", async () => {
    const h = harness({ now: () => new Date("2026-10-04T18:00:00.000Z") });
    for (let i = 0; i < 20; i++) {
      expect((await submit(h, { install: crypto.randomUUID() })).status).toBe(201);
    }
    expect((await submit(h, { install: crypto.randomUUID() })).status).toBe(429);
  });

  it("allows CORS from app origins only", async () => {
    const h = harness();
    const pre = await h.call("/v1/submissions", {
      method: "OPTIONS",
      headers: { Origin: APP_ORIGIN, "Access-Control-Request-Method": "POST" },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe(APP_ORIGIN);
    expect(pre.headers.get("Access-Control-Allow-Headers")).toContain("Idempotency-Key");
    expect(pre.headers.get("Access-Control-Allow-Headers")).toContain("X-Install-Id");

    const landing = await h.call("/v1/submissions", {
      method: "OPTIONS",
      headers: { Origin: env.ALLOWED_ORIGIN, "Access-Control-Request-Method": "POST" },
    });
    expect(landing.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("GET /v1/submissions", () => {
  beforeEach(resetDb);

  it("returns only the caller install's items, newest first, without description", async () => {
    let t = Date.parse("2026-10-01T00:00:00.000Z");
    const h = harness({ now: () => new Date((t += 1000)) });
    const k1 = crypto.randomUUID();
    const k2 = crypto.randomUUID();
    await submit(h, { key: k1 });
    await submit(h, { key: k2 });
    await submit(h, { install: INSTALL_B });

    const res = await h.call("/v1/submissions", { headers: { "X-Install-Id": INSTALL_A } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: Record<string, unknown>[] };
    expect(json.items.map((i) => i.clientId)).toEqual([k2, k1]);
    expect(Object.keys(json.items[0]!).sort()).toEqual(
      ["clientId", "createdAt", "id", "publicNote", "status", "updatedAt"].sort(),
    );

    const none = await h.call("/v1/submissions", {
      headers: { "X-Install-Id": crypto.randomUUID() },
    });
    expect(((await none.json()) as { items: unknown[] }).items).toEqual([]);
  });
});
