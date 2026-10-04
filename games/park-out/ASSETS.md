# Park Out assets

All visuals are drawn procedurally at runtime with Canvas 2D (rounded rectangles, text and
the shared colorblind-safe palette from `@itg/game-sdk`). Sounds are synthesized by the app
shell through `ctx.audio.play`. There are no image, font, or audio files in this package
and no third-party assets.

| Asset | Source | License |
|---|---|---|
| All visuals | Drawn in code (`src/index.ts`) | Project's own |
| All sounds | Synthesized by the shell (`ctx.audio`) | Project's own |
| Fonts | System UI font stack | n/a (not bundled) |
