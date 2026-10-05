// Store adapters behind the entitlement service (IF-4, ADR-0005). The app checks the
// `full_library` entitlement only, never product IDs, so products can change remotely.
import { Capacitor } from "@capacitor/core";
import type { KeyValueBackend } from "@itg/game-sdk";
import { ALLOW_DEV_PURCHASES, ENTITLEMENT_ID, RC_ANDROID_KEY, RC_IOS_KEY } from "../config";
import type { StoreInfo } from "./entitlementMachine";

export interface Offer {
  id: string;
  title: string;
  /** Store-localized price string, e.g. "$2.99". */
  priceString: string;
  period: "monthly" | "lifetime" | "other";
  /** True for the browser DevAdapter: not a real store price. */
  sandbox?: boolean;
}

export type PurchaseOutcome =
  | { kind: "success"; info: StoreInfo }
  | { kind: "cancelled" }
  | { kind: "pending" }
  | { kind: "error"; message: string };

export interface PurchaseAdapter {
  readonly name: "revenuecat" | "dev";
  getCustomerInfo(): Promise<StoreInfo>;
  getOfferings(): Promise<Offer[]>;
  purchase(offer: Offer): Promise<PurchaseOutcome>;
  restore(): Promise<StoreInfo>;
}

// ---- RevenueCat (native) ----------------------------------------------------------

type RC = typeof import("@revenuecat/purchases-capacitor");

interface RcEntitlement {
  isActive: boolean;
  expirationDate: string | null;
}

function toStoreInfo(info: { entitlements: { active: Record<string, RcEntitlement> } }): StoreInfo {
  const ent = info.entitlements.active[ENTITLEMENT_ID];
  if (!ent?.isActive) return { active: false, expiresAt: null };
  return { active: true, expiresAt: ent.expirationDate ? Date.parse(ent.expirationDate) : null };
}

export class RevenueCatAdapter implements PurchaseAdapter {
  readonly name = "revenuecat";
  private rc: Promise<RC> | null = null;
  private packages = new Map<string, unknown>();

  /** Lazily loads and configures the SDK with the platform key and an anonymous user. */
  private sdk(): Promise<RC> {
    this.rc ??= (async () => {
      const mod = await import("@revenuecat/purchases-capacitor");
      const apiKey = Capacitor.getPlatform() === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY;
      if (!apiKey) throw new Error("RevenueCat key is not configured");
      await mod.Purchases.configure({ apiKey }); // no appUserID → anonymous (ADR-0006)
      return mod;
    })();
    return this.rc;
  }

  async getCustomerInfo(): Promise<StoreInfo> {
    const { Purchases } = await this.sdk();
    return toStoreInfo((await Purchases.getCustomerInfo()).customerInfo);
  }

  async getOfferings(): Promise<Offer[]> {
    const { Purchases, PACKAGE_TYPE } = await this.sdk();
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings.current?.availablePackages ?? [];
    this.packages.clear();
    return pkgs.map((p) => {
      this.packages.set(p.identifier, p);
      const period =
        p.packageType === PACKAGE_TYPE.MONTHLY
          ? "monthly"
          : p.packageType === PACKAGE_TYPE.LIFETIME
            ? "lifetime"
            : "other";
      return {
        id: p.identifier,
        title: p.product.title,
        priceString: p.product.priceString,
        period,
      };
    });
  }

  async purchase(offer: Offer): Promise<PurchaseOutcome> {
    const { Purchases, PURCHASES_ERROR_CODE } = await this.sdk();
    const aPackage = this.packages.get(offer.id);
    if (!aPackage) return { kind: "error", message: "This option is no longer available." };
    try {
      const result = await Purchases.purchasePackage({
        aPackage: aPackage as Parameters<typeof Purchases.purchasePackage>[0]["aPackage"],
      });
      return { kind: "success", info: toStoreInfo(result.customerInfo) };
    } catch (e) {
      const err = e as { code?: string; userCancelled?: boolean | null; message?: string };
      if (err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || err.userCancelled) {
        return { kind: "cancelled" };
      }
      if (err.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { kind: "pending" };
      return { kind: "error", message: err.message || "The store couldn't complete the purchase." };
    }
  }

  async restore(): Promise<StoreInfo> {
    const { Purchases } = await this.sdk();
    return toStoreInfo((await Purchases.restorePurchases()).customerInfo);
  }
}

// ---- Dev (browser, no store) --------------------------------------------------------

const DEV_FLAG = "dev:entitled";

/** Browser stand-in: sandbox prices from Roadmap D1; purchase toggles a local flag. */
export class DevAdapter implements PurchaseAdapter {
  readonly name = "dev";
  constructor(private kv: KeyValueBackend) {}

  async getCustomerInfo(): Promise<StoreInfo> {
    return { active: (await this.kv.get(DEV_FLAG)) === "1", expiresAt: null };
  }

  async getOfferings(): Promise<Offer[]> {
    return [
      { id: "monthly", title: "Monthly", priceString: "$2.99", period: "monthly", sandbox: true },
      {
        id: "lifetime",
        title: "Lifetime",
        priceString: "$19.99",
        period: "lifetime",
        sandbox: true,
      },
    ];
  }

  async purchase(_offer: Offer): Promise<PurchaseOutcome> {
    await this.kv.set(DEV_FLAG, "1");
    return { kind: "success", info: { active: true, expiresAt: null } };
  }

  async restore(): Promise<StoreInfo> {
    return this.getCustomerInfo();
  }
}

/** RevenueCat on iOS/Android; the DevAdapter in a plain browser. */
/**
 * RevenueCat on native builds. The DevAdapter (a no-charge "sandbox" unlock) runs in the
 * browser, and on native only in builds made with VITE_ALLOW_DEV_PURCHASES=1, which the CI
 * debug APK sets so sideload testers can open premium games (Roadmap D16). Release builds
 * never set it, so they fail closed to RevenueCat.
 */
export function createAdapter(
  kv: KeyValueBackend,
  opts: { native?: boolean; allowDev?: boolean } = {},
): PurchaseAdapter {
  const native = opts.native ?? Capacitor.isNativePlatform();
  const allowDev = opts.allowDev ?? ALLOW_DEV_PURCHASES;
  return native && !allowDev ? new RevenueCatAdapter() : new DevAdapter(kv);
}
