# volvelles web app

A zero-build, dependency-light web app for the codex32 volvelles. It renders
the four instruments as a clean 2D SVG (and, on the Explore tab, as interactive
3D discs) and pairs them with the paper worksheets, backed by the same field
arithmetic the physical wheels encode.

## Run

```
python3 -m http.server 8137
# http://localhost:8137
```

Any static server works. Everything the page needs is local (data module,
vendored three.js, subset fonts), so once served it makes no network requests.
There are no runtime dependencies and no build step. Browsers block ES modules
loaded straight from `file://`, so use a server.

## Tabs

- **Bench** — the 2D wheel beside the checksum ladder. Turn the wheel by drag
  or arrow keys; click a cell and the readout proposes the wheel move, then
  take the reading into the cell. Verify mode checks every cell; Generate mode
  solves the pink checksum.
- **Explore** — spin the addition, fusion, translation and recovery wheels in
  3D. The lower disc turns under a fixed top disc: drag to spin, right-drag to
  orbit, scroll to zoom. **Top view** snaps to a straight-down orthographic
  view with north up; **3D view** returns to the perspective orbit.
- **Learn** — eight explainers with a wheel-driven exercise each, plus a live
  GF(32) calculator.
- **Checksum** — generate or verify a share, with a step-by-step trace of the
  polynomial division. Each cell is one XOR; the trace links back to the wheel.
- **Dice** — the de-biasing worksheet: two throws per die give one unbiased bit,
  five dice give one codex32 character.
- **Split** — create a secret and its Shamir shares, or derive more shares from
  an existing S share.
- **Recover** — rebuild the secret from any threshold-many shares.
- **Inspector** — parse a share, check its checksum, and get candidate
  corrections for a mistyped character (offered, never applied silently).

## Layout

```
index.html          markup and the section list
css/app.css         the whole theme
js/main.js          tab routing and the shared context
js/gf32.js          GF(32) arithmetic
js/codex32.js       checksum engine, encoding, Shamir interpolation
js/errors.js        syndrome and single/double substitution correction
js/data.js          generated wheel data (do not edit)
js/bench.js         the 2D wheel + checksum-ladder bench
js/lessons.js       the explainers and their computed exercise answers
js/explore.js       the 3D tab
js/volvelle/face.js canvas + item model, ported from generator/wheels.py
js/volvelle/svgface.js  the same item model as SVG for the bench
js/volvelle/wheel3d.js  three.js discs and interaction
js/worksheets/ladder.js       the ladder model (layout, fill, solve, diagnose)
js/worksheets/ladder-grid.js  the ladder as a DOM grid
js/worksheets/      the other worksheet modules
vendor/three/       vendored three.js (MIT)
fonts/              subset DejaVu glyph fonts
test/run.js         reference-vector tests for the math
```

## Theme

Greyscale e-ink, following the system light/dark setting
(`prefers-color-scheme`) across the UI, the SVG wheels and the 3D scene. No
gradients. The Explore tab's colour wheel tints the whole app (paper and canvas
alike) and is remembered; the default is a subtle warm.

## Regenerate and test

```
python3 ../generator/webdata.py     # refresh js/data.js
python3 ../generator/webfonts.py    # refresh fonts/ (needs fonttools, brotli)
node test/run.js                    # verify the math
```

## Notes

This is an educational companion, not a wallet. It never touches the network
and nothing leaves the page. Do not use it to protect real funds.
