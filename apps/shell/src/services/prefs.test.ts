import { memoryBackend } from "@itg/game-sdk";
import { describe, expect, it } from "vitest";
import {
  capacitorBackend,
  DEFAULT_SETTINGS,
  getInstallId,
  loadSettings,
  saveSettings,
} from "./prefs";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("install ID (ADR-0006)", () => {
  it("creates a UUIDv4 once and reuses it", async () => {
    const kv = memoryBackend();
    const a = await getInstallId(kv);
    const b = await getInstallId(kv);
    expect(a).toMatch(UUID_V4);
    expect(b).toBe(a);
  });

  it("replaces a corrupted stored value", async () => {
    const kv = memoryBackend({ "app:installId": "not-a-uuid" });
    expect(await getInstallId(kv)).toMatch(UUID_V4);
  });
});

describe("settings (FR-APP-6)", () => {
  it("defaults, then round-trips through storage", async () => {
    const kv = memoryBackend();
    expect(await loadSettings(kv)).toEqual(DEFAULT_SETTINGS);
    await saveSettings(kv, { sound: false, music: true, haptics: false, analytics: false });
    expect(await loadSettings(kv)).toEqual({
      sound: false,
      music: true,
      haptics: false,
      analytics: false,
    });
  });

  it("ignores malformed stored values", async () => {
    const kv = memoryBackend({ "app:settings": '{"sound":"no","music":false}' });
    expect(await loadSettings(kv)).toEqual({ ...DEFAULT_SETTINGS, music: false });
    const broken = memoryBackend({ "app:settings": "{oops" });
    expect(await loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("Capacitor Preferences backend", () => {
  it("implements KeyValueBackend over localStorage in the browser", async () => {
    await capacitorBackend.set("k", "v");
    expect(await capacitorBackend.get("k")).toBe("v");
    await capacitorBackend.remove("k");
    expect(await capacitorBackend.get("k")).toBeNull();
  });
});
