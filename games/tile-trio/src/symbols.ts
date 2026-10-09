// Tile Trio symbols: twelve original icons drawn with Canvas paths (no image files). Each has
// its own silhouette AND colour, so colour is never the only cue (NFR-4). They are loosely
// fruit-and-gem themed: cherries, lemon, pear drop, sapphire, star, carrot, emerald hex,
// heart, bell, moon, flower and bolt.

export const SYMBOL_COUNT = 12;

export const SYMBOL_NAMES = [
  "cherries",
  "lemon",
  "pear",
  "sapphire",
  "star",
  "carrot",
  "hex gem",
  "heart",
  "bell",
  "moon",
  "flower",
  "bolt",
] as const;

export const SYMBOL_COLORS = [
  "#E3354D", // cherries
  "#F6C520", // lemon
  "#38A956", // pear
  "#2F6FE3", // sapphire
  "#8D5CD8", // star
  "#F2802A", // carrot
  "#17A9A0", // hex gem
  "#F25A9C", // heart
  "#B97A2A", // bell
  "#52B8F4", // moon
  "#C84FD2", // flower
  "#9AD42F", // bolt
] as const;

export const INK = "#2A2140";

function ink(g: CanvasRenderingContext2D, r: number): void {
  g.lineWidth = Math.max(1.6, r * 0.15);
  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = INK;
  g.stroke();
}

function gloss(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, -0.6, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,255,255,0.45)";
  g.fill();
}

