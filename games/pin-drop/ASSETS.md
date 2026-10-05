# Assets: Pin Drop

All visuals are drawn procedurally in code (Canvas 2D paths, fills and system-font text). All sounds are synthesized by the shell (kit) and requested through `ctx.audio.play`. There are no image, audio, font or other asset files, and no third-party assets or code are included in this package.

| Asset | Source |
|---|---|
| Graphics, icons, glyphs and symbols | Drawn in `src/index.ts` |
| Colors | `PALETTE` / `PIECE_COLORS` from `@itg/game-sdk` (Okabe-Ito colorblind-safe) plus a few neutrals defined in `src/index.ts` |
| Fonts | System UI font stack, none bundled |
| Sound effects | Synthesized by the app shell |
| Level data | Committed in `src/levelData.ts`, generated offline by the seeded `src/generator.ts` |
