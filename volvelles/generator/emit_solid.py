"""Solid-model emitter: turn the same wheel primitives the 2D emitters use into
OpenSCAD part sources and text-only SVGs, for 3D printing.

OpenSCAD cannot import text, so every face's Text items go to a separate SVG
that Inkscape converts to paths first; everything else (outlines, holes, rings,
pointers) is emitted as native OpenSCAD 2D geometry, which avoids the SVG
importer's hole behaviour entirely.

OpenSCAD maps an imported SVG's viewBox onto its physical width/height and then
flips Y.  With a viewBox of -H..H and width=height=2H mm, one user unit is one
millimetre and the import lands at (x+H, 3H-y), so one translate restores page
coordinates (page Y is up, as in wheels.py).

Parts come out as two objects per coloured face, so a slicer can print them in
different filaments with the artwork flush with the surface:

  body         outer silhouette minus holes minus each face's artwork
  inlay        the artwork itself, filling the recess

A stator with a `back_items` face (fusion/translation) gets a cavity and an
inlay on both faces; the back face is mirrored in X, matching the KiCad
emitter, so it reads correctly once the wheel is flipped over.

A single-colour engraved part is just the body with the artwork cut into it.
"""

import math
from dataclasses import dataclass

from wheels import (Board, Circle, EdgeCircle, Poly, Seg, Text, Window, polar,
                    B_CAP_R, B_HANDLE_W, B_TAB_TOP, DISC_R, HANDLE_R)

FONT_LETTER = "DejaVu Sans Mono"
FONT_SYMBOL = "DejaVu Sans"
# Cap height per em.  The geometry anchors glyphs for Courier's 0.56; the DejaVu
# faces are taller, so scale their point size to match cap heights.
DEJAVU_CAP = 0.73
COURIER_CAP = 0.56

ART = (Text, Circle, Seg, Poly)


@dataclass
class SolidOpts:
    thickness: float = 3.0
    relief: float = 0.6
    mode: str = "flush"        # flush | raised | engrave
    stroke_boost: float = 0.20  # widen artwork strokes for a 0.4mm nozzle
    inlay_gap: float = 0.0      # total clearance between body cavity and inlay
    pivot_d: float = 4.5
    hub_od: float = 10.0
    hub_h: float = 0.5
    head_d: float = 8.2
    head_depth: float = 1.5
    nut_pocket: float = 1.5
    nut_af: float = 7.4
    role: str = "rotor"        # stator | rotor
    fn_arc: float = 2.0


def _fmt(v: float) -> str:
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def _arc_pts(cx, cy, r, a1, a2, step=1.5):
    a2 = a2 if a2 > a1 else a2 + 360
    n = max(6, int(math.ceil((a2 - a1) / step)))
    out = []
    for i in range(n + 1):
        a = math.radians(a1 + (a2 - a1) * i / n)
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def _outline_points(board: Board) -> list[tuple[float, float]]:
    """Closed page-space outline of a part, in points (Y up)."""
    kind = board.shape[0]
    if kind == "addition_rotor":
        pts = _arc_pts(0, 0, HANDLE_R, 140, 400)
        pts.append(polar(DISC_R, 40))
        pts += _arc_pts(0, 0, DISC_R, 40, 140)[1:]
        return pts
    if kind == "b_rotor":
        ir = board.shape[1]
        hw = B_HANDLE_W / 2
        tab_base = math.sqrt(ir * ir - hw * hw)
        theta = math.degrees(math.atan2(tab_base, hw))
        pts = _arc_pts(0, 0, ir, 180 - theta, 360 + theta)
        pts.append((hw, B_TAB_TOP - B_CAP_R))
        pts += _arc_pts(hw - B_CAP_R, B_TAB_TOP - B_CAP_R, B_CAP_R, 0, 90, 4)[1:]
        pts.append((-hw + B_CAP_R, B_TAB_TOP))
        pts += _arc_pts(-hw + B_CAP_R, B_TAB_TOP - B_CAP_R, B_CAP_R, 90, 180, 4)[1:]
        return pts
    raise ValueError(f"no solid outline for shape {kind!r}")


def _is_hole(item, board: Board) -> bool:
    if type(item) is Window:
        return True
    if type(item) is EdgeCircle:
        # the pivot is the only EdgeCircle that is not the outer silhouette
        return not (board.shape[0] == "circle" and abs(item.r - board.shape[1]) < 1e-6)
    return False


