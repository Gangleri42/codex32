"""Per-face SVGs for fiber-laser cutting and marking, in true millimeters.

LightBurn color convention: black filled shapes are the marking artwork, red
hairline paths are through-cuts, blue hairline is reference-only geometry
(the already-cut outline, for aligning a second-side marking pass).

Text is emitted as <text> and must be converted to paths before use; the
laserfiles script runs Inkscape over every output for that.
"""

import math
from wheels import (Board, Circle, EdgeArc, EdgeCircle, EdgeSeg, Poly, Seg,
                    Text, Window, PT_MM, polar, CAP, DISC_R, HANDLE_R,
                    B_CAP_R, B_HANDLE_W, B_TAB_TOP)

MARK = "#000000"
CUT = "#ff0000"
REF = "#0000ff"
HAIR = 0.05
DEJAVU_CAP = 0.73


def _pt(k, x, y):
    return x * k, -y * k


def _cut_paths(items, k, color):
    parts = []
    for it in items:
        if type(it) is EdgeCircle:
            x, y = _pt(k, it.x, it.y)
            parts.append(f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{it.r * k:.3f}"/>')
        elif type(it) is EdgeArc:
            a2 = it.a2 if it.a2 > it.a1 else it.a2 + 360
            (x1, y1), (x2, y2) = (polar(it.r, a) for a in (it.a1, a2))
            large = 1 if a2 - it.a1 > 180 else 0
            parts.append(f'<path d="M {x1 * k:.3f} {-y1 * k:.3f} '
                         f'A {it.r * k:.3f} {it.r * k:.3f} 0 {large} 0 {x2 * k:.3f} {-y2 * k:.3f}"/>')
        elif type(it) is EdgeSeg:
            x1, y1 = _pt(k, it.x1, it.y1)
            x2, y2 = _pt(k, it.x2, it.y2)
            parts.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}"/>')
        elif type(it) is Window:
            x, y = _pt(k, it.x, it.y)
            w, h = it.w * k, it.h * k
            parts.append(f'<rect x="{x - w / 2:.3f}" y="{y - h / 2:.3f}" '
                         f'width="{w:.3f}" height="{h:.3f}" rx="0.3"/>')
    return (f'<g fill="none" stroke="{color}" stroke-width="{HAIR}">\n'
            + "\n".join(parts) + "\n</g>")


def _mark_art(items, k):
    parts = [f'<g fill="{MARK}" stroke="none" '
             'font-family="\'Courier New\',monospace" text-anchor="middle">']
    for it in items:
        if type(it) is Text:
            x, y = _pt(k, it.x, it.y)
            size = it.size * k * (0.56 / DEJAVU_CAP if it.symbol else 1)
            fam = ' font-family="\'DejaVu Sans\',sans-serif"' if it.symbol else ""
            parts.append(
                f'<text x="{x:.3f}" y="{y:.3f}" dy="0.32em" font-size="{size:.3f}"{fam} '
                f'transform="rotate({-it.angle:.3f} {x:.3f} {y:.3f})">{it.s}</text>')
        elif type(it) is Circle:
            x, y = _pt(k, it.x, it.y)
            parts.append(f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{it.r * k:.3f}" fill="none" '
                         f'stroke="{MARK}" stroke-width="{max(0.08, it.width * k):.3f}"/>')
        elif type(it) is Seg:
            x1, y1 = _pt(k, it.x1, it.y1)
            x2, y2 = _pt(k, it.x2, it.y2)
            parts.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" '
                         f'stroke="{MARK}" stroke-width="{max(0.08, it.width * k):.3f}"/>')
        elif type(it) is Poly:
            pts = " ".join(f"{x:.3f},{y:.3f}" for x, y in (_pt(k, *p) for p in it.pts))
            parts.append(f'<polygon points="{pts}"/>')
    parts.append("</g>")
    return "\n".join(parts)


def emit_face(board: Board, scale: float, back: bool = False) -> str:
    """One marking setup: artwork of the chosen face plus cut or reference
    geometry. Back faces get the outline in blue only, since the part is
    already cut when the second side is marked."""
    k = PT_MM * scale
    edges = [it for it in board.items
             if type(it) in (EdgeCircle, EdgeArc, EdgeSeg, Window)]
    art = board.back_items if back else [it for it in board.items
                                         if type(it) not in (EdgeCircle, EdgeArc, EdgeSeg, Window)]
    half = {"circle": lambda: board.shape[1],
            "addition_rotor": lambda: HANDLE_R,
            "b_rotor": lambda: B_TAB_TOP}[board.shape[0]]() * k + 2
    size = 2 * half
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size:.2f}mm" height="{size:.2f}mm" '
            f'viewBox="{-half:.2f} {-half:.2f} {size:.2f} {size:.2f}">\n'
            + _cut_paths(edges, k, REF if back else CUT) + "\n"
            + _mark_art(art, k) + "\n</svg>\n")
