/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_CONSENT_NOTICE_VERSION?: string;
}