def _face_half(items, k: float) -> float:
    half = 1.0
    for it in items:
        if type(it) is Text:
            half = max(half, (abs(it.x) + abs(it.y) + it.size) * k)
    return half * 1.05


def _text_svg(items, half: float, k: float) -> str:
    body = []
    for it in items:
        x, y = it.x * k, -it.y * k
        size = it.size * k * (COURIER_CAP / DEJAVU_CAP)
        fam = FONT_SYMBOL if it.symbol else FONT_LETTER
        body.append(
            f'<text x="{_fmt(x)}" y="{_fmt(y)}" dy="0.32em" fill="black" '
            f'font-family="{fam}" font-weight="bold" font-size="{_fmt(size)}" '
            f'text-anchor="middle" '
            f'transform="rotate({_fmt(-it.angle)} {_fmt(x)} {_fmt(y)})">{it.s}</text>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{_fmt(2 * half)}mm" '
            f'height="{_fmt(2 * half)}mm" viewBox="{-half} {-half} {2 * half} {2 * half}">\n'
            + "\n".join(body) + "\n</svg>\n")


def text_svgs(board: Board, k: float) -> tuple[list[tuple[str, str]], float]:
    """One SVG per face that carries text, plus the shared viewBox half-width."""
    faces = [(board.name, board.items)]
    if board.back_items:
        faces.append((f"{board.name}-back", board.back_items))
    half = max([_face_half(items, k) for _, items in faces] or [1.0])
    out = [(name, _text_svg([it for it in items if type(it) is Text], half, k))
           for name, items in faces if any(type(it) is Text for it in items)]
    return out, half


def _has_art(items) -> bool:
    return any(type(it) in ART for it in items)


def _art2d(items, basename: str, k: float, o: SolidOpts, half: float, grow: float = 0.0) -> str:
    """OpenSCAD 2D artwork (rings, pointers, capsules) plus the text import.

    `grow` offsets the whole region; the body cavity and the inlay use opposite
    signs so `inlay_gap` leaves a hair of clearance between them.
    """
    parts = []
    for it in items:
        if type(it) is Circle:
            w = max(it.width * k, o.stroke_boost)
            cx, cy = it.x * k, it.y * k
            parts.append(
                f"difference() {{ translate([{_fmt(cx)},{_fmt(cy)}]) circle(d={_fmt(2 * (it.r + w / 2) * k)}); "
                f"translate([{_fmt(cx)},{_fmt(cy)}]) circle(d={_fmt(2 * (it.r - w / 2) * k)}); }}")
        elif type(it) is Seg:
            w = max(it.width * k, o.stroke_boost)
            parts.append(
                f"hull() {{ translate([{_fmt(it.x1 * k)},{_fmt(it.y1 * k)}]) circle(d={_fmt(w)}); "
                f"translate([{_fmt(it.x2 * k)},{_fmt(it.y2 * k)}]) circle(d={_fmt(w)}); }}")
        elif type(it) is Poly:
            pts = ", ".join(f"[{_fmt(x * k)},{_fmt(y * k)}]" for x, y in it.pts)
            parts.append(f"polygon(points=[{pts}]);")
    if any(type(it) is Text for it in items):
        # Restore page coordinates (see module docstring) and thicken the stems.
        parts.append(f'offset(delta={_fmt(o.stroke_boost / 2)}) '
                     f'translate([{_fmt(-half)},{_fmt(-3 * half)}]) import("{basename}-text.svg");')
    union = "union() {\n    " + "\n    ".join(parts) + "\n  }"
    if grow:
        return f"offset(delta={_fmt(grow)}) {union}"
    return union


def _holes2d(board: Board, k: float, o: SolidOpts) -> str:
    parts = []
    for it in board.items:
        if type(it) is Window:
            parts.append(
                f"translate([{_fmt(it.x * k)},{_fmt(it.y * k)}]) "
                f"square([{_fmt(it.w * k)},{_fmt(it.h * k)}], center=true);")
        elif _is_hole(it, board):
            parts.append(f"circle(d={_fmt(2 * it.r * k)});")
    return "union() {\n    " + "\n    ".join(parts) + "\n  }"


