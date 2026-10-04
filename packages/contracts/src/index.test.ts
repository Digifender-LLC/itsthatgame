import { describe, expect, it } from "vitest";
import {
  analyticsBatchRequest,
  canTransition,
  isAllowedEvent,
  normalizeEmail,
  submissionCreateRequest,
  waitlistSignupRequest,
} from "./index";

const validSignup = {
  email: "  Person@Example.com ",
  pricePreference: "monthly_299",
  consent: true,
  consentNoticeVersion: "2026-10-04",
  turnstileToken: "tok",
};

describe("waitlist", () => {
  it("accepts a valid signup and defaults attribution", () => {
    const r = waitlistSignupRequest.parse(validSignup);
    expect(r.attribution).toEqual({});
  });
  it("normalizes emails (RULE-6)", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });
  it("rejects missing consent", () => {
    expect(waitlistSignupRequest.safeParse({ ...validSignup, consent: false }).success).toBe(false);
  });
  it("rejects bad email and unknown price", () => {
    expect(waitlistSignupRequest.safeParse({ ...validSignup, email: "nope" }).success).toBe(false);
    expect(waitlistSignupRequest.safeParse({ ...validSignup, pricePreference: "x" }).success).toBe(
      false,
    );
  });
  it("caps attribution length", () => {
    const r = waitlistSignupRequest.safeParse({
      ...validSignup,
      attribution: { utmSource: "a".repeat(101) },
    });
    expect(r.success).toBe(false);
  });
});

describe("submissions (RULE-7)", () => {
  it("enforces description length", () => {
    expect(submissionCreateRequest.safeParse({ description: "short" }).success).toBe(false);
    expect(submissionCreateRequest.safeParse({ description: "x".repeat(1001) }).success).toBe(
      false,
    );
    expect(
      submissionCreateRequest.safeParse({ description: "A tower of rings to sort" }).success,
    ).toBe(true);
  });
  it("accepts only http(s) links", () => {
    const base = { description: "A tower of rings to sort" };
    expect(submissionCreateRequest.safeParse({ ...base, link: "https://x.test/a" }).success).toBe(
      true,
    );
    expect(
      submissionCreateRequest.safeParse({ ...base, link: "javascript:alert(1)" }).success,
    ).toBe(false);
  });
});

describe("status transitions (RULE-10)", () => {
  it("follows the table", () => {
    expect(canTransition("received", "reviewing")).toBe(true);
    expect(canTransition("received", "shipped")).toBe(false);
    expect(canTransition("declined", "reviewing")).toBe(true);
    expect(canTransition("shipped", "declined")).toBe(false);
  });
});

describe("analytics", () => {
  it("limits batch size and knows allowed names", () => {
    expect(analyticsBatchRequest.safeParse({ events: [] }).success).toBe(false);
    expect(isAllowedEvent("app_open")).toBe(true);
    expect(isAllowedEvent("idfa_sync")).toBe(false);
  });
});
