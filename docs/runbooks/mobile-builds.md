# Runbook: native builds, device checks, and store testing

**Needs:** P4 (a Mac with Xcode, or a macOS CI runner) for iOS; Android Studio or the
Android SDK for Android; P2 for TestFlight / Play distribution.
**Unblocks:** M2-T5 device checklist, M6 release.

## 1. Generate native projects (not committed; see `.gitignore`)

```sh
pnpm install
pnpm --filter @itg/shell build
cd apps/shell
pnpm exec cap add ios
pnpm exec cap add android
pnpm exec cap sync
```

Set the RevenueCat keys and API base before `build` (see `apps/shell/.env.example`).
Lock orientation to portrait in Xcode (General › Deployment Info) and in
`android/app/src/main/AndroidManifest.xml` (`android:screenOrientation="portrait"`).
Minimum versions (`NFR-5`): iOS 16.0 deployment target; Android `minSdkVersion 26`.

## 2. Device checklist (M2-T5; repeat for every release)

Run on: oldest supported iOS simulator, a physical iPhone if available, the oldest
supported Android emulator, and one physical mid-range Android phone (TDD §2).

- [ ] Install, open; library shows 8 games, 5 locked.
- [ ] Airplane mode from install: all 3 free games fully playable (`FR-APP-3`).
- [ ] Progress survives force-quit and relaunch (`FR-APP-4`).
- [ ] Background mid-game → game paused; foreground → resumes (`FR-APP-2`).
- [ ] Cold start to interactive library ≤ 3 s on the mid-range Android (`NFR-1`);
      record the time.
- [ ] Frame rate during play ≥ 30 fps sustained, target 60 (`NFR-2`); record with
      Android GPU profiling / Xcode Instruments.
- [ ] System font size at largest: shell text scales, nothing clipped (`NFR-4`).
- [ ] VoiceOver / TalkBack read library and settings controls (`NFR-4`).
- [ ] Haptics and sound toggles take effect immediately.

Attach the completed checklist and measurements to the PR that marks M2 `Done`. If
`NFR-1`/`NFR-2` miss badly, follow [TDD §11](../design/TDD.md#11-conditions-to-revisit).

## 3. Store testing and release (M6)

1. iOS: Product › Archive in Xcode → upload → TestFlight internal testing.
2. Android: `./gradlew bundleRelease` with the upload key → Play Console internal testing.
3. Complete [the release checklist](../release-checklist.md).
4. Submit; use phased release (iOS) and staged rollout (Android).