def _silhouette2d(board: Board, k: float, o: SolidOpts) -> str:
    if board.shape[0] == "circle":
        return f"circle(d={_fmt(2 * board.shape[1] * k)});"
    pts = _outline_points(board)
    s = ", ".join(f"[{_fmt(x * k)},{_fmt(y * k)}]" for x, y in pts)
    return f"polygon(points=[{s}]);"


def _header(board: Board, o: SolidOpts) -> str:
    return (f"// generated by emit_solid.py -- do not edit\n"
            f"$fa = {o.fn_arc}; $fs = 0.6;\n"
            f"T = {_fmt(o.thickness)}; RELIEF = {_fmt(o.relief)}; "
            f"PIVOT = {_fmt(o.pivot_d)};\n")


def _block(kind: str, exprs: list[str]) -> str:
    return kind + "() {\n    " + "\n    ".join(e + ";" for e in exprs) + "\n  }"


def _hub(top: bool) -> str:
    z = "T" if top else "-HUB"
    return (f"translate([0,0,{z}]) linear_extrude(HUB) "
            "difference() { circle(d=HUB_OD); circle(d=PIVOT); }")


def body_scad(board: Board, k: float, o: SolidOpts, half: float) -> str:
    sil = _silhouette2d(board, k, o)
    hol = _holes2d(board, k, o)
    artf = _art2d(board.items, board.name, k, o, half, grow=o.inlay_gap / 2)
    double = bool(board.back_items)
    lines = [_header(board, o),
             f"HUB = {_fmt(o.hub_h)}; HUB_OD = {_fmt(o.hub_od)};",
             f"module body2d() {{ difference() {{ {sil} {hol} }} }}",
             f"module art_front() {{ {artf} }}"]
    if double:
        artb = _art2d(board.back_items, f"{board.name}-back", k, o, half,
                      grow=o.inlay_gap / 2)
        lines.append(f"module art_back() {{ scale([-1,1,1]) {artb} }}")
    body = "linear_extrude(T) body2d()"
    cuts = []
    if o.mode != "raised":
        cuts.append("translate([0,0,T-RELIEF-0.01]) linear_extrude(RELIEF+0.02) art_front()")
    if double:
        cuts.append("translate([0,0,-0.01]) linear_extrude(RELIEF+0.02) art_back()")
    if cuts:
        body = _block("difference", [body, *cuts])
    if o.role == "stator":
        expr = _block("union", [body, _hub(top=True), *([_hub(top=False)] if double else [])])
        if not double and o.nut_pocket > 0:
            nut_d = o.nut_af / math.cos(math.radians(30))
            expr = _block("difference", [
                expr,
                f"translate([0,0,-0.1]) linear_extrude({_fmt(o.nut_pocket + 0.1)}) "
                f"circle(d={_fmt(nut_d)}, $fn=6)"])
    elif o.role == "rotor" and o.head_depth > 0:
        expr = _block("difference", [
            body,
            f"translate([0,0,T-{_fmt(o.head_depth)}]) "
            f"cylinder(d1=PIVOT, d2={_fmt(o.head_d)}, h={_fmt(o.head_depth + 0.01)})"])
    else:
        expr = body
    return "\n".join(lines) + "\n\n" + expr + "\n"


def inlay_scads(board: Board, k: float, o: SolidOpts, half: float) -> list[tuple[str, str]]:
    if o.mode == "engrave":
        return []
    head = _header(board, o)
    out = []
    if _has_art(board.items):
        artf = _art2d(board.items, board.name, k, o, half, grow=-o.inlay_gap / 2)
        z = "T" if o.mode == "raised" else "(T-RELIEF)"
        out.append(("inlay", head + f"\nmodule art() {{ {artf} }}\n\n"
                    f"translate([0,0,{z}]) linear_extrude(RELIEF) art();\n"))
    if board.back_items and _has_art(board.back_items):
        artb = _art2d(board.back_items, f"{board.name}-back", k, o, half, grow=-o.inlay_gap / 2)
        out.append(("inlay-back", head + f"\nmodule art() {{ scale([-1,1,1]) {artb} }}\n\n"
                    f"linear_extrude(RELIEF) art();\n"))
    return out


def part_dimensions(board: Board, k: float) -> float:
    kind = board.shape[0]
    if kind == "circle":
        return 2 * board.shape[1] * k
    if kind == "addition_rotor":
        return 2 * HANDLE_R * k
    ir = board.shape[1]
    return max(2 * ir, B_TAB_TOP + ir) * k
