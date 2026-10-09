#!/usr/bin/env node
// Dev-only: screenshot a game in the preview page at phone size, optionally after a script
// of taps and drags. Needs the dev server running (`pnpm --filter @itg/shell dev`).
//
//   node apps/shell/scripts/preview-shot.mjs --game ring-sort --out shot.png \
//     [--url http://127.0.0.1:5174] [--reset] [--reduced] \
//     [--actions '[{"tap":[195,400]},{"wait":400},{"drag":[60,300,300,300]},{"shot":"b.png"}]']
//
// Actions: tap [x,y]; drag [x1,y1,x2,y2,steps?]; wait ms; shot path; eval "js expr".
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const game = opt("game", "ring-sort");
const out = opt("out", `${game}.png`);
const base = opt("url", "http://127.0.0.1:5174");
const actions = JSON.parse(opt("actions", "[]"));

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
});
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const q = new URLSearchParams({ game });
if (flag("reset")) q.set("reset", "1");
if (flag("reduced")) q.set("reduced", "1");
await page.goto(`${base}/preview.html?${q}`);
await page.waitForSelector("canvas");
await page.waitForTimeout(600);
for (const a of actions) {
  if (a.tap) {
    await page.mouse.move(a.tap[0], a.tap[1]);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(60);
  } else if (a.drag) {
    const [x1, y1, x2, y2, steps = 12] = a.drag;
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps });
    await page.mouse.up();
    await page.waitForTimeout(60);
  } else if (a.wait) {
    await page.waitForTimeout(a.wait);
  } else if (a.shot) {
    await page.screenshot({ path: a.shot });
  } else if (a.eval) {
    logs.push(`[eval] ${JSON.stringify(await page.evaluate(a.eval))}`);
  }
}
await page.screenshot({ path: out });
await browser.close();
for (const l of logs) console.log(l);
console.log(`saved ${out}`);
