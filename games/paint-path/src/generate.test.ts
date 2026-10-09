// Level data checks. The generator is deterministic, so the committed levelData.ts must equal
// its output. To regenerate after changing generator.ts:
//   PAINT_PATH_GEN=1 pnpm --filter @itg/game-paint-path exec vitest run src/generate.test.ts
import { describe, expect, it } from "vitest";
import { SPECS, generateLevel, renderLevelData } from "./generator";
import { LEVEL_DATA } from "./levelData";

interface Proc {
  env: Record<string, string | undefined>;
  cwd(): string;
}
const proc = (globalThis as unknown as { process: Proc }).process;

describe("paint-path level generation", () => {
  const levels = SPECS.map((_, i) => generateLevel(i));

  it("has 60 specs", () => {
    expect(levels).toHaveLength(60);
  });

  it("committed levelData.ts matches the deterministic generator", async () => {
    const text = renderLevelData(levels);
    if (proc.env.PAINT_PATH_GEN) {
      const fs = await import(/* @vite-ignore */ "node:" + "fs");
      fs.writeFileSync(proc.cwd() + "/src/levelData.ts", text);
    }
    expect(LEVEL_DATA.map((d) => d.solution)).toEqual(levels.map((l) => l.solution));
  });
});
