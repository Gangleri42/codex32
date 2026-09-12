# codex32 volvelles in PCB

The [codex32](https://secretcodex32.com) paper computers, rebuilt as printed
circuit boards: black solder mask, lettering in ENIG gold (copper glyphs with
matching mask openings). What the booklet does with scissors, X-Acto cuts and
folded discs, a board house does with routed windows and native double-sided
copper.

## Layout

- `generator/` — Python port of the wheel-drawing procedures, plus the fab
  and laser emitters. The boards need nothing but Python; the other two
  shell out to KiCad and Inkscape.
- `out/` — where the boards, previews and proof table land. Generated,
  ignored, never edited by hand.

Nothing is vendored. The arrays come out of the repo's own `SSS32.ps` and the
GF(32) cross-check reads `reference/rust-codex32/src/gf32.rs`, so the boards
track the source they claim to encode.

## Regenerate

Nothing under `out/` is tracked. Four commands rebuild all of it:

```
python3 volvelles/generator/generate.py    # boards and previews
python3 volvelles/generator/fabfiles.py    # gerber + drill zips (KiCad 7)
python3 volvelles/generator/laserfiles.py  # laser SVGs (Inkscape)
python3 volvelles/generator/printfiles.py  # 3D-print solids (OpenSCAD + Inkscape)
```

`generate.py` takes `--scale` and `--pivot-mm`; `--scale 0.8 --pivot-mm 3.2`
gives a smaller pair on an M3 pivot. At 1:1 the addition stator is Ø189.1mm
and the rotor Ø204.6mm across the grip ring. The two mount on one pivot
(binding screw or brass eyelet; a nylon washer between the faces).

The [latest release](https://github.com/Gangleri42/codex32/releases/latest)
carries the same package prebuilt, for boards without the toolchain.

## Verification

The wheels carry security-relevant data: one wrong glyph corrupts a seed
recovery. So nothing is retyped. The alphabet and permutations are parsed out
of the repo's `SSS32.ps`, the alphabet is cross-checked against the rust
reference implementation, all 1024 spiral glyphs are recomputed independently
after placement, and `out/addition-table.txt` is a plain-text dump of the
placed table, so a person can read back what the spiral actually carries.

The procedures were read from the 2023-03-07 black-and-white edition of
`SSS32.ps`; its `/code`, `/code2`, `/perm`, `/permV` and `/logbase` values are
the ones in the repo file, so the boards come out the same from either.

## Fab notes

2-layer FR4, black solder mask, ENIG finish. Suggested 1.6mm for the stator,
1.0mm for the rotor. Glyph strokes are sized for etching (min 0.16mm); mask
openings are drawn 0.1mm wider than the copper so registration error shows as
a dark fringe on substrate, never as mask over gold. Window cutouts carry
0.8mm corner radii for the router.

`generator/fabfiles.py` plots the seven layers a board house reads and the
Excellon drills, one zip per board. It refuses a package that came out short
of the full layer set.

## The set

Three instruments, seven boards, all on Ø4.2mm pivots:

- **Addition** (Ø189mm stator + Ø205mm rotor): the full 32x32 XOR table as a
  glyph spiral under a 32-window top wheel.
- **Fusion / Translation** (Ø141mm stator, double-sided, one Ø124mm rotor per
  face): circular slide rules over GF(32)*. The booklet folds one sheet into a
  two-sided disc; here fusion is the front copper, translation the back, and
  each rotor sets itself through its own tab window, so nothing is lost by the
  rotors being independent. Q↔Q on the translation tab marks the fixed point.
- **Recovery** (Ø141mm stator + rotor): share indices on the rim, Lagrange
  translation factors on the ring, "share to translate" at the window.

Stack order for fusion/translation: rotor, stator, rotor on one pivot, back
rotor flipped so its face looks outward.

Symbol texts (the code2 alphabet) use DejaVu Sans via KiCad's outline-font
support: the stroke font lacks ℵ and ♥ and draws ¶ like a π, none of which a
lookup wheel can afford. Letters and digits stay in the stroke font.

Back-face artwork is emitted mirrored about the sheet centerline with negated
text angles and `(justify mirror)`, verified against `kicad-cli --mirror`.

The center artwork of the color edition (sun, potion, dragon) is PHP-included
in the source and absent from this bw build, so plain centers are faithful.
The wheel-lock is likewise a PHP include and left out.

## Fiber laser

`generator/laserfiles.py` emits per-face SVGs for laser cutting and marking
(black = mark, red hairline = cut, blue = reference outline for second-side
setups), text pre-converted to paths via Inkscape. Defaults: ring wheels at
Ø60mm, addition pair at Ø110mm, M3 pivot; see --b-diameter,
--addition-diameter, --pivot-mm.

## 3D print

`generator/printfiles.py` turns the same primitives into OpenSCAD solids for a
Bambu-class printer, one body plus one inlay per coloured face:

```
python3 volvelles/generator/printfiles.py                       # addition pair, 1:1
python3 volvelles/generator/printfiles.py --parts family-b --b-mm 205
```

At 1:1 the addition stator is Ø189.1mm and the rotor Ø204.6mm. Family B scales
so its stator is Ø205mm, which puts every one of those parts at 203-207mm
across. Both fit the P1S plate (256mm) with room for a brim. Needs OpenSCAD on
PATH (apt, or an AppImage) and Inkscape, which converts the text to paths.

Each part lands in `out/3d/` as:

- `<part>-body.stl` the disc, pivot hole, window cutouts and recessed artwork
- `<part>-inlay.stl` the artwork, flush with the top face

The fusion/translation stator is printed on both faces, so it also gets a
`<part>-inlay-back.stl`; that face is mirrored to read correctly once the wheel
is flipped. Import the STLs without moving them and give the body and each
inlay different filaments (AMS). The inlays fill their recesses, so the colours
print flush in one solid. `--mode raised` lifts the inlay onto the top face
instead; `--mode engrave` leaves it out for a single-colour print.

The recess, line widths and font stems are sized for a 0.4mm nozzle. If the
slicer dislikes two objects sharing a wall, add a hair of clearance with
`--inlay-gap 0.1`.

Text goes through Inkscape before OpenSCAD sees it. The addition stator carries
1024 spiral glyphs, so its body boolean runs about twenty minutes and its STLs
are around 38MB; the fusion stator runs about ten. `verify_addition()` and the
family-B rim checks run first, so the printed glyphs are the reviewed ones.

Assembly: an M4 countersunk screw passes through the rotor and stator into a
nut under the bottom disc. A printed hub ring around the pivot sets each 0.5mm
face gap, so the rotors clear the artwork. The single-disc tools (addition,
recovery) recess the nut in a shallow hex pocket on the underside; on the
fusion/translation stack the nut sits below the flipped rotor, so that stator
carries hubs on both faces and no nut pocket, and the flipped rotor is printed
without a countersink. A jam nut fits the pocket flush; a standard nut stands
proud unless the stator is thicker (`--thickness`). `printfiles.py --help` has
the rest.
