import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const tiles = (page: Page) => page.locator("button.tile");

test.beforeEach(async ({ page }) => {
  // The API Worker isn't running in e2e: answer analytics and status reads locally.
  await page.route("**/v1/events", (r) => r.fulfill({ status: 202, body: "" }));
  await page.route("**/v1/submissions", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' })
      : r.fallback(),
  );
  await page.goto("/");
  await expect(tiles(page)).toHaveCount(8);
});

async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test("library shows 8 games with 5 locked", async ({ page }) => {
  await expect(page.locator("button.tile.locked")).toHaveCount(5);
  await expect(page.getByText("Locked")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Ring Sort, new" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Untangle, locked, new" })).toBeVisible();
});

test("a free game launches into a canvas and Exit returns to the library", async ({ page }) => {
  await page.getByRole("button", { name: /^Ring Sort/ }).click();
  await expect(page.locator(".game-container canvas")).toBeVisible();
  // The shell's Exit button is keyboard-only (games draw their own back button).
  await page.getByRole("button", { name: "Exit Ring Sort" }).press("Enter");
  await expect(tiles(page)).toHaveCount(8);
  // RULE-12: opened games lose their New badge.
  await expect(page.getByRole("button", { name: "Ring Sort" })).toBeVisible();
});

test("the back button drawn in the game's HUD returns to the library", async ({ page }) => {
  await page.getByRole("button", { name: /^Pin Drop/ }).click();
  const canvas = page.locator(".game-container canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(300);
  await canvas.click({ position: { x: 30, y: 30 } });
  await expect(tiles(page)).toHaveCount(8);
});

test("tapping a locked game opens the paywall with store prices and links", async ({ page }) => {
  await page.getByRole("button", { name: /^Stack Up/ }).click();
  await expect(page.getByRole("heading", { name: "Unlock all games" })).toBeVisible();
  await expect(page.getByText("$2.99 per month")).toBeVisible();
  await expect(page.getByText("$19.99 one-time, forever")).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms of use" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore purchases" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(tiles(page)).toHaveCount(8);
});

test("a dev-adapter purchase unlocks every game and survives reload", async ({ page }) => {
  await page.getByRole("button", { name: /^Park Out/ }).click();
  await page.getByRole("button", { name: /Lifetime/ }).click();
  await expect(tiles(page)).toHaveCount(8);
  await expect(page.locator("button.tile.locked")).toHaveCount(0);
  await page.reload();
  await expect(tiles(page)).toHaveCount(8);
  await expect(page.locator("button.tile.locked")).toHaveCount(0);
  await page.getByRole("button", { name: /^Park Out/ }).click();
  await expect(page.locator(".game-container canvas")).toBeVisible();
});

test("settings toggles persist across reload", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const sound = page.getByRole("switch", { name: /Sound effects/ });
  const haptics = page.getByRole("switch", { name: /Haptics/ });
  const stats = page.getByRole("switch", { name: /usage stats/ });
  await expect(sound).toBeChecked();
  await sound.uncheck();
  await haptics.uncheck();
  await stats.uncheck();
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("switch", { name: /Sound effects/ })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: /Music/ })).toBeChecked();
  await expect(page.getByRole("switch", { name: /Haptics/ })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: /usage stats/ })).not.toBeChecked();
});

test("a request made offline waits, then is delivered once the API is reachable", async ({
  page,
}) => {
  let posts = 0;
  const keys = new Set<string>();
  await page.route("**/v1/submissions", (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    posts++;
    keys.add(r.request().headers()["idempotency-key"] ?? "");
    return r.abort("internetdisconnected");
  });
  await page.getByRole("button", { name: "Request a game" }).click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Please describe the game in 10 to 1,000 characters.")).toBeVisible();
  await page
    .getByLabel(/What happens in the game/)
    .fill("Stack colored rings onto pegs until each peg is one color.");
  await page.getByLabel(/Where did you see it/).fill("A puzzle app");
  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page.getByRole("heading", { name: "My requests" })).toBeVisible();
  await expect(page.getByText("Waiting to send")).toBeVisible();
  await expect.poll(() => posts).toBeGreaterThan(0);

  await page.unroute("**/v1/submissions");
  await page.route("**/v1/submissions", (r) => {
    if (r.request().method() === "GET") {
      return r.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' });
    }
    keys.add(r.request().headers()["idempotency-key"] ?? "");
    return r.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "srv-1",
        status: "received",
        createdAt: new Date().toISOString(),
      }),
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Received")).toBeVisible();
  await expect(page.getByText("Waiting to send")).toHaveCount(0);
  expect(keys.size).toBe(1); // same client ID on every attempt (FR-SUB-2)
});

test.describe("accessibility (NFR-4)", () => {
  test("library", async ({ page }) => {
    await expectNoSeriousA11yIssues(page);
  });
  test("settings", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeFocused();
    await expectNoSeriousA11yIssues(page);
  });
  test("paywall", async ({ page }) => {
    await page.getByRole("button", { name: /^Merge Drop/ }).click();
    await expect(page.getByText("$2.99 per month")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
  test("request a game", async ({ page }) => {
    await page.getByRole("button", { name: "Request a game" }).click();
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Please describe the game")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});
