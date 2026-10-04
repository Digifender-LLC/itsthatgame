const env = import.meta.env;

/** Build-time configuration (public values). */
export const config = {
  apiBase: (env.VITE_API_BASE || "http://localhost:8787").replace(/\/+$/, ""),
  // Cloudflare's documented always-pass test key.
  turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
  consentNoticeVersion: env.VITE_CONSENT_NOTICE_VERSION || "2026-10-04",
};
