// Park Out (TDD §8): a sliding-block unblock puzzle. Drag vehicles along their axis to clear
// a path for the star car(s). Rules and the solver live in logic.ts, levels in levels.ts,
// rendering/input/juice in controller.ts; the shared level shell (HUD, level map, stars,
// win card, saves) comes from @itg/game-sdk.
import { PALETTE, createLevelGame } from "@itg/game-sdk";
import { ParkController } from "./controller";
import { LEVELS, WORLDS } from "./levels";

export const SLUG = "park-out";

const factory = createLevelGame({
  slug: SLUG,
  title: "Park Out",
  levelCount: LEVELS.length,
  worlds: [...WORLDS],
  theme: {
    bg: "#191A22",
    bg2: "#262733",
    panel: "#2A2B38",
    text: "#F4F1EA",
    muted: "#B2B0C0",
    accent: "#FFD23F",
    accentText: "#1B1B1F",
    buttonFill: "#3A3B4D",
    star: "#FFD23F",
    confetti: [PALETTE.vermillion, PALETTE.orange, PALETTE.yellow, PALETTE.green, PALETTE.sky],
  },
  create: (env) => new ParkController(env),
});

export default factory;
