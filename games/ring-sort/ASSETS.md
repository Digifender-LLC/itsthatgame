# Assets: Ring Sort

All visuals are drawn procedurally in code (Canvas 2D paths, fills and system-font text). All sounds are synthesized by the shell and requested through `ctx.audio.play`. There are no image, audio, font or other asset files, and no third-party assets or code are included in this package.

| Asset                               | Source                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Graphics, icons, glyphs and symbols | Drawn in `src/index.ts` (rings, pegs, locks, stars, arrows) and by the SDK shell (HUD icons)                                                                                |
| Colors                              | `PALETTE` / `PIECE_COLORS` from `@itg/game-sdk` (Okabe-Ito colorblind-safe) plus a few wood, steel and gold neutrals defined in `src/index.ts` |
| Fonts                               | System UI font stack, none bundled                                                                                        |
| Sound effects                       | Synthesized by the app shell                                                                                              |
| Level data                          | Generated offline by `tools/generate-levels.ts` into `src/level-data.ts` (text data, no files)                                                                               |
