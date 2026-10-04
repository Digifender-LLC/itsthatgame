import { describe, expect, it } from "vitest";
import { findDenied, packageNamesFromLockfile } from "./check_deps.mjs";

describe("check_deps", () => {
  it("flags denylisted packages", () => {
    expect(findDenied(["@capacitor-community/admob", "preact", "react-native-appsflyer"])).toEqual([
      "@capacitor-community/admob",
      "react-native-appsflyer",
    ]);
  });
  it("allows ordinary packages", () => {
    expect(findDenied(["zod", "vite", "@capacitor/core"])).toEqual([]);
  });
  it("parses package names from a lockfile", () => {
    const lock =
      "packages:\n\n  '@scope/a@1.0.0':\n    resolution: {}\n\n  b@2.0.0:\n    resolution: {}\n";
    expect(packageNamesFromLockfile(lock)).toEqual(["@scope/a", "b"]);
  });
});
