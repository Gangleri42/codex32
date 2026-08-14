#!/usr/bin/env python3
"""Generate the codex32 volvelles as PCBs: KiCad boards, SVG previews, and
plain-text proof tables for review."""

import argparse
from pathlib import Path

import emit_kicad
import emit_svg
import gf32
import psdata
import wheels
from wheels import Board, DiscSpec

RIM_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXYZ023456789"


def verify_addition(code, perm, perm_v, table):
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


def addition_table_txt(code, perm_v, table):
    rows = ["   | " + " ".join(RIM_ALPHABET), "---+" + "-" * 64]
    for ring in range(32):
        rows.append(f" {code[perm_v[31 - ring]]} | " + " ".join(table[ring]))
    return "\n".join(rows) + "\n"


def recovery_symbol(p, code2):
    """Inner-ring symbol at the rim position of share index p^16: the Lagrange
    factor that translates the dialed share when recovering S from two shares.

    Computed with the verbatim PS expression and re-checked against the closed
    form p/(p+1) derived from it; the identity slot stays blank.
    """
    basis = gf32.lagrange(16, 17, [p ^ 16, 17])
    closed = 1 if p == 1 else gf32.mul(p, gf32.inv(p ^ 1))
    if basis != closed:
        raise ValueError(f"recovery symbol mismatch at p={p}: {basis} != {closed}")
    return " " if basis == 1 else code2[basis]


def family_b_specs(code, code2, bases):
    fusion_rim = [code2[p] for p in gf32.powers(bases["fusion"])]
    translation_rim = [code[p] for p in gf32.powers(bases["translation"])]
    rec_powers = gf32.powers(bases["recovery"])
    recovery_rim = [code[p ^ 16] for p in rec_powers]

    if set(fusion_rim) != set(code2[1:32]):
        raise ValueError("fusion rim is not the 31 nonzero symbols")
    if set(translation_rim) != set(code) - {code[0]}:
        raise ValueError("translation rim is not the alphabet minus Q")
    if code[16] != "S" or set(recovery_rim) != set(code) - {"S"}:
        raise ValueError("recovery rim is not the share indices (alphabet minus S)")

    return (
        DiscSpec("fusion", "Fusion", fusion_rim, fusion_rim,
                 rim_symbol=True, inner_symbol=True, rim_ptr=0, inner_ptr=6, handle_ptr=-16),
        DiscSpec("translation", "Translation", translation_rim, translation_rim,
                 rim_symbol=False, inner_symbol=False, rim_ptr=0, inner_ptr=6, handle_ptr=0),
        DiscSpec("recovery", "Recovery", recovery_rim,
                 [recovery_symbol(p, code2) for p in rec_powers],
                 rim_symbol=False, inner_symbol=True, rim_ptr=-6, inner_ptr=0, handle_ptr=-16),
    )


def rims_txt(specs):
    rows = []
    for spec in specs:
        rows.append(f"{spec.title}: position (clockwise from top): rim / top-disc ring")
        rows += [f"  {k:2d}: {spec.rim[k]} / {spec.inner[k]}" for k in range(31)]
        rows.append("")
    return "\n".join(rows)


def main():
    root = Path(__file__).resolve().parents[1]
    repo = root.parent
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scale", type=float, default=1.0, help="artwork scale factor")
    ap.add_argument("--pivot-mm", type=float, default=4.2, help="pivot hole diameter, unscaled")
    ap.add_argument("--out", type=Path, default=root / "out")
    args = ap.parse_args()

    ps = repo / "SSS32.ps"
    code, perm, perm_v = psdata.load(ps, repo / "reference/rust-codex32/src/gf32.rs")
    code2, bases = psdata.load_family_b(ps)
    pivot_r = args.pivot_mm / 2 / (wheels.PT_MM * args.scale)

    add_stator, table = wheels.addition_stator(code, perm, perm_v, pivot_r)
    add_rotor = wheels.addition_rotor(code, perm_v, pivot_r)
    verify_addition(code, perm, perm_v, table)

    fusion, translation, recovery = family_b_specs(code, code2, bases)
    ft_stator = Board("fusion-translation-stator",
                      wheels.b_stator_face(fusion, pivot_r, with_edge=True),
                      ("circle", wheels.B_RADIUS),
                      wheels.b_stator_face(translation, pivot_r, with_edge=False))
    rec_stator = Board("recovery-stator",
                       wheels.b_stator_face(recovery, pivot_r, with_edge=True),
                       ("circle", wheels.B_RADIUS))
    rotors = {
        "fusion": wheels.b_rotor(fusion, pivot_r, []),
        "translation": wheels.b_rotor(translation, pivot_r, wheels.translation_tab_decor()),
        "recovery": wheels.b_rotor(recovery, pivot_r, wheels.recovery_rotor_decor(recovery.inner_radius)),
    }

    boards = [add_stator, add_rotor, ft_stator, rec_stator, *rotors.values()]
    faces = {  # stator face to show under each rotor in the assembled preview
        "fusion": Board("fusion-face", ft_stator.items, ft_stator.shape),
        "translation": Board("translation-face", ft_stator.back_items, ft_stator.shape),
        "recovery": rec_stator,
    }

    args.out.mkdir(exist_ok=True)
    for board in boards:
        (args.out / f"{board.name}.kicad_pcb").write_text(emit_kicad.emit(board, args.scale))
        (args.out / f"{board.name}.svg").write_text(emit_svg.emit(board, args.scale))
    (args.out / "fusion-translation-stator-back.svg").write_text(
        emit_svg.emit(faces["translation"], args.scale))
    (args.out / "addition-assembled.svg").write_text(
        emit_svg.emit_assembled(add_stator, add_rotor, args.scale))
    for name, rotor in rotors.items():
        (args.out / f"{name}-assembled.svg").write_text(
            emit_svg.emit_assembled(faces[name], rotor, args.scale))
    (args.out / "addition-table.txt").write_text(addition_table_txt(code, perm_v, table))
    (args.out / "family-b-rims.txt").write_text(rims_txt((fusion, translation, recovery)))

    k = wheels.PT_MM * args.scale
    print("verified: rim order, 1024 spiral glyphs, 3 generator rims, recovery Lagrange ring")
    print(f"addition stator Ø{2 * wheels.STATOR_EDGE_R * k:.1f}mm, rotor Ø{2 * wheels.HANDLE_R * k:.1f}mm")
    print(f"family-B stators Ø{2 * wheels.B_RADIUS * k:.1f}mm, rotors Ø{2 * fusion.inner_radius * k:.1f}mm "
          f"+ tab to r={wheels.B_TAB_TOP * k:.1f}mm, pivot Ø{args.pivot_mm}mm")


if __name__ == "__main__":
    main()
