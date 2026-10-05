/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_RC_IOS_KEY?: string;
  readonly VITE_RC_ANDROID_KEY?: string;
  readonly VITE_PRIVACY_URL?: string;
  readonly VITE_TERMS_URL?: string;
  readonly VITE_SUPPORT_URL?: string;
  readonly VITE_ALLOW_DEV_PURCHASES?: string;
}
