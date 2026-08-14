"""Gold-on-black preview SVGs from the same page-space primitives the KiCad
emitter consumes. Board shapes come from Board.shape; windows and pivot holes
become evenodd subpaths so the assembled views show the stator through them.
"""

import math
from wheels import (Board, Circle, EdgeCircle, Poly, Seg, Text, Window,
                    PT_MM, polar, DISC_R, HANDLE_R,
                    B_CAP_R, B_HANDLE_W, B_TAB_TOP)

BG = "#26262b"
BOARD_FILL = "#141417"
GOLD = "#c9a45c"
DEJAVU_CAP = 0.73  # scales symbol font-size so cap heights match Courier


def _pt(k, x, y):
    return x * k, -y * k


def _circle_subpath(cx, cy, r):
    return (f"M {cx - r:.3f} {cy:.3f} "
            f"a {r:.3f} {r:.3f} 0 1 0 {2 * r:.3f} 0 "
            f"a {r:.3f} {r:.3f} 0 1 0 {-2 * r:.3f} 0 Z ")


def _p(k, r, a):
    x, y = polar(r, a)
    return f"{x * k:.3f} {-y * k:.3f}"


def _addition_rotor_outline(k):
    rh, rd = HANDLE_R * k, DISC_R * k
    return (f"M {_p(k, HANDLE_R, 140)} A {rh:.3f} {rh:.3f} 0 1 0 {_p(k, HANDLE_R, 40)} "
            f"L {_p(k, DISC_R, 40)} A {rd:.3f} {rd:.3f} 0 0 0 {_p(k, DISC_R, 140)} Z ")


def _b_rotor_outline(ir, k):
    hw = B_HANDLE_W / 2
    tab_base = math.sqrt(ir * ir - hw * hw)
    top, r = B_TAB_TOP, B_CAP_R
    pt = lambda x, y: f"{x * k:.3f} {-y * k:.3f}"
    rr = f"{r * k:.3f} {r * k:.3f}"
    return (f"M {pt(-hw, tab_base)} A {ir * k:.3f} {ir * k:.3f} 0 1 0 {pt(hw, tab_base)} "
            f"L {pt(hw, top - r)} A {rr} 0 0 0 {pt(hw - r, top)} "
            f"L {pt(-hw + r, top)} A {rr} 0 0 0 {pt(-hw, top - r)} Z ")


def _shape(board: Board, k: float) -> str:
    kind = board.shape[0]
    if kind == "circle":
        d = _circle_subpath(0, 0, board.shape[1] * k)
    elif kind == "addition_rotor":
        d = _addition_rotor_outline(k)
    else:
        d = _b_rotor_outline(board.shape[1], k)
    for it in board.items:
        if type(it) is Window:
            x, y = _pt(k, it.x, it.y)
            hx, hy = it.w * k / 2, it.h * k / 2
            d += f"M {x - hx:.3f} {y - hy:.3f} h {2 * hx:.3f} v {2 * hy:.3f} h {-2 * hx:.3f} Z "
        elif type(it) is EdgeCircle and it.r < 50:  # pivot, not the outer edge
            x, y = _pt(k, it.x, it.y)
            d += _circle_subpath(x, y, it.r * k)
    return f'<path fill-rule="evenodd" fill="{BOARD_FILL}" stroke="#000" stroke-width="0.15" d="{d}"/>'


def _artwork(board: Board, k: float) -> str:
    parts = [f'<g fill="{GOLD}" stroke="none" font-family="\'Courier New\',monospace" '
             'text-anchor="middle">']
    for it in board.items:
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
                         f'stroke="{GOLD}" stroke-width="{max(0.15, it.width * k):.3f}"/>')
        elif type(it) is Seg:
            x1, y1 = _pt(k, it.x1, it.y1)
            x2, y2 = _pt(k, it.x2, it.y2)
            parts.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" '
                         f'stroke="{GOLD}" stroke-width="{max(0.15, it.width * k):.3f}"/>')
        elif type(it) is Poly:
            pts = " ".join(f"{x:.3f},{y:.3f}" for x, y in (_pt(k, *p) for p in it.pts))
            parts.append(f'<polygon points="{pts}"/>')
    parts.append("</g>")
    return "\n".join(parts)


def _document(content: str, half_mm: float) -> str:
    size = 2 * half_mm
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size:.0f}mm" height="{size:.0f}mm" '
            f'viewBox="{-half_mm:.1f} {-half_mm:.1f} {size:.1f} {size:.1f}">\n'
            f'<rect x="{-half_mm:.1f}" y="{-half_mm:.1f}" width="{size:.1f}" height="{size:.1f}" '
            f'fill="{BG}"/>\n{content}\n</svg>\n')


def _extent(board: Board) -> float:
    return {"circle": lambda: board.shape[1],
            "addition_rotor": lambda: HANDLE_R,
            "b_rotor": lambda: B_TAB_TOP}[board.shape[0]]()


def emit(board: Board, scale: float) -> str:
    k = PT_MM * scale
    return _document(_shape(board, k) + "\n" + _artwork(board, k), _extent(board) * k + 5)


def emit_assembled(stator: Board, rotor: Board, scale: float) -> str:
    k = PT_MM * scale
    content = "\n".join([_shape(stator, k), _artwork(stator, k),
                         _shape(rotor, k), _artwork(rotor, k)])
    half = max(_extent(stator), _extent(rotor)) * k + 5
    return _document(content, half)
