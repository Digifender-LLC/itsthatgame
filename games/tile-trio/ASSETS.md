# Assets: Tile Trio

All visuals are drawn procedurally in code (Canvas 2D paths, fills and system-font text). All sounds are synthesized by the shell and requested through `ctx.audio.play`. There are no image, audio, font or other asset files, and no third-party assets or code are included in this package.

| Asset | Source |
|---|---|
| Graphics, icons, glyphs and symbols | Drawn in `src/symbols.ts` (symbols) and `src/index.ts` (tiles, tray, helper buttons) |
| Colors | `PALETTE` / `PIECE_COLORS` from `@itg/game-sdk` (Okabe-Ito colorblind-safe) not used; symbol colours and neutrals are defined in `src/symbols.ts` and `src/index.ts` |
| Fonts | System UI font stack, none bundled |
| Sound effects | Synthesized by the app shell (names requested via `env.audio`) |
| Level data | Seeded plans (one explicit row per level, 50 levels) in `src/levels.ts`, built deterministically |
