import { memoryBackend } from "@itg/game-sdk";
import { describe, expect, it } from "vitest";
import { loadProgressSummaries, summarizeProgress } from "./progress";

describe("summarizeProgress", () => {
  it("summarizes level games with stars", () => {
    expect(
      summarizeProgress(JSON.stringify({ currentLevel: 7, bestLevel: 6, stars: [3, 2, 1] })),
    ).toBe("Level 7 · ★ 6");
  });
  it("summarizes endless games by best score", () => {
    expect(summarizeProgress(JSON.stringify({ best: 41, runs: 9 }))).toBe("Best 41");
  });
  it("shows nothing for fresh or corrupt saves", () => {
    expect(summarizeProgress(null)).toBeNull();
    expect(summarizeProgress("{")).toBeNull();
    expect(summarizeProgress(JSON.stringify({ currentLevel: 1, bestLevel: 0 }))).toBeNull();
  });
});

describe("loadProgressSummaries", () => {
  it("reads each game's scoped progress key", async () => {
    const kv = memoryBackend({ "game:stack-up:progress": JSON.stringify({ best: 3, runs: 1 }) });
    expect(await loadProgressSummaries(kv, ["stack-up", "ring-sort"])).toEqual({
      "stack-up": "Best 3",
    });
  });
});
