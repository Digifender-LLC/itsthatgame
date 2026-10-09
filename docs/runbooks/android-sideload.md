# Runbook: install an Android test build (sideload)

**Needs:** an Android phone (Android 8.0 / API 26 or later) and access to the GitHub
repository. No Play Console account.
**Unblocks:** owner play-testing, the Android half of the M2-T5 device checklist, per-game
device QA rows.

## 1. Get the APK

- **Latest main build:** the repository's Releases page → prerelease **android-debug** →
  download `itsthatgame-debug-<run>.apk`. It is rebuilt on every push to `main`
  (`.github/workflows/ci.yml`, job `android`).
- **A pull request build:** open the PR → Checks → **CI** → the run's summary page →
  Artifacts → `itsthatgame-debug-apk-<run>`. GitHub delivers it as a zip; unzip it to get
  the `.apk`.

## 2. Install

1. Open the downloaded `.apk` on the phone (Files or Downloads app).
2. When Android asks, allow your browser or Files app to "install unknown apps" for this
   source, then tap **Install**.
3. If Android says **App not installed** or reports a signature conflict, uninstall the
   previous ItsThatGame build and install again. Builds from main share a cached debug key,
   but PR builds and builds after a cache expiry (7 days without a build) use a new one.

## 3. What is different in a debug build

- It is signed with a debug key and is not for store release.
- Premium games are locked as in a release build, but the paywall uses the no-charge
  sandbox unlock (`VITE_ALLOW_DEV_PURCHASES=1`, Roadmap D16): choosing a plan unlocks
  everything without a store. Release builds never enable this.
- The API base URL is the local default, so game requests queue offline (M5) until a
  deployed API exists (P1). Games themselves never use the network.

## 4. Report what you find

Use the per-game `QA.md` device rows and the checklist in
[mobile-builds.md](mobile-builds.md) §2 (Android items).