function poly(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, pts: number[]): void {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const x = cx + pts[i]! * r;
    const y = cy + pts[i + 1]! * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** Draws symbol `kind` (0-11) centred at (cx, cy) filling roughly a circle of radius r. */
export function drawSymbol(
  g: CanvasRenderingContext2D,
  kind: number,
  cx: number,
  cy: number,
  r: number,
): void {
  const k = ((kind % SYMBOL_COUNT) + SYMBOL_COUNT) % SYMBOL_COUNT;
  const fill = SYMBOL_COLORS[k]!;
  switch (k) {
    case 0: {
      // cherries: two berries on crossing stems with a leaf
      g.beginPath();
      g.moveTo(cx - 0.45 * r, cy + 0.1 * r);
      g.quadraticCurveTo(cx - 0.2 * r, cy - 0.7 * r, cx + 0.15 * r, cy - 0.95 * r);
      g.moveTo(cx + 0.5 * r, cy + 0.2 * r);
      g.quadraticCurveTo(cx + 0.45 * r, cy - 0.6 * r, cx + 0.15 * r, cy - 0.95 * r);
      g.strokeStyle = INK;
      g.lineWidth = Math.max(2.4, r * 0.24);
      g.lineCap = "round";
      g.stroke();
      g.strokeStyle = "#5C9B3A";
      g.lineWidth = Math.max(1.2, r * 0.1);
      g.stroke();
      g.beginPath();
      g.moveTo(cx + 0.15 * r, cy - 0.95 * r);
      g.quadraticCurveTo(cx + 0.7 * r, cy - 1.15 * r, cx + 0.95 * r, cy - 0.6 * r);
      g.quadraticCurveTo(cx + 0.45 * r, cy - 0.45 * r, cx + 0.15 * r, cy - 0.95 * r);
      g.fillStyle = "#4FB04B";
      g.fill();
      ink(g, r * 0.8);
      for (const [bx, by] of [
        [-0.45, 0.45],
        [0.5, 0.55],
      ] as const) {
        g.beginPath();
        g.arc(cx + bx * r, cy + by * r, 0.5 * r, 0, Math.PI * 2);
        g.fillStyle = fill;
        g.fill();
        ink(g, r);
        gloss(g, cx + (bx - 0.15) * r, cy + (by - 0.18) * r, 0.14 * r, 0.09 * r);
      }
      break;
    }
    case 1: {
      // lemon: pointed lens with nubs
      g.beginPath();
      g.moveTo(cx - 1.05 * r, cy + 0.2 * r);
      g.bezierCurveTo(
        cx - 0.9 * r,
        cy - 0.85 * r,
        cx + 0.5 * r,
        cy - 1.05 * r,
        cx + 1.05 * r,
        cy - 0.2 * r,
      );
      g.bezierCurveTo(
        cx + 0.9 * r,
        cy + 0.85 * r,
        cx - 0.5 * r,
        cy + 1.05 * r,
        cx - 1.05 * r,
        cy + 0.2 * r,
      );
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      gloss(g, cx - 0.2 * r, cy - 0.4 * r, 0.32 * r, 0.12 * r);
      break;
    }
    case 2: {
      // pear drop
      g.beginPath();
      g.moveTo(cx, cy - 1.05 * r);
      g.bezierCurveTo(
        cx + 0.3 * r,
        cy - 0.55 * r,
        cx + 0.9 * r,
        cy - 0.1 * r,
        cx + 0.9 * r,
        cy + 0.4 * r,
      );
      g.bezierCurveTo(cx + 0.9 * r, cy + 0.85 * r, cx + 0.45 * r, cy + 1.05 * r, cx, cy + 1.05 * r);
      g.bezierCurveTo(
        cx - 0.45 * r,
        cy + 1.05 * r,
        cx - 0.9 * r,
        cy + 0.85 * r,
        cx - 0.9 * r,
        cy + 0.4 * r,
      );
      g.bezierCurveTo(cx - 0.9 * r, cy - 0.1 * r, cx - 0.3 * r, cy - 0.55 * r, cx, cy - 1.05 * r);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      gloss(g, cx - 0.35 * r, cy + 0.25 * r, 0.3 * r, 0.12 * r);
      break;
    }
    case 3: {
      // sapphire: cut gem
      poly(g, cx, cy, r, [-0.55, -0.8, 0.55, -0.8, 1.05, -0.2, 0, 1.05, -1.05, -0.2]);
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      g.beginPath();
      g.moveTo(cx - 1.05 * r, cy - 0.2 * r);
      g.lineTo(cx + 1.05 * r, cy - 0.2 * r);
      g.moveTo(cx - 0.35 * r, cy - 0.8 * r);
      g.lineTo(cx - 0.3 * r, cy - 0.2 * r);
      g.lineTo(cx, cy + 1.05 * r);
      g.moveTo(cx + 0.35 * r, cy - 0.8 * r);
      g.lineTo(cx + 0.3 * r, cy - 0.2 * r);
      g.lineTo(cx, cy + 1.05 * r);
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.lineWidth = Math.max(1, r * 0.08);
      g.stroke();
      break;
    }
    case 4: {
      // star
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? 1.15 * r : 0.52 * r;
        const x = cx + Math.cos(a) * rad;
        const y = cy + 0.05 * r + Math.sin(a) * rad;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      gloss(g, cx - 0.2 * r, cy - 0.3 * r, 0.22 * r, 0.1 * r);
      break;
    }
    case 5: {
      // carrot: down-pointing triangle with leafy tuft
      g.beginPath();
      g.moveTo(cx - 0.7 * r, cy - 0.5 * r);
      g.bezierCurveTo(
        cx - 0.4 * r,
        cy - 0.85 * r,
        cx + 0.4 * r,
        cy - 0.85 * r,
        cx + 0.7 * r,
        cy - 0.5 * r,
      );
      g.lineTo(cx + 0.1 * r, cy + 1.05 * r);
      g.quadraticCurveTo(cx, cy + 1.15 * r, cx - 0.1 * r, cy + 1.05 * r);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      g.beginPath();
      g.moveTo(cx - 0.35 * r, cy - 0.1 * r);
      g.lineTo(cx - 0.05 * r, cy - 0.05 * r);
      g.moveTo(cx + 0.3 * r, cy + 0.2 * r);
      g.lineTo(cx + 0.02 * r, cy + 0.25 * r);
      g.strokeStyle = "rgba(255,255,255,0.55)";
      g.lineWidth = Math.max(1, r * 0.09);
      g.stroke();
      for (const dx of [-0.35, 0, 0.35]) {
        g.beginPath();
        g.ellipse(
          cx + dx * r,
          cy - 0.95 * r - Math.abs(dx) * 0.0,
          0.14 * r,
          0.32 * r,
          dx * 1.2,
          0,
          Math.PI * 2,
        );
        g.fillStyle = "#4FB04B";
        g.fill();
        ink(g, r * 0.6);
      }
      break;
    }
    case 6: {
      // hex gem with inner facet
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const x = cx + Math.cos(a) * 1.08 * r;
        const y = cy + Math.sin(a) * 1.08 * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const x = cx + Math.cos(a) * 0.52 * r;
        const y = cy + Math.sin(a) * 0.52 * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.fill();
      break;
    }
    case 7: {
      // heart
      g.beginPath();
      g.moveTo(cx, cy + 1.0 * r);
      g.bezierCurveTo(
        cx - 1.4 * r,
        cy + 0.1 * r,
        cx - 1.1 * r,
        cy - 1.0 * r,
        cx - 0.5 * r,
        cy - 0.9 * r,
      );
      g.bezierCurveTo(cx - 0.2 * r, cy - 0.85 * r, cx, cy - 0.6 * r, cx, cy - 0.4 * r);
      g.bezierCurveTo(cx, cy - 0.6 * r, cx + 0.2 * r, cy - 0.85 * r, cx + 0.5 * r, cy - 0.9 * r);
      g.bezierCurveTo(cx + 1.1 * r, cy - 1.0 * r, cx + 1.4 * r, cy + 0.1 * r, cx, cy + 1.0 * r);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      gloss(g, cx - 0.55 * r, cy - 0.4 * r, 0.25 * r, 0.11 * r);
      break;
    }
    case 8: {
      // bell with clapper
      g.beginPath();
      g.moveTo(cx - 1.0 * r, cy + 0.65 * r);
      g.bezierCurveTo(
        cx - 0.95 * r,
        cy + 0.25 * r,
        cx - 0.62 * r,
        cy + 0.1 * r,
        cx - 0.62 * r,
        cy - 0.35 * r,
      );
      g.bezierCurveTo(cx - 0.62 * r, cy - 0.85 * r, cx - 0.3 * r, cy - 1.0 * r, cx, cy - 1.0 * r);
      g.bezierCurveTo(
        cx + 0.3 * r,
        cy - 1.0 * r,
        cx + 0.62 * r,
        cy - 0.85 * r,
        cx + 0.62 * r,
        cy - 0.35 * r,
      );
      g.bezierCurveTo(
        cx + 0.62 * r,
        cy + 0.1 * r,
        cx + 0.95 * r,
        cy + 0.25 * r,
        cx + 1.0 * r,
        cy + 0.65 * r,
      );
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      g.beginPath();
      g.arc(cx, cy + 0.85 * r, 0.24 * r, 0, Math.PI * 2);
      g.fillStyle = "#F6D36B";
      g.fill();
      ink(g, r * 0.7);
      gloss(g, cx - 0.3 * r, cy - 0.45 * r, 0.12 * r, 0.3 * r);
      break;
    }
    case 9: {
      // crescent moon
      g.beginPath();
      g.arc(cx, cy, 1.05 * r, -1.211, 0.63, true);
      g.arc(cx + 0.52 * r, cy - 0.16 * r, 0.84 * r, 1.176, 4.528, false);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      break;
    }
    case 10: {
      // flower: five petals and a bright centre
      g.fillStyle = fill;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        g.beginPath();
        g.arc(cx + Math.cos(a) * 0.62 * r, cy + Math.sin(a) * 0.62 * r, 0.46 * r, 0, Math.PI * 2);
        g.fill();
        ink(g, r * 0.9);
      }
      // cover the inner outlines, then the centre
      g.beginPath();
      g.arc(cx, cy, 0.7 * r, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      g.beginPath();
      g.arc(cx, cy, 0.34 * r, 0, Math.PI * 2);
      g.fillStyle = "#FFD84A";
      g.fill();
      ink(g, r * 0.8);
      break;
    }
    default: {
      // lightning bolt
      poly(g, cx, cy, r, [0.25, -1.1, -0.75, 0.15, -0.1, 0.15, -0.35, 1.1, 0.8, -0.25, 0.1, -0.25]);
      g.fillStyle = fill;
      g.fill();
      ink(g, r);
      break;
    }
  }
}
