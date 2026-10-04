// Wires the shell's services together at startup (SDD §2).
import type { KeyValueBackend } from "@itg/game-sdk";
import { loadCatalog, seenKey, visibleGames, type CatalogGame } from "../catalog";
import { API_BASE, APP_VERSION, GRACE_DAYS } from "../config";
import { getPlatform } from "../platform";
import { Analytics } from "./analytics";
import type { AppIdentity } from "./api";
import { EntitlementService } from "./entitlement";
import { Outbox } from "./outbox";
import { capacitorBackend, getInstallId, loadSettings, type Settings } from "./prefs";
import { createAdapter } from "./purchases";

export interface AppServices {
  kv: KeyValueBackend;
  games: CatalogGame[];
  seen: Set<string>;
  settings: Settings;
  identity: AppIdentity;
  entitlement: EntitlementService;
  outbox: Outbox;
  analytics: Analytics;
}

export async function bootstrap(kv: KeyValueBackend = capacitorBackend): Promise<AppServices> {
  const games = visibleGames(loadCatalog(), import.meta.env.PROD);
  const [settings, installId, seenFlags] = await Promise.all([
    loadSettings(kv),
    getInstallId(kv),
    Promise.all(games.map((g) => kv.get(seenKey(g.slug)))),
  ]);
  const seen = new Set(games.filter((_, i) => seenFlags[i] !== null).map((g) => g.slug));
  const identity: AppIdentity = { installId, appVersion: APP_VERSION, platform: getPlatform() };
  const now = () => Date.now();
  const doFetch = (input: string, init?: RequestInit) => fetch(input, init);

  const analytics = new Analytics({
    fetch: doFetch,
    now,
    apiBase: API_BASE,
    identity,
    enabled: settings.analytics,
  });
  const entitlement = new EntitlementService({
    adapter: createAdapter(kv),
    kv,
    now,
    graceDays: GRACE_DAYS,
  });
  const outbox = new Outbox({
    kv,
    fetch: doFetch,
    now,
    apiBase: API_BASE,
    identity,
    onSent: () => analytics.track("submission_sent"),
  });
  await Promise.all([entitlement.load(), outbox.load()]);
  return { kv, games, seen, settings, identity, entitlement, outbox, analytics };
}
