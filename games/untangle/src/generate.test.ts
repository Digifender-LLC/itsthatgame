import { describe, expect, it } from "vitest";
import { generateAll } from "./generate";
import { LEVEL_DATA } from "./levelData";

// The committed src/levelData.ts must be exactly what the generator produces. After changing
// the generator, rewrite the file (see the header of generate.ts) and run prettier on it.
describe("level generator", () => {
  it("reproduces the committed level data", () => {
    expect(generateAll()).toEqual(LEVEL_DATA);
  });
});
