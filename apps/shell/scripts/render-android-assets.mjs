#!/usr/bin/env node
// Renders the Android launcher icons and splash screens from code (original, procedural
// art; no source image files). Re-run after changing the design, then commit the PNGs:
//
//   node apps/shell/scripts/render-android-assets.mjs
//
// Uses Playwright's Chromium only as a canvas rasterizer.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const res = join(dirname(fileURLToPath(import.meta.url)), "../android/app/src/main/res");
export const BRAND_BG = "#231F4A";

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH = {
  "drawable/splash.png": [480, 320],
  "drawable-land-mdpi/splash.png": [480, 320],
  "drawable-land-hdpi/splash.png": [800, 480],
  "drawable-land-xhdpi/splash.png": [1280, 720],
  "drawable-land-xxhdpi/splash.png": [1600, 960],
  "drawable-land-xxxhdpi/splash.png": [1920, 1280],
  "drawable-port-mdpi/splash.png": [320, 480],
  "drawable-port-hdpi/splash.png": [480, 800],
  "drawable-port-xhdpi/splash.png": [720, 1280],
  "drawable-port-xxhdpi/splash.png": [960, 1600],
  "drawable-port-xxxhdpi/splash.png": [1280, 1920],
};

// Runs inside the page. Draws the mark (a tilted "ad card" with a play button, orbited by
// a ring, a square and a triangle) centred at (cx, cy) with overall size s.
function pageScript() {
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function mark(g, cx, cy, s) {
    g.save();
    g.translate(cx, cy);
    // card
    g.save();
    g.rotate(-0.14);
    const w = s * 0.62;
    const h = s * 0.62;
    rr(g, -w / 2, -h / 2 + s * 0.035, w, h, s * 0.13);
    g.fillStyle = "#B8860B";
    g.fill();
    rr(g, -w / 2, -h / 2, w, h, s * 0.13);
    const grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, "#FFE066");
    grad.addColorStop(1, "#FFB627");
    g.fillStyle = grad;
    g.fill();
    // play triangle
    g.beginPath();
    g.moveTo(-s * 0.1, -s * 0.15);
    g.lineTo(s * 0.17, 0);
    g.lineTo(-s * 0.1, s * 0.15);
    g.closePath();
    g.lineJoin = "round";
    g.lineWidth = s * 0.05;
    g.strokeStyle = "#231F4A";
    g.fillStyle = "#231F4A";
    g.fill();
    g.stroke();
    g.restore();
    // ring, top-left
    g.beginPath();
    g.arc(-s * 0.36, -s * 0.33, s * 0.1, 0, Math.PI * 2);
    g.lineWidth = s * 0.065;
    g.strokeStyle = "#56B4E9";
    g.stroke();
    // square, bottom-left
    g.save();
    g.translate(-s * 0.38, s * 0.32);
    g.rotate(0.35);
    rr(g, -s * 0.075, -s * 0.075, s * 0.15, s * 0.15, s * 0.03);
    g.fillStyle = "#2BD99F";
    g.fill();
    g.restore();
    // triangle, top-right
    g.save();
    g.translate(s * 0.37, -s * 0.31);
    g.rotate(0.3);
    g.beginPath();
    g.moveTo(0, -s * 0.09);
    g.lineTo(s * 0.085, s * 0.065);
    g.lineTo(-s * 0.085, s * 0.065);
    g.closePath();
    g.fillStyle = "#FF7A59";
    g.fill();
    g.restore();
    g.restore();
  }
  function bg(g, w, h) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#2E2A66");
    grad.addColorStop(1, "#1A1738");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  window.render = (kind, w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (kind === "foreground") {
      // adaptive icon: 108dp canvas, keep the mark inside the 66dp safe zone
      mark(g, w / 2, h / 2, w * 0.6);
    } else if (kind === "legacy" || kind === "round") {
      g.save();
      if (kind === "round") {
        g.beginPath();
        g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      } else rr(g, 0, 0, w, h, w * 0.18);
      g.clip();
      bg(g, w, h);
      mark(g, w / 2, h / 2, w * 0.82);
      g.restore();
    } else {
      bg(g, w, h);
      const s = Math.min(w, h) * 0.34;
      mark(g, w / 2, h / 2 - s * 0.12, s);
      g.fillStyle = "#F4EFE4";
      g.font = `800 ${Math.round(s * 0.2)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("ItsThatGame", w / 2, h / 2 + s * 0.62);
    }
    return c.toDataURL("image/png").split(",")[1];
  };
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><body></body>");
await page.evaluate(pageScript);
const write = async (rel, kind, w, h) => {
  const b64 = await page.evaluate(([k, ww, hh]) => window.render(k, ww, hh), [kind, w, h]);
  writeFileSync(join(res, rel), Buffer.from(b64, "base64"));
  console.log(`wrote ${rel} (${w}x${h})`);
};
for (const [d, k] of Object.entries(DENSITIES)) {
  await write(`mipmap-${d}/ic_launcher.png`, "legacy", 48 * k, 48 * k);
  await write(`mipmap-${d}/ic_launcher_round.png`, "round", 48 * k, 48 * k);
  await write(`mipmap-${d}/ic_launcher_foreground.png`, "foreground", 108 * k, 108 * k);
}
for (const [rel, [w, h]] of Object.entries(SPLASH)) await write(rel, "splash", w, h);
writeFileSync(
  join(res, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND_BG}</color>\n</resources>\n`,
);
await browser.close();
