import { describe, expect, it, vi } from "vitest";
import { postJson } from "./api";
import { buildSignupPayload, buildUnsubscribePayload, parseAttribution } from "./lib";

describe("parseAttribution", () => {
  it("reads utm params and the referrer host", () => {
    expect(
      parseAttribution(
        "?utm_source=tiktok&utm_medium=video&utm_campaign=x&utm_content=v3",
        "https://www.tiktok.com/some/path?q=1",
        "itsthatgame.example",
      ),
    ).toEqual({
      utmSource: "tiktok",
      utmMedium: "video",
      utmCampaign: "x",
      utmContent: "v3",
      referrerHost: "www.tiktok.com",
    });
  });
  it("omits empty values, ignores same-site and malformed referrers", () => {
    expect(parseAttribution("?utm_source=%20&foo=bar", "", "a.test")).toEqual({});
    expect(parseAttribution("", "https://a.test/x", "a.test")).toEqual({});
    expect(parseAttribution("", "not a url")).toEqual({});
  });
  it("truncates values to 100 characters", () => {
    const a = parseAttribution(`?utm_source=${"a".repeat(300)}`, "");
    expect(a.utmSource).toHaveLength(100);
  });
});

const good = {
  email: "  Person@Example.com ",
  pricePreference: "monthly_299",
  consent: true,
  turnstileToken: "tok",
  attribution: { utmSource: "tiktok" },
  consentNoticeVersion: "2026-10-04",
};

describe("buildSignupPayload", () => {
  it("builds the IF-1 request body", () => {
    const r = buildSignupPayload(good);
    expect(r).toEqual({
      ok: true,
      data: {
        email: "Person@Example.com",
        pricePreference: "monthly_299",
        consent: true,
        consentNoticeVersion: "2026-10-04",
        attribution: { utmSource: "tiktok" },
        turnstileToken: "tok",
      },
    });
  });
  it("reports a field error for each problem", () => {
    const r = buildSignupPayload({
      ...good,
      email: "nope",
      pricePreference: null,
      consent: false,
      turnstileToken: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.fields).sort()).toEqual([
        "consent",
        "email",
        "pricePreference",
        "turnstileToken",
      ]);
      expect(r.fields.email).toMatch(/valid email/);
    }
  });
  it("accepts every price option and rejects unknown ones", () => {
    for (const p of ["monthly_299", "monthly_499", "lifetime_1999", "free_only"]) {
      expect(buildSignupPayload({ ...good, pricePreference: p }).ok).toBe(true);
    }
    expect(buildSignupPayload({ ...good, pricePreference: "monthly_1" }).ok).toBe(false);
  });
});

describe("buildUnsubscribePayload", () => {
  it("validates email and token", () => {
    expect(buildUnsubscribePayload({ email: "a@b.co", turnstileToken: "t" }).ok).toBe(true);
    const r = buildUnsubscribePayload({ email: "bad", turnstileToken: null });
    expect(r.ok).toBe(false);
  });
});

describe("postJson", () => {
  const res = (status: number, body?: unknown) =>
    vi.fn().mockResolvedValue(new Response(body ? JSON.stringify(body) : null, { status }));
  it("maps status codes", async () => {
    expect(await postJson("/x", {}, res(200))).toEqual({ kind: "ok" });
    expect(await postJson("/x", {}, res(403))).toEqual({ kind: "bot" });
    expect(await postJson("/x", {}, res(429))).toEqual({ kind: "later" });
    expect(await postJson("/x", {}, res(500))).toEqual({ kind: "later" });
    expect(await postJson("/x", {}, res(400, { error: { fields: { email: "invalid" } } }))).toEqual(
      { kind: "validation", fields: { email: "invalid" } },
    );
  });
  it("treats network errors as try-later", async () => {
    expect(await postJson("/x", {}, vi.fn().mockRejectedValue(new Error("net")))).toEqual({
      kind: "later",
    });
  });
});
