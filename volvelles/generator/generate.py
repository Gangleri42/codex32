#!/usr/bin/env python3
"""Generate the codex32 addition volvelle: KiCad boards, SVG previews, and a
plain-text proof table for review."""

import argparse
from pathlib import Path

import emit_kicad
import emit_svg
import psdata
import wheels

RIM_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXYZ023456789"


def verify(code, perm, perm_v, table):
    rim = "".join(code[p] for p in perm)
    if rim != RIM_ALPHABET:
        raise ValueError(f"rim order {rim!r} != {RIM_ALPHABET!r}")
    for ring in range(32):
        for i in range(32):
            if table[ring][i] != code[perm[i] ^ perm_v[31 - ring]]:
                raise ValueError(f"spiral glyph mismatch at ring {ring}, rim position {i}")
    # worked out by hand from the PS semantics: A(29)^K(22)=11->T, A(29)^J(18)=15->0
    if table[31][0] != "T" or table[0][0] != "0":
        raise ValueError("pinned XOR samples failed; the port drifted")


def table_txt(code, perm_v, table):
    rows = ["   | " + " ".join(RIM_ALPHABET), "---+" + "-" * 64]
    for ring in range(32):
        rows.append(f" {code[perm_v[31 - ring]]} | " + " ".join(table[ring]))
    return "\n".join(rows) + "\n"


def main():
    root = Path(__file__).resolve().parents[1]
    repo = root.parent
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scale", type=float, default=1.0, help="artwork scale factor")
    ap.add_argument("--pivot-mm", type=float, default=4.2, help="pivot hole diameter, unscaled")
    ap.add_argument("--out", type=Path, default=root / "out")
    args = ap.parse_args()

    code, perm, perm_v = psdata.load(repo / "SSS32.ps",
                                     repo / "reference/rust-codex32/src/gf32.rs")
    pivot_r = args.pivot_mm / 2 / (wheels.PT_MM * args.scale)
    stator, table = wheels.addition_stator(code, perm, perm_v, pivot_r)
    rotor = wheels.addition_rotor(code, perm_v, pivot_r)
    verify(code, perm, perm_v, table)

    args.out.mkdir(exist_ok=True)
    for board in (stator, rotor):
        (args.out / f"{board.name}.kicad_pcb").write_text(emit_kicad.emit(board, args.scale))
        (args.out / f"{board.name}.svg").write_text(emit_svg.emit(board, args.scale))
    (args.out / "addition-assembled.svg").write_text(
        emit_svg.emit_assembled(stator, rotor, args.scale))
    (args.out / "addition-table.txt").write_text(table_txt(code, perm_v, table))

    k = wheels.PT_MM * args.scale
    print(f"verified rim order and all 1024 spiral glyphs")
    print(f"stator Ø{2 * wheels.STATOR_EDGE_R * k:.1f}mm, "
          f"rotor Ø{2 * wheels.HANDLE_R * k:.1f}mm, pivot Ø{args.pivot_mm}mm")


if __name__ == "__main__":
    main()
