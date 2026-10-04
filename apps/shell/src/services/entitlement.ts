// Entitlement service (SDD §4): the app's single source of isUnlocked(game). Wraps a
// PurchaseAdapter, persists the cache, and drives the pure state machine.
import type { KeyValueBackend } from "@itg/game-sdk";
import {
  INITIAL,
  isUnlocked,
  transition,
  type EntitlementCache,
  type EntitlementEvent,
  type EntitlementSnapshot,
} from "./entitlementMachine";
import { getJson, setJson } from "./prefs";
import type { Offer, PurchaseAdapter, PurchaseOutcome } from "./purchases";

const CACHE_KEY = "ent:cache";

export type RestoreOutcome =
  { kind: "restored" } | { kind: "none" } | { kind: "error"; message: string };

export interface EntitlementDeps {
  adapter: PurchaseAdapter;
  kv: KeyValueBackend;
  now: () => number;
  graceDays: number;
}

export class EntitlementService {
  private snap: EntitlementSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private refreshing: Promise<void> | null = null;

  constructor(private deps: EntitlementDeps) {}

  get snapshot(): EntitlementSnapshot {
    return this.snap;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  isUnlocked(game: { tier: "free" | "premium" }): boolean {
    return isUnlocked(game.tier, this.snap.state);
  }

  /** Re-checks offline grace against the clock (call on foreground and periodically). */
  tick(): void {
    this.apply({ type: "tick" });
  }

  /** Loads the cached answer (state stays `unknown` until the first refresh). */
  async load(): Promise<void> {
    const cache = await getJson<EntitlementCache>(this.deps.kv, CACHE_KEY);
    this.snap = { state: "unknown", cache: cache ?? null };
  }

  /** Runs on app start and foreground (SDD §4). Concurrent calls share one request. */
  refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      try {
        const info = await this.deps.adapter.getCustomerInfo();
        await this.applyAndPersist({ type: "store_ok", info });
      } catch {
        this.apply({ type: "refresh_failed" });
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  getOfferings(): Promise<Offer[]> {
    return this.deps.adapter.getOfferings();
  }

  async purchase(offer: Offer): Promise<PurchaseOutcome> {
    let outcome: PurchaseOutcome;
    try {
      outcome = await this.deps.adapter.purchase(offer);
    } catch (e) {
      return { kind: "error", message: (e as Error).message || "Purchase failed." };
    }
    if (outcome.kind === "success") {
      await this.applyAndPersist({ type: "store_ok", info: outcome.info });
    }
    return outcome;
  }

  async restore(): Promise<RestoreOutcome> {
    try {
      const info = await this.deps.adapter.restore();
      await this.applyAndPersist({ type: "store_ok", info });
      return info.active ? { kind: "restored" } : { kind: "none" };
    } catch (e) {
      return { kind: "error", message: (e as Error).message || "Restore failed." };
    }
  }

  private apply(event: EntitlementEvent): void {
    const next = transition(this.snap, event, this.deps.now(), this.deps.graceDays);
    if (next === this.snap) return;
    const changed = next.state !== this.snap.state;
    this.snap = next;
    if (changed) for (const cb of this.listeners) cb();
  }

  private async applyAndPersist(event: EntitlementEvent): Promise<void> {
    this.apply(event);
    if (this.snap.cache) await setJson(this.deps.kv, CACHE_KEY, this.snap.cache);
    for (const cb of this.listeners) cb();
  }
}
