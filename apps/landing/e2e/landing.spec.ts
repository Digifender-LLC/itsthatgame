import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { stubApi, stubTurnstile } from "./helpers";

async function fill(page: Page) {
  await page.getByLabel("Email address").fill("Person@Example.com");
  await page.getByLabel("$4.99 per month").check();
  await page.getByLabel(/I agree to be emailed/).check();
  // wait for the stub widget token callback
  await page.waitForTimeout(100);
}

test.beforeEach(async ({ page }) => {
  await stubTurnstile(page);
});

test("renders all signup elements and loads no non-stubbed third parties", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "localhost") external.push(u.hostname);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "The last mobile ad game you'll ever need",
  );
  await expect(page.getByText("We built the game from the ad.")).toBeVisible();
  await expect(page.getByRole("group", { name: /would you pay/ })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("link", { name: "privacy notice", exact: true })).toHaveAttribute(
    "href",
    "/privacy.html",
  );
  await expect(page.getByRole("button", { name: "Join the waitlist" })).toBeVisible();
  expect(new Set(external)).toEqual(new Set(["challenges.cloudflare.com"]));
  expect(await page.context().cookies()).toEqual([]);
});

test("successful signup sends the expected body", async ({ page }) => {
  const cap = await stubApi(page, "/v1/waitlist", 200, { status: "ok" });
  await page.goto("/?utm_source=tiktok&utm_campaign=x");
  await fill(page);
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByRole("heading", { name: "You're on the list" })).toBeVisible();
  expect(cap.body).toEqual({
    email: "Person@Example.com",
    pricePreference: "monthly_499",
    consent: true,
    consentNoticeVersion: "2026-10-04",
    attribution: { utmSource: "tiktok", utmCampaign: "x" },
    turnstileToken: "fake-token",
  });
});

test("client-side validation shows linked errors without calling the API", async ({ page }) => {
  let called = false;
  await page.route("**/v1/waitlist", (r) => {
    called = true;
    return r.abort();
  });
  await page.goto("/");
  await page.getByLabel("Email address").fill("bad");
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  const email = page.getByLabel("Email address");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#email-error")).toHaveText("Enter a valid email address.");
  await expect(email).toHaveAttribute("aria-describedby", "email-error");
  await expect(page.locator("#price-error")).toHaveText("Choose one of the options.");
  await expect(page.locator("#consent-error")).toContainText("tick the box");
  expect(called).toBe(false);
});

test("400 from the API shows inline field errors", async ({ page }) => {
  await stubApi(page, "/v1/waitlist", 400, {
    error: {
      code: "validation_failed",
      message: "bad",
      fields: { email: "invalid" },
      requestId: "r",
    },
  });
  await page.goto("/");
  await fill(page);
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.locator("#email-error")).toHaveText("Enter a valid email address.");
  await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");
});

test("403 asks to retry the human check and resets the widget", async ({ page }) => {
  await stubApi(page, "/v1/waitlist", 403, {
    error: { code: "bot_check_failed", message: "x", requestId: "r" },
  });
  await page.goto("/");
  await fill(page);
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.locator("#form-status")).toHaveText(
    "Couldn't verify you're human, please try again.",
  );
  expect(await page.evaluate(() => (window as unknown as { __tsResets?: number }).__tsResets)).toBe(
    1,
  );
});

test("429 shows the try-again-later message", async ({ page }) => {
  await stubApi(page, "/v1/waitlist", 429, {
    error: { code: "rate_limited", message: "x", requestId: "r" },
  });
  await page.goto("/");
  await fill(page);
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.locator("#form-status")).toHaveText("Please try again later.");
});

test("unsubscribe flow", async ({ page }) => {
  const cap = await stubApi(page, "/v1/waitlist/unsubscribe", 200, { status: "ok" });
  await page.goto("/unsubscribe.html");
  await page.getByLabel("Email address").fill("gone@example.com");
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "Remove my email" }).click();
  await expect(page.getByText("If that email was on the list, it has been removed.")).toBeVisible();
  expect(cap.body).toEqual({ email: "gone@example.com", turnstileToken: "fake-token" });
});

test("works at 320px width without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const path of ["/", "/privacy.html", "/support.html", "/unsubscribe.html", "/terms.html"]) {
  test(`axe: no serious or critical violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(150);
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(",")}`)).toEqual([]);
  });
}
