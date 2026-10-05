import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.digifender.itsthatgame",
  appName: "ItsThatGame",
  webDir: "dist",
  // Brand night colour behind the WebView while it loads, matching the splash (D14).
  backgroundColor: "#1a1738",
  android: {
    // Games are offline and local; no mixed content or remote debugging in release builds.
    allowMixedContent: false,
  },
};

export default config;
