import { memoryBackend } from "@itg/game-sdk";
import { describe, expect, it } from "vitest";
import { createAdapter } from "./purchases";

describe("createAdapter", () => {
  it("uses RevenueCat on native release builds", () => {
    expect(createAdapter(memoryBackend(), { native: true, allowDev: false }).name).toBe(
      "revenuecat",
    );
  });
  it("uses the sandbox adapter on native only when dev purchases are allowed", () => {
    expect(createAdapter(memoryBackend(), { native: true, allowDev: true }).name).toBe("dev");
  });
  it("uses the sandbox adapter in the browser", () => {
    expect(createAdapter(memoryBackend(), { native: false, allowDev: false }).name).toBe("dev");
  });
});
