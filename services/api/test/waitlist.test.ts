import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { hmacHex } from "../src/crypto";
import { harness, jsonInit, resetDb } from "./helpers";

const ORIGIN = env.ALLOWED_ORIGIN.split(",")[0]!;

function signupBody(overrides: Record<string, unknown> = {}) {
  return {
    email: "Person@Example.com ",
    pricePreference: "monthly_299",
    consent: true,
    consentNoticeVersion: "2026-10-01",
    attribution: {
      utmSource: "tiktok",
      utmMedium: "video",
      utmCampaign: "ad-game-1",
      utmContent: "v3",
      referrerHost: "www.tiktok.com",
    },
    turnstileToken: "pass",
    ...overrides,
  };
}

async function rows() {
  const { results } = await env.DB.prepare("SELECT * FROM waitlist_entries").all<
    Record<string, unknown>
  >();
  return results;
}

describe("POST /v1/waitlist", () => {
  beforeEach(resetDb);

  it("stores a valid signup with normalized email and attribution", async () => {
    const h = harness();
    const res = await h.call("/v1/waitlist", jsonInit("POST", signupBody()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    const [row, ...rest] = await rows();
    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({
      email_normalized: "person@example.com",
      price_preference: "monthly_299",
      consent_notice_version: "2026-10-01",
      utm_source: "tiktok",
      utm_medium: "video",
      utm_campaign: "ad-game-1",
      utm_content: "v3",
      referrer_host: "www.tiktok.com",
    });
    expect(row?.consent_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Turnstile was called with secret, token and the client IP.
    expect(h.net.turnstileCalls).toEqual([
      { secret: "test-turnstile-secret", response: "pass", remoteip: "203.0.113.7" },
    ]);
  });

  it("accepts lifetime_1999 and stores missing attribution as NULL", async () => {
    const h = harness();
    const body = signupBody({ pricePreference: "lifetime_1999" });
    delete (body as Record<string, unknown>).attribution;
    const res = await h.call("/v1/waitlist", jsonInit("POST", body));
    expect(res.status).toBe(200);
    const [row] = await rows();
    expect(row).toMatchObject({ price_preference: "lifetime_1999", utm_source: null });
  });

  it("dedupes repeat signups: one row, same response, keeps first attribution", async () => {
    const h = harness();
    const first = await h.call("/v1/waitlist", jsonInit("POST", signupBody()));
    const second = await h.call(
      "/v1/waitlist",
      jsonInit(
        "POST",
        signupBody({
          email: "person@example.com",
          pricePreference: "free_only",
          attribution: { utmSource: "instagram" },
        }),
      ),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ price_preference: "free_only", utm_source: "tiktok" });
  });

  it("rejects an invalid email with validation_failed and field error", async () => {
    const h = harness();
    const res = await h.call("/v1/waitlist", jsonInit("POST", signupBody({ email: "nope@x" })));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: Record<string, unknown> };
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.fields).toHaveProperty("email");
    expect(typeof body.error.requestId).toBe("string");
    expect(res.headers.get("X-Request-Id")).toBe(body.error.requestId);
    expect(await rows()).toHaveLength(0);
    expect(h.net.turnstileCalls).toHaveLength(0);
  });

  it("rejects missing consent", async () => {
    const h = harness();
    const res = await h.call("/v1/waitlist", jsonInit("POST", signupBody({ consent: false })));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.fields).toHaveProperty("consent");
    expect(await rows()).toHaveLength(0);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    const h = harness();
    const bad = await h.call("/v1/waitlist", { method: "POST", body: "{not json" });
    expect(bad.status).toBe(400);
    const big = await h.call(
      "/v1/waitlist",
      jsonInit("POST", signupBody({ consentNoticeVersion: "x".repeat(5000) })),
    );
    expect(big.status).toBe(400);
    expect(((await big.json()) as { error: { message: string } }).error.message).toMatch(
      /too large/,
    );
  });

  it("returns 403 bot_check_failed when Turnstile rejects the token", async () => {
    const h = harness();
    const res = await h.call("/v1/waitlist", jsonInit("POST", signupBody({ turnstileToken: "x" })));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("bot_check_failed");
    expect(await rows()).toHaveLength(0);
  });

  it("rate limits at 10 per IP hash per hour with Retry-After", async () => {
    const fixed = new Date("2026-10-04T12:30:00.000Z");
    const h = harness({ now: () => fixed });
    for (let i = 0; i < 10; i++) {
      const ok = await h.call(
        "/v1/waitlist",
        jsonInit("POST", signupBody({ email: `p${i}@example.com` })),
      );
      expect(ok.status).toBe(200);
    }
    const limited = await h.call(
      "/v1/waitlist",
      jsonInit("POST", signupBody({ email: "p10@example.com" })),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("1800");
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
    // Another IP is unaffected; the IP is stored only as an HMAC.
    const otherIp = await h.call("/v1/waitlist", {
      ...jsonInit("POST", signupBody({ email: "q@example.com" })),
      ip: "198.51.100.1",
    });
    expect(otherIp.status).toBe(200);
    const keys = await env.DB.prepare("SELECT key_hash FROM rate_limits").all<{
      key_hash: string;
    }>();
    const expected = await hmacHex("test-pepper", "203.0.113.7");
    expect(keys.results.map((r) => r.key_hash)).toContain(expected);
    expect(JSON.stringify(keys.results)).not.toContain("203.0.113.7");
  });

  it("sends HSTS and CORS for the landing origin only", async () => {
    const h = harness();
    const res = await h.call("/v1/waitlist", jsonInit("POST", signupBody(), { Origin: ORIGIN }));
    expect(res.headers.get("Strict-Transport-Security")).toMatch(/max-age=\d+/);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);

    const evil = await h.call(
      "/v1/waitlist",
      jsonInit("POST", signupBody(), { Origin: "https://evil.example" }),
    );
    expect(evil.headers.get("Access-Control-Allow-Origin")).toBeNull();

    const pre = await h.call("/v1/waitlist", {
      method: "OPTIONS",
      headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(pre.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(pre.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });
});

describe("POST /v1/waitlist/unsubscribe", () => {
  beforeEach(resetDb);

  it("deletes the entry and answers identically for unknown emails", async () => {
    const h = harness();
    await h.call("/v1/waitlist", jsonInit("POST", signupBody()));
    expect(await rows()).toHaveLength(1);

    const res = await h.call(
      "/v1/waitlist/unsubscribe",
      jsonInit("POST", { email: "PERSON@example.com", turnstileToken: "pass" }),
    );
    expect(res.status).toBe(200);
    const known = await res.text();
    expect(await rows()).toHaveLength(0);

    const unknown = await h.call(
      "/v1/waitlist/unsubscribe",
      jsonInit("POST", { email: "nobody@example.com", turnstileToken: "pass" }),
    );
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toBe(known);
  });

  it("requires a passing bot check", async () => {
    const h = harness();
    await h.call("/v1/waitlist", jsonInit("POST", signupBody()));
    const res = await h.call(
      "/v1/waitlist/unsubscribe",
      jsonInit("POST", { email: "person@example.com", turnstileToken: "fail" }),
    );
    expect(res.status).toBe(403);
    expect(await rows()).toHaveLength(1);
  });
});
