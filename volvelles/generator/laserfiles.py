#!/usr/bin/env python3
"""Fiber-laser file set: per-face SVGs, text converted to paths via Inkscape.

The three ring wheels default to 60mm stators, the addition pair to 110mm so
its 32x32 spiral stays readable. Pivot defaults to M3."""

import argparse
import subprocess
from pathlib import Path

import emit_laser
import gf32
import psdata
import wheels
from generate import family_b_specs, verify_addition
from wheels import Board


def main():
    root = Path(__file__).resolve().parents[1]
    repo = root.parent
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--b-diameter", type=float, default=60.0,
                    help="stator diameter for fusion/translation/recovery, mm")
    ap.add_argument("--addition-diameter", type=float, default=110.0,
                    help="addition stator diameter, mm")
    ap.add_argument("--pivot-mm", type=float, default=3.2)
    ap.add_argument("--out", type=Path, default=root / "out/laser")
    args = ap.parse_args()

    ps = repo / "SSS32.ps"
    code, perm, perm_v = psdata.load(ps, repo / "reference/rust-codex32/src/gf32.rs")
    code2, bases = psdata.load_family_b(ps)

    scale_add = args.addition_diameter / (2 * wheels.STATOR_EDGE_R * wheels.PT_MM)
    scale_b = args.b_diameter / (2 * wheels.B_RADIUS * wheels.PT_MM)

    pivot_add = args.pivot_mm / 2 / (wheels.PT_MM * scale_add)
    pivot_b = args.pivot_mm / 2 / (wheels.PT_MM * scale_b)

    add_stator, table = wheels.addition_stator(code, perm, perm_v, pivot_add)
    add_rotor = wheels.addition_rotor(code, perm_v, pivot_add)
    verify_addition(code, perm, perm_v, table)

    fusion, translation, recovery = family_b_specs(code, code2, bases)
    ft_stator = Board("fusion-translation-stator",
                      wheels.b_stator_face(fusion, pivot_b, with_edge=True),
                      ("circle", wheels.B_RADIUS),
                      wheels.b_stator_face(translation, pivot_b, with_edge=False))
    faces = [
        ("addition-stator", add_stator, scale_add, False),
        ("addition-rotor", add_rotor, scale_add, False),
        ("fusion-translation-stator-A-fusion", ft_stator, scale_b, False),
        ("fusion-translation-stator-B-translation", ft_stator, scale_b, True),
        ("recovery-stator",
         Board("recovery-stator", wheels.b_stator_face(recovery, pivot_b, with_edge=True),
               ("circle", wheels.B_RADIUS)), scale_b, False),
        ("fusion-rotor", wheels.b_rotor(fusion, pivot_b, []), scale_b, False),
        ("translation-rotor",
         wheels.b_rotor(translation, pivot_b, wheels.translation_tab_decor()), scale_b, False),
        ("recovery-rotor",
         wheels.b_rotor(recovery, pivot_b, wheels.recovery_rotor_decor(recovery.inner_radius)),
         scale_b, False),
    ]

    args.out.mkdir(parents=True, exist_ok=True)
    for name, board, scale, back in faces:
        path = args.out / f"{name}.svg"
        path.write_text(emit_laser.emit_face(board, scale, back))
        subprocess.run(["inkscape", str(path), "--export-text-to-path",
                        "--export-plain-svg", f"--export-filename={path}"],
                       check=True, capture_output=True)
        if "<text" in path.read_text():
            raise RuntimeError(f"text survived path conversion in {path}")

    cap = wheels.CAP * wheels.PT_MM
    print(f"family B at Ø{args.b_diameter}mm: ring glyphs {18 * cap * scale_b:.2f}mm, "
          f"window {0.6 * 18 * 1.2 * wheels.PT_MM * scale_b:.2f}mm wide")
    print(f"addition at Ø{args.addition_diameter}mm: spiral glyphs {12 * cap * scale_add:.2f}mm, "
          f"windows {12 * wheels.PT_MM * scale_add:.2f}mm, rim {18 * cap * scale_add:.2f}mm")
    print(f"pivot Ø{args.pivot_mm}mm; cut=red hairline, mark=black, blue=reference")


if __name__ == "__main__":
    main()
