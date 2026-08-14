# codex32 volvelles in PCB

The [codex32](https://secretcodex32.com) paper computers, rebuilt as printed
circuit boards: black solder mask, lettering in ENIG gold (copper glyphs with
matching mask openings). What the booklet does with scissors, X-Acto cuts and
folded discs, a board house does with routed windows and native double-sided
copper.

## Layout

- `generator/` — Python port of the wheel-drawing procedures. Emits KiCad 7
  board files and gold-on-black preview SVGs. No dependencies beyond Python.
- `out/` — where the boards, previews and proof table land. Generated,
  ignored, never edited by hand.

Nothing is vendored. The arrays come out of the repo's own `SSS32.ps` and the
GF(32) cross-check reads `reference/rust-codex32/src/gf32.rs`, so the boards
track the source they claim to encode.

## Regenerate

Nothing under `out/` is tracked. This rebuilds it:

```
python3 volvelles/generator/generate.py   # 1:1 scale, Ø4.2mm pivot
python3 volvelles/generator/generate.py --scale 0.8 --pivot-mm 3.2
```

At 1:1 the addition stator is Ø189.1mm and the rotor Ø204.6mm across the grip
ring. The two mount on one pivot (binding screw or brass eyelet; a nylon washer
between the faces).

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

## Status

Done: the addition pair (bottom wheel spiral + universal windowed top wheel).

Next: the multiplication/translation disc (the booklet folds one sheet into a
two-sided disc; on PCB that becomes front and back copper of one stator with a
rotor on each face), the recovery wheel, the wheel-lock tab, the dragon
artwork transplant onto the rotor, and gerber/drill export.
