import { createScopedStorage, memoryBackend } from "@itg/game-sdk";
import { describe, expect, it } from "vitest";
import { EntitlementService } from "./entitlement";
import { DAY_MS, type StoreInfo } from "./entitlementMachine";
import { DevAdapter, type Offer, type PurchaseAdapter, type PurchaseOutcome } from "./purchases";

const T0 = Date.UTC(2026, 9, 4);
const offer: Offer = { id: "monthly", title: "Monthly", priceString: "$2.99", period: "monthly" };
const premium = { tier: "premium" as const };

class FakeAdapter implements PurchaseAdapter {
  readonly name = "dev" as const;
  online = true;
  info: StoreInfo = { active: false, expiresAt: null };
  nextPurchase: PurchaseOutcome = { kind: "success", info: { active: true, expiresAt: null } };
  async getCustomerInfo() {
    if (!this.online) throw new Error("offline");
    return this.info;
  }
  async getOfferings() {
    return [offer];
  }
  async purchase() {
    if (this.nextPurchase.kind === "success") this.info = this.nextPurchase.info;
    return this.nextPurchase;
  }
  async restore() {
    if (!this.online) throw new Error("offline");
    return this.info;
  }
}

function setup() {
  const clock = { now: T0 };
  const adapter = new FakeAdapter();
  const kv = memoryBackend();
  const make = () => new EntitlementService({ adapter, kv, now: () => clock.now, graceDays: 7 });
  return { clock, adapter, kv, make, svc: make() };
}

describe("EntitlementService", () => {
  it("starts unknown with premium locked, then refreshes from the store", async () => {
    const { svc, adapter } = setup();
    await svc.load();
    expect(svc.snapshot.state).toBe("unknown");
    expect(svc.isUnlocked(premium)).toBe(false);
    adapter.info = { active: true, expiresAt: T0 + 30 * DAY_MS };
    await svc.refresh();
    expect(svc.snapshot.state).toBe("entitled");
    expect(svc.isUnlocked(premium)).toBe(true);
  });

  it("persists the cache and honors it offline after restart (FR-ENT-5)", async () => {
    const { adapter, clock, make } = setup();
    adapter.info = { active: true, expiresAt: T0 + DAY_MS };
    const first = make();
    await first.load();
    await first.refresh();

    adapter.online = false;
    clock.now = T0 + 5 * DAY_MS;
    const second = make();
    await second.load();
    await second.refresh();
    expect(second.snapshot.state).toBe("entitled_cached");
    expect(second.isUnlocked(premium)).toBe(true);

    clock.now = T0 + 8 * DAY_MS + 1; // expiry (1 day) + 7-day grace passed
    second.tick();
    expect(second.snapshot.state).toBe("free");
    expect(second.isUnlocked(premium)).toBe(false);
  });

  it("purchase success unlocks immediately; cancel and pending change nothing", async () => {
    const { svc, adapter } = setup();
    await svc.load();
    await svc.refresh();
    adapter.nextPurchase = { kind: "cancelled" };
    expect((await svc.purchase(offer)).kind).toBe("cancelled");
    expect(svc.snapshot.state).toBe("free");

    adapter.nextPurchase = { kind: "pending" };
    expect((await svc.purchase(offer)).kind).toBe("pending");
    expect(svc.snapshot.state).toBe("free");
    // Ask to Buy approved later: the next foreground refresh unlocks.
    adapter.info = { active: true, expiresAt: null };
    await svc.refresh();
    expect(svc.snapshot.state).toBe("entitled");
  });

  it("purchase success path", async () => {
    const { svc } = setup();
    await svc.load();
    await svc.refresh();
    expect((await svc.purchase(offer)).kind).toBe("success");
    expect(svc.snapshot.state).toBe("entitled");
  });

  it("adapter errors surface as messages without state change", async () => {
    const { svc, adapter } = setup();
    await svc.load();
    await svc.refresh();
    adapter.purchase = async () => {
      throw new Error("store down");
    };
    expect(await svc.purchase(offer)).toEqual({ kind: "error", message: "store down" });
    adapter.online = false;
    expect((await svc.restore()).kind).toBe("error");
    expect(svc.snapshot.state).toBe("free");
  });

  it("restore applies an active entitlement or reports none (FR-ENT-4)", async () => {
    const { svc, adapter } = setup();
    await svc.load();
    expect(await svc.restore()).toEqual({ kind: "none" });
    adapter.info = { active: true, expiresAt: null };
    expect(await svc.restore()).toEqual({ kind: "restored" });
    expect(svc.snapshot.state).toBe("entitled");
  });

  it("lapse relocks premium games but keeps their progress (RULE-5, FR-ENT-6)", async () => {
    const { svc, adapter, kv } = setup();
    adapter.info = { active: true, expiresAt: T0 + DAY_MS };
    await svc.load();
    await svc.refresh();
    const storage = createScopedStorage("park-out", kv);
    await storage.set("level", 12);

    adapter.info = { active: false, expiresAt: null };
    await svc.refresh();
    expect(svc.isUnlocked(premium)).toBe(false);
    expect(await storage.get("level")).toBe(12);

    adapter.info = { active: true, expiresAt: null };
    await svc.refresh();
    expect(svc.isUnlocked(premium)).toBe(true);
    expect(await storage.get("level")).toBe(12);
  });

  it("concurrent refreshes share one store request and notify subscribers", async () => {
    const { svc, adapter } = setup();
    let calls = 0;
    const real = adapter.getCustomerInfo.bind(adapter);
    adapter.getCustomerInfo = () => {
      calls++;
      return real();
    };
    let notified = 0;
    svc.subscribe(() => notified++);
    await Promise.all([svc.refresh(), svc.refresh()]);
    expect(calls).toBe(1);
    expect(notified).toBeGreaterThan(0);
  });
});

describe("DevAdapter", () => {
  it("offers sandbox D1 prices and toggles a local flag on purchase", async () => {
    const kv = memoryBackend();
    const dev = new DevAdapter(kv);
    const offers = await dev.getOfferings();
    expect(offers.map((o) => [o.priceString, o.period, o.sandbox])).toEqual([
      ["$2.99", "monthly", true],
      ["$19.99", "lifetime", true],
    ]);
    expect((await dev.getCustomerInfo()).active).toBe(false);
    const first = offers[0];
    if (!first) throw new Error("no offers");
    expect((await dev.purchase(first)).kind).toBe("success");
    expect(await dev.restore()).toEqual({ active: true, expiresAt: null });
  });
});
