// Preferences store (SDD §2): on-device key-value storage over Capacitor Preferences
// (UserDefaults / SharedPreferences natively, localStorage in the browser). DATA-4: all of
// it stays on the device and is removed on uninstall.
import { Preferences } from "@capacitor/preferences";
import type { KeyValueBackend } from "@itg/game-sdk";

export const capacitorBackend: KeyValueBackend = {
  async get(key) {
    return (await Preferences.get({ key })).value;
  },
  async set(key, value) {
    await Preferences.set({ key, value });
  },
  async remove(key) {
    await Preferences.remove({ key });
  },
};

export async function getJson<T>(kv: KeyValueBackend, key: string): Promise<T | undefined> {
  const raw = await kv.get(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function setJson(kv: KeyValueBackend, key: string, value: unknown): Promise<void> {
  await kv.set(key, JSON.stringify(value));
}

// ---- Install ID (ADR-0006) ------------------------------------------------------

const INSTALL_ID_KEY = "app:installId";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Random UUIDv4 created once per install; never derived from device identifiers. */
export async function getInstallId(
  kv: KeyValueBackend,
  newId: () => string = () => crypto.randomUUID(),
): Promise<string> {
  const existing = await kv.get(INSTALL_ID_KEY);
  if (existing && UUID_V4.test(existing)) return existing;
  const id = newId();
  await kv.set(INSTALL_ID_KEY, id);
  return id;
}

// ---- Settings (FR-APP-6, FR-AN-2) -----------------------------------------------

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  analytics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  haptics: true,
  analytics: true,
};
const SETTINGS_KEY = "app:settings";

export async function loadSettings(kv: KeyValueBackend): Promise<Settings> {
  const stored = await getJson<Partial<Settings>>(kv, SETTINGS_KEY);
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (typeof stored?.[k] === "boolean") out[k] = stored[k];
  }
  return out;
}

export async function saveSettings(kv: KeyValueBackend, settings: Settings): Promise<void> {
  await setJson(kv, SETTINGS_KEY, settings);
}
