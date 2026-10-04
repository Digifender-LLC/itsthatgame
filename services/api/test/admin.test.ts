import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  harness,
  jsonInit,
  makeSigner,
  resetDb,
  validClaims,
  type Harness,
  type Signer,
} from "./helpers";

let signer: Signer;
let token: string;

beforeAll(async () => {
  signer = await makeSigner();
  token = await signer.sign(validClaims());
});

function adminHarness(opts: Parameters<typeof harness>[0] = {}): Harness {
  const h = harness(opts);
  h.net.jwks = [signer.jwk];
  return h;
}

function asOperator(h: Harness, path: string, init: RequestInit = {}, jwt = token) {
  const headers = new Headers(init.headers);
  headers.set("Cf-Access-Jwt-Assertion", jwt);
  return h.call(path, { ...init, headers });
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

async function insertEntry(
  email: string,
  createdAt: string,
  pricePreference: string,
  utmSource: string | null,
) {
  await env.DB.prepare(
    `INSERT INTO waitlist_entries (id, email_normalized, price_preference, consent_at,
       consent_notice_version, utm_source, created_at, updated_at)
     VALUES (?, ?, ?, ?, '2026-10-01', ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), email, pricePreference, createdAt, utmSource, createdAt, createdAt)
    .run();
}

async function insertSubmission(createdAt: string, status = "received", id = crypto.randomUUID()) {
  await env.DB.prepare(
    `INSERT INTO submissions (id, client_id, install_hash, description, status, created_at, updated_at)
     VALUES (?, ?, 'hash', 'A game where you sort rings', ?, ?, ?)`,
  )
    .bind(id, crypto.randomUUID(), status, createdAt, createdAt)
    .run();
  return id;
}

describe("admin authentication (SEC-3)", () => {
  beforeEach(resetDb);

  it("401 without a JWT", async () => {
    const h = adminHarness();
    const res = await h.call("/admin/v1/waitlist/stats");
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("unauthorized");
    // Unknown admin paths also require auth (no route enumeration).
    expect((await h.call("/admin/v1/nope")).status).toBe(401);
  });

  it("401 for wrong audience, issuer, expiry, signature or unknown key", async () => {
    const h = adminHarness();
    const other = await makeSigner("other-kid");
    const cases = [
      await signer.sign(validClaims({ aud: ["someone-else"] })),
      await signer.sign(validClaims({ iss: "https://evil.cloudflareaccess.com" })),
      await signer.sign(validClaims({ exp: Math.floor(Date.now() / 1000) - 3600 })),
      await signer.sign(validClaims(), { alg: "HS256" }),
      await other.sign(validClaims()),
      // Valid header/payload from our key with a signature from another key.
      (await signer.sign(validClaims())).split(".").slice(0, 2).join(".") +
        "." +
        (await other.sign(validClaims())).split(".")[2],
      "not-a-jwt",
    ];
    for (const jwt of cases) {
      const res = await asOperator(h, "/admin/v1/waitlist/stats", {}, jwt);
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("unauthorized");
    }
  });

  it("403 for a valid identity that is not an operator", async () => {
    const h = adminHarness();
    const jwt = await signer.sign(validClaims({ email: "intruder@example.com" }));
    const res = await asOperator(h, "/admin/v1/waitlist/stats", {}, jwt);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("forbidden");
  });

  it("caches the JWKS and sends no CORS headers on admin routes", async () => {
    const h = adminHarness();
    const res1 = await asOperator(h, "/admin/v1/waitlist/stats", {
      headers: { Origin: env.ALLOWED_ORIGIN },
    });
    await asOperator(h, "/admin/v1/waitlist/stats");
    expect(res1.status).toBe(200);
    expect(res1.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(h.net.jwksCalls).toBe(1);
  });
});

describe("waitlist stats and export (FR-WL-5)", () => {
  beforeEach(resetDb);

  it("returns counts by day, source and price preference", async () => {
    await insertEntry("a@example.com", "2026-10-01T10:00:00.000Z", "monthly_299", "tiktok");
    await insertEntry("b@example.com", "2026-10-01T23:59:59.000Z", "monthly_299", null);
    await insertEntry("c@example.com", "2026-10-02T08:00:00.000Z", "lifetime_1999", "tiktok");
    await insertEntry("d@example.com", "2026-10-03T08:00:00.000Z", "free_only", "instagram");
    const h = adminHarness();
    const res = await asOperator(h, "/admin/v1/waitlist/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 4,
      byDay: [
        { day: "2026-10-01", count: 2 },
        { day: "2026-10-02", count: 1 },
        { day: "2026-10-03", count: 1 },
      ],
      bySource: [
        { source: "tiktok", count: 2 },
        { source: "(none)", count: 1 },
        { source: "instagram", count: 1 },
      ],
      byPricePreference: [
        { pricePreference: "monthly_299", count: 2 },
        { pricePreference: "free_only", count: 1 },
        { pricePreference: "lifetime_1999", count: 1 },
      ],
    });

    const ranged = await asOperator(h, "/admin/v1/waitlist/stats?from=2026-10-02&to=2026-10-02");
    const body = (await ranged.json()) as { total: number };
    expect(body.total).toBe(1);

    const bad = await asOperator(h, "/admin/v1/waitlist/stats?from=yesterday");
    expect(bad.status).toBe(400);
  });

  it("exports CSV with quoting and formula-injection neutralised", async () => {
    await insertEntry(
      "a@example.com",
      "2026-10-01T10:00:00.000Z",
      "monthly_299",
      '=HYPERLINK("x")',
    );
    await insertEntry("b@example.com", "2026-10-02T10:00:00.000Z", "free_only", "a,b\nc");
    await insertEntry("c@example.com", "2026-10-03T10:00:00.000Z", "free_only", "@cmd");
    const h = adminHarness();
    const res = await asOperator(h, "/admin/v1/waitlist/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const text = await res.text();
    const lines = text.split("\r\n");
    expect(lines[0]).toBe(
      "id,email_normalized,price_preference,consent_at,consent_notice_version,utm_source,utm_medium,utm_campaign,utm_content,referrer_host,created_at,updated_at",
    );
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(text).toContain('"a,b\nc"');
    expect(text).toContain(`"'@cmd"`);
    expect(text).toContain('"a@example.com"');
    expect(text.endsWith("\r\n")).toBe(true);
  });
});

describe("admin submissions (FR-SUB-4, FR-SUB-5)", () => {
  beforeEach(resetDb);

  it("lists newest first with keyset cursor pagination and status filter", async () => {
    const ids: string[] = [];
    // 55 rows; two share a timestamp to exercise the (created_at, id) tie-break.
    for (let i = 0; i < 55; i++) {
      const ts = new Date(Date.UTC(2026, 9, 1, 0, 0, i === 54 ? 53 : i)).toISOString();
      ids.push(await insertSubmission(ts, i % 5 === 0 ? "reviewing" : "received"));
    }
    const h = adminHarness();
    const page1 = (await (await asOperator(h, "/admin/v1/submissions")).json()) as {
      items: { id: string; description: string; createdAt: string }[];
      nextCursor: string | null;
    };
    expect(page1.items).toHaveLength(50);
    expect(page1.items[0]!.description).toBe("A game where you sort rings");
    expect(page1.nextCursor).not.toBeNull();
    const page2 = (await (
      await asOperator(h, `/admin/v1/submissions?cursor=${encodeURIComponent(page1.nextCursor!)}`)
    ).json()) as { items: { id: string }[]; nextCursor: string | null };
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).toBeNull();
    const all = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(all).size).toBe(55);
    expect(new Set(all)).toEqual(new Set(ids));
    const created = page1.items.map((i) => i.createdAt);
    expect([...created].sort().reverse()).toEqual(created);

    const reviewing = (await (
      await asOperator(h, "/admin/v1/submissions?status=reviewing")
    ).json()) as { items: { status: string }[] };
    expect(reviewing.items).toHaveLength(11);
    expect(reviewing.items.every((i) => i.status === "reviewing")).toBe(true);

    expect((await asOperator(h, "/admin/v1/submissions?status=bogus")).status).toBe(400);
    expect((await asOperator(h, "/admin/v1/submissions?cursor=%%%")).status).toBe(400);
  });

  it("applies a valid transition with a public note", async () => {
    const id = await insertSubmission("2026-10-01T00:00:00.000Z");
    const h = adminHarness();
    const res = await asOperator(
      h,
      `/admin/v1/submissions/${id}`,
      jsonInit("PATCH", { from: "received", to: "reviewing", publicNote: "Looking at it!" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id,
      status: "reviewing",
      publicNote: "Looking at it!",
    });
    // Omitting publicNote keeps the existing note.
    const next = await asOperator(
      h,
      `/admin/v1/submissions/${id}`,
      jsonInit("PATCH", { from: "reviewing", to: "planned" }),
    );
    expect(await next.json()).toMatchObject({ status: "planned", publicNote: "Looking at it!" });
  });

  it("rejects transitions not in the RULE-10 table with 400", async () => {
    const id = await insertSubmission("2026-10-01T00:00:00.000Z");
    const h = adminHarness();
    const res = await asOperator(
      h,
      `/admin/v1/submissions/${id}`,
      jsonInit("PATCH", { from: "received", to: "shipped" }),
    );
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("validation_failed");
    const shipped = await insertSubmission("2026-10-01T00:00:01.000Z", "shipped");
    const fromShipped = await asOperator(
      h,
      `/admin/v1/submissions/${shipped}`,
      jsonInit("PATCH", { from: "shipped", to: "declined" }),
    );
    expect(fromShipped.status).toBe(400);
  });

  it("returns 409 with the current status when `from` is stale", async () => {
    const id = await insertSubmission("2026-10-01T00:00:00.000Z", "planned");
    const h = adminHarness();
    const res = await asOperator(
      h,
      `/admin/v1/submissions/${id}`,
      jsonInit("PATCH", { from: "received", to: "reviewing" }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; currentStatus: string } };
    expect(body.error).toMatchObject({ code: "conflict", currentStatus: "planned" });
    const row = await env.DB.prepare("SELECT status FROM submissions WHERE id = ?")
      .bind(id)
      .first<{ status: string }>();
    expect(row?.status).toBe("planned");
  });

  it("returns 404 for an unknown id on PATCH and DELETE", async () => {
    const h = adminHarness();
    const missing = crypto.randomUUID();
    const patch = await asOperator(
      h,
      `/admin/v1/submissions/${missing}`,
      jsonInit("PATCH", { from: "received", to: "reviewing" }),
    );
    expect(patch.status).toBe(404);
    const del = await asOperator(h, `/admin/v1/submissions/${missing}`, { method: "DELETE" });
    expect(del.status).toBe(404);
  });

  it("deletes a submission", async () => {
    const id = await insertSubmission("2026-10-01T00:00:00.000Z");
    const h = adminHarness();
    const res = await asOperator(h, `/admin/v1/submissions/${id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    const row = await env.DB.prepare("SELECT id FROM submissions WHERE id = ?").bind(id).first();
    expect(row).toBeNull();
  });
});
