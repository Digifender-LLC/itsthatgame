import { useEffect, useState } from "preact/hooks";
import { Screen } from "../components/Screen";
import { PRIVACY_URL, TERMS_URL } from "../config";
import type { Analytics } from "../services/analytics";
import type { EntitlementService } from "../services/entitlement";
import type { Offer } from "../services/purchases";

export interface PaywallProps {
  entitlement: EntitlementService;
  analytics: Analytics;
  onClose(): void;
}

const PERIOD: Record<Offer["period"], string> = {
  monthly: "per month",
  lifetime: "one-time, forever",
  other: "",
};

/**
 * WF-3. Shown only from a locked game tap or Settings (RULE-3, FR-ENT-2). Prices come
 * from the store via the adapter (FR-ENT-3).
 */
export function Paywall({ entitlement, analytics, onClose }: PaywallProps) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    analytics.track("paywall_view");
    entitlement
      .getOfferings()
      .then(setOffers)
      .catch(() => {
        setOffers([]);
        setMessage("The store isn't reachable right now. Please try again later.");
      });
  }, []);

  const buy = async (offer: Offer) => {
    setBusy(true);
    setMessage(null);
    const result = await entitlement.purchase(offer);
    setBusy(false);
    if (result.kind === "success") {
      analytics.track("purchase_success");
      onClose();
    } else if (result.kind === "cancelled") {
      analytics.track("purchase_cancel");
      onClose();
    } else if (result.kind === "pending") {
      setMessage("Purchase pending. Games unlock as soon as the store confirms it.");
    } else {
      setMessage(result.message);
    }
  };

  const restore = async () => {
    setBusy(true);
    setMessage(null);
    const result = await entitlement.restore();
    setBusy(false);
    if (result.kind === "restored") {
      analytics.track("restore_success");
      onClose();
    } else if (result.kind === "none") {
      setMessage("No purchases found for this store account.");
    } else {
      setMessage(result.message);
    }
  };

  return (
    <Screen title="Unlock all games" onBack={onClose} backLabel="Close">
      <p>
        One purchase unlocks every game in the library, including new ones as they arrive. No ads,
        ever.
      </p>
      {offers === null && <p role="status">Loading prices…</p>}
      <ul class="offers">
        {offers?.map((offer) => (
          <li key={offer.id}>
            <button
              type="button"
              class="btn primary offer"
              disabled={busy}
              onClick={() => void buy(offer)}
            >
              <span class="offer-title">{offer.title}</span>
              <span class="offer-price">
                {offer.priceString} {PERIOD[offer.period]}
              </span>
              {offer.sandbox && <span class="offer-note">Sandbox: no real charge</span>}
            </button>
          </li>
        ))}
      </ul>
      {message && (
        <p class="notice" role="status">
          {message}
        </p>
      )}
      <button type="button" class="btn" disabled={busy} onClick={() => void restore()}>
        Restore purchases
      </button>
      <p class="fine">
        Subscriptions renew automatically until cancelled in your store account settings.{" "}
        <a href={TERMS_URL} target="_blank" rel="noopener">
          Terms of use
        </a>{" "}
        ·{" "}
        <a href={PRIVACY_URL} target="_blank" rel="noopener">
          Privacy policy
        </a>
      </p>
    </Screen>
  );
}
