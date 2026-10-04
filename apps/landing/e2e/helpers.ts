import type { Page, Route } from "@playwright/test";

const STUB = `window.turnstile = {
  render: function (_el, opts) { setTimeout(function () { opts.callback("fake-token"); }, 0); return "w1"; },
  reset: function () { window.__tsResets = (window.__tsResets || 0) + 1; setTimeout(function () {}, 0); },
  remove: function () {}
};`;

/** Stub Cloudflare Turnstile: block the real script and define a fake widget. */
export async function stubTurnstile(page: Page): Promise<void> {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: STUB }),
  );
}

export interface Captured {
  body: unknown;
}

export async function stubApi(
  page: Page,
  path: string,
  status: number,
  json: unknown,
): Promise<Captured> {
  const captured: Captured = { body: undefined };
  await page.route(`**${path}`, async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "POST",
        },
      });
    }
    captured.body = req.postDataJSON();
    return route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(json),
    });
  });
  return captured;
}
