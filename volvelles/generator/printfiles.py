#!/usr/bin/env python3
"""3D-printable volvelle parts: OpenSCAD solids for a Bambu-class printer.

The addition pair comes out at 1:1, i.e. a Ø204.6mm rotor and a Ø189.1mm
stator, which fit a Bambu P1S (256mm) with room for a brim.  The family-B
wheels (fusion/translation/recovery) scale to a Ø205mm stator by default.  Each
part is emitted as a body plus one inlay per coloured face, sharing one
coordinate system: load the STLs into the slicer, leave them where they import,
and assign the body and the inlays to different filaments (AMS).  The inlays
sit flush with the surface.

Text has to go through Inkscape to become paths before OpenSCAD can import it;
everything else is native OpenSCAD geometry.  The addition stator's 1024 spiral
glyphs make its body a slow boolean (about twenty minutes on this machine).

Usage:
    python3 volvelles/generator/printfiles.py
    python3 volvelles/generator/printfiles.py --parts family-b --b-mm 205
    python3 volvelles/generator/printfiles.py --scale 1.03 --mode raised --relief 0.5
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

import emit_solid
import psdata
import wheels
from emit_solid import SolidOpts
from generate import family_b_specs, verify_addition
from wheels import Board, PT_MM


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def text_to_paths(svg: Path, inkscape: str) -> None:
    run([inkscape, str(svg), "--export-text-to-path", "--export-plain-svg",
         f"--export-filename={svg}"])
    if "<text" in svg.read_text():
        raise RuntimeError(f"text survived path conversion in {svg}")


def render(scad: Path, stl: Path, openscad: str) -> float:
    t0 = time.time()
    run([openscad, "--export-format=binstl", "-o", str(stl), str(scad)])
    return time.time() - t0


def build(board, scale: float, o: SolidOpts, out: Path, inkscape: str, openscad: str) -> float:
    k = PT_MM * scale
    svgs, half = emit_solid.text_svgs(board, k)
    for basename, svg in svgs:
        path = out / f"{basename}-text.svg"
        path.write_text(svg)
        text_to_paths(path, inkscape)
    (out / f"{board.name}-body.scad").write_text(emit_solid.body_scad(board, k, o, half))
    scads = [("body", out / f"{board.name}-body.scad")]
    for suffix, scad in emit_solid.inlay_scads(board, k, o, half):
        path = out / f"{board.name}-{suffix}.scad"
        path.write_text(scad)
        scads.append((suffix, path))
    for which, scad in scads:
        stl = out / f"{board.name}-{which}.stl"
        dt = render(scad, stl, openscad)
        print(f"  {board.name}-{which}.stl  {dt:6.1f}s  {stl.stat().st_size / 1e6:6.1f} MB")
    dim = emit_solid.part_dimensions(board, k)
    print(f"  {board.name}: {dim:.1f}mm across, pivot Ø{o.pivot_d}mm, "
          f"thickness {o.thickness}mm, {o.mode}")
    return dim


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    repo = root.parent
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scale", type=float, default=1.0,
                    help="addition scale; 1.0 gives the Ø204.6mm rotor")
    ap.add_argument("--b-mm", type=float, default=205.0,
                    help="family-B stator diameter, mm (the 1:1 stator is Ø141.1mm)")
    ap.add_argument("--out", type=Path, default=root / "out/3d")
    ap.add_argument("--mode", choices=("flush", "raised", "engrave"), default="flush",
                    help="flush two-colour inlay (default), raised cap, or single-colour cut")
    ap.add_argument("--thickness", type=float, default=3.0)
    ap.add_argument("--relief", type=float, default=0.6)
    ap.add_argument("--pivot-mm", type=float, default=4.5, help="M4 clearance")
    ap.add_argument("--hub-mm", type=float, default=10.0, help="stator bearing hub outer diameter")
    ap.add_argument("--hub-height", type=float, default=0.5)
    ap.add_argument("--head-diameter", type=float, default=8.2)
    ap.add_argument("--head-depth", type=float, default=1.5)
    ap.add_argument("--nut-pocket", type=float, default=1.5)
    ap.add_argument("--nut-af", type=float, default=7.4, help="M4 across-flats + clearance")
    ap.add_argument("--stroke-boost", type=float, default=0.20,
                    help="widen artwork strokes; keep font stems above the nozzle width")
    ap.add_argument("--inlay-gap", type=float, default=0.0,
                    help="total clearance between cavity and inlay if the slicer dislikes exact fits")
    ap.add_argument("--parts", default="addition",
                    help="comma list: addition, family-b, or one of the part names")
    ap.add_argument("--inkscape", default="inkscape")
    ap.add_argument("--openscad", default="openscad")
    args = ap.parse_args()

    ps = repo / "SSS32.ps"
    code, perm, perm_v = psdata.load(ps, repo / "reference/rust-codex32/src/gf32.rs")
    code2, bases = psdata.load_family_b(ps)
    common = dict(mode=args.mode, thickness=args.thickness, relief=args.relief,
                  stroke_boost=args.stroke_boost, inlay_gap=args.inlay_gap, pivot_d=args.pivot_mm,
                  hub_od=args.hub_mm, hub_h=args.hub_height,
                  head_d=args.head_diameter, head_depth=args.head_depth,
                  nut_pocket=args.nut_pocket, nut_af=args.nut_af)

    addition = {"addition-stator", "addition-rotor"}
    fam_b = {"fusion-translation-stator", "recovery-stator",
             "fusion-rotor", "translation-rotor", "recovery-rotor"}
    parts = {p.strip() for p in args.parts.split(",")}
    if "addition" in parts:
        parts |= addition
    if "family-b" in parts:
        parts |= fam_b

    args.out.mkdir(parents=True, exist_ok=True)
    widest = 0.0
    if parts & addition:
        k = PT_MM * args.scale
        stator, table = wheels.addition_stator(code, perm, perm_v, args.pivot_mm / 2 / k)
        rotor = wheels.addition_rotor(code, perm_v, args.pivot_mm / 2 / k)
        verify_addition(code, perm, perm_v, table)
        print("addition: rim order, 1024 spiral glyphs, pinned XOR samples verified")
        if "addition-stator" in parts:
            widest = max(widest, build(stator, args.scale, SolidOpts(role="stator", **common),
                                       args.out, args.inkscape, args.openscad))
        if "addition-rotor" in parts:
            widest = max(widest, build(rotor, args.scale, SolidOpts(role="rotor", **common),
                                       args.out, args.inkscape, args.openscad))

    if parts & fam_b:
        scale_b = args.b_mm / (2 * wheels.B_RADIUS * PT_MM)
        pivot_r = args.pivot_mm / 2 / (PT_MM * scale_b)
        fusion, translation, recovery = family_b_specs(code, code2, bases)
        ft_stator = Board("fusion-translation-stator",
                          wheels.b_stator_face(fusion, pivot_r, with_edge=True),
                          ("circle", wheels.B_RADIUS),
                          wheels.b_stator_face(translation, pivot_r, with_edge=False))
        rec_stator = Board("recovery-stator",
                           wheels.b_stator_face(recovery, pivot_r, with_edge=True),
                           ("circle", wheels.B_RADIUS))
        # Top rotor carries the countersunk screw head; the flipped bottom rotor does not.
        specs = [
            ("fusion-translation-stator", ft_stator, SolidOpts(role="stator", **common)),
            ("recovery-stator", rec_stator, SolidOpts(role="stator", **common)),
            ("fusion-rotor", wheels.b_rotor(fusion, pivot_r, []),
             SolidOpts(role="rotor", **common)),
            ("translation-rotor",
             wheels.b_rotor(translation, pivot_r, wheels.translation_tab_decor()),
             SolidOpts(role="rotor", **{**common, "head_depth": 0.0})),
            ("recovery-rotor",
             wheels.b_rotor(recovery, pivot_r, wheels.recovery_rotor_decor(recovery.inner_radius)),
             SolidOpts(role="rotor", **common)),
        ]
        print(f"family B at stator Ø{args.b_mm}mm (scale {scale_b:.3f})")
        for name, board, opts in specs:
            if name in parts:
                widest = max(widest, build(board, scale_b, opts, args.out,
                                           args.inkscape, args.openscad))

    if widest > 256:
        print(f"WARNING: widest part {widest:.1f}mm exceeds a 256mm build plate", file=sys.stderr)


if __name__ == "__main__":
    main()
