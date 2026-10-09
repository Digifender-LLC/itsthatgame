// Thin wrappers over Capacitor plugins so services stay testable and the web build works.
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Network } from "@capacitor/network";
import type { Platform } from "@itg/contracts";

export function getPlatform(): Platform {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android" ? p : "web";
}

/**
 * Foreground/background changes from Capacitor App state (native) and the document's
 * visibility (both platforms). Callers must tolerate duplicate notifications.
 */
export function onAppActive(cb: (active: boolean) => void): () => void {
  const onVisibility = () => cb(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", onVisibility);
  let remove: (() => void) | null = null;
  let disposed = false;
  if (Capacitor.isNativePlatform()) {
    void App.addListener("appStateChange", (s) => cb(s.isActive)).then((h) => {
      if (disposed) void h.remove();
      else remove = () => void h.remove();
    });
  }
  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    remove?.();
  };
}

/** Fires when connectivity returns: Capacitor Network natively, `online` in the browser. */
export function onNetworkOnline(cb: () => void): () => void {
  if (Capacitor.isNativePlatform()) {
    let remove: (() => void) | null = null;
    let disposed = false;
    void Network.addListener("networkStatusChange", (s) => {
      if (s.connected) cb();
    })
      .then((h) => {
        if (disposed) void h.remove();
        else remove = () => void h.remove();
      })
      .catch(() => {
        window.addEventListener("online", cb);
        remove = () => window.removeEventListener("online", cb);
      });
    return () => {
      disposed = true;
      remove?.();
    };
  }
  window.addEventListener("online", cb);
  return () => window.removeEventListener("online", cb);
}

const STYLES = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };

/** Native haptic impact; a no-op on the web. */
export function hapticImpact(style: "light" | "medium" | "heavy"): void {
  if (!Capacitor.isNativePlatform()) return;
  void Haptics.impact({ style: STYLES[style] }).catch(() => undefined);
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Android hardware/gesture back (native only). While a listener is registered Capacitor
 * stops its default handling, so the callback decides what back means.
 */
export function onBackButton(cb: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let remove: (() => void) | null = null;
  let disposed = false;
  void App.addListener("backButton", () => cb()).then((h) => {
    if (disposed) void h.remove();
    else remove = () => void h.remove();
  });
  return () => {
    disposed = true;
    remove?.();
  };
}

/** Leave the app (Android back on the library screen). */
export function exitApp(): void {
  if (Capacitor.isNativePlatform()) void App.exitApp().catch(() => undefined);
}
