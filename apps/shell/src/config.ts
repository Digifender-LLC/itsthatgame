// Build-time configuration. Values come from VITE_* env vars (see .env.example); nothing
// here is secret: RevenueCat public SDK keys are designed to ship in the app.
const env = import.meta.env;

export const APP_VERSION = "1.0.0";

/** API Worker base URL (IF-2, IF-3), without a trailing slash. */
export const API_BASE: string = (env.VITE_API_BASE || "http://127.0.0.1:8787").replace(/\/+$/, "");

export const RC_IOS_KEY: string = env.VITE_RC_IOS_KEY ?? "";
export const RC_ANDROID_KEY: string = env.VITE_RC_ANDROID_KEY ?? "";

/** Debug/sideload builds only: use the no-charge DevAdapter on native (Roadmap D16). */
export const ALLOW_DEV_PURCHASES: boolean = env.VITE_ALLOW_DEV_PURCHASES === "1";

/** The single RevenueCat entitlement every product grants (ADR-0005, SDD §4). */
export const ENTITLEMENT_ID = "full_library";

/** Offline grace beyond cached expiry (RULE-4, Roadmap D9). */
export const GRACE_DAYS = 7;

// [Assumption] Placeholder public pages until the M6 custom domain exists (Roadmap D5).
export const PRIVACY_URL: string = env.VITE_PRIVACY_URL || "https://itsthatgame.pages.dev/privacy";
export const TERMS_URL: string = env.VITE_TERMS_URL || "https://itsthatgame.pages.dev/terms";
export const SUPPORT_URL: string = env.VITE_SUPPORT_URL || "https://itsthatgame.pages.dev/support";
