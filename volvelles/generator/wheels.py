"""Addition-volvelle geometry, ported from drawBottomWheelPage and
showTopWheelPage in SSS32 (2023-03-07 bw edition).

All coordinates are PostScript points with Y up and angles in degrees
counterclockwise, exactly as in the source; the emitters convert to their
own conventions. Everything drawable is gold (copper + mask opening);
Edge* and Window items are board cutouts.
"""

import math
from dataclasses import dataclass

PT_MM = 25.4 / 72
CAP = 0.56  # Courier cap height per em; converts baseline anchors to centers

MAGIC = 94            # spiral step per ring, degrees (/magic)
RIM_STEP = -360 / 32  # rim step, clockwise (/angle)
RIM_R = math.sqrt(38) * 40
DISC_R = 240          # rotor edge; alignment circle on the stator
STATOR_EDGE_R = 268
HANDLE_R = 290
WINDOW = 12


@dataclass
class Text:
    x: float
    y: float
    angle: float
    size: float  # PS font size; cap height is CAP * size
    s: str


@dataclass
class Circle:
    x: float
    y: float
    r: float
    width: float


@dataclass
class Poly:
    pts: list[tuple[float, float]]


@dataclass
class Seg:
    x1: float
    y1: float
    x2: float
    y2: float
    width: float


@dataclass
class EdgeCircle:
    x: float
    y: float
    r: float


@dataclass
class EdgeArc:
    x: float
    y: float
    r: float
    a1: float
    a2: float  # counterclockwise from a1 to a2


@dataclass
class EdgeSeg:
    x1: float
    y1: float
    x2: float
    y2: float


@dataclass
class Window:
    x: float
    y: float
    side: float


@dataclass
class Board:
    name: str
    items: list


def rotate(x: float, y: float, deg: float) -> tuple[float, float]:
    a = math.radians(deg)
    return x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)


def polar(r: float, deg: float) -> tuple[float, float]:
    a = math.radians(deg)
    return r * math.cos(a), r * math.sin(a)


def spiral_point(ring: int) -> tuple[float, float]:
    """Center of ring's entry at rim position 0; other positions follow by RIM_STEP."""
    th = math.radians((ring + 1) * MAGIC + 24)
    lam = math.sqrt(ring + 2) * 40 - 2
    return lam * math.sin(th), -lam * math.cos(th)


def arc_text(s: str, size: float, center_angle: float, radius: float,
             outside: bool, char_width: float = 0.55) -> list[Text]:
    """Per-character text along a circle, after the Blue Book circtext procs.

    Angles are measured from +x counterclockwise; `outside` text reads with
    its top away from the center, inside text toward it.
    """
    xr = radius + size / 4 if outside else radius - size / 3
    half = [math.degrees(char_width * size / 2 / xr) for _ in s]
    total = sum(half) * 2
    texts = []
    a = center_angle + total / 2 if outside else center_angle - total / 2
    for ch, h in zip(s, half):
        ca = a - h if outside else a + h
        x, y = polar(radius + CAP * size / 2 * (1 if outside else -1), ca)
        texts.append(Text(x, y, ca - 90 if outside else ca + 90, size, ch))
        a += -2 * h if outside else 2 * h
    return texts


def addition_stator(code: list[str], perm: list[int], perm_v: list[int],
                    pivot_r: float) -> tuple[Board, list[list[str]]]:
    """The bottom wheel: full 32x32 XOR table as a glyph spiral.

    Also returns the placed table, table[ring][rim_pos], for verification.
    """
    items = [
        EdgeCircle(0, 0, STATOR_EDGE_R),
        EdgeCircle(0, 0, pivot_r),
        Circle(0, 0, DISC_R, 1.0),
    ]
    items += arc_text("Addition", 12, 270, 30, outside=False)
    for k in range(8):
        items += arc_text("Addition", 6, 16.875 + 45 * k, 262, outside=True)
    for i, p in enumerate(perm):
        x, y = rotate(0, RIM_R + CAP * 18 / 2, RIM_STEP * i)
        items.append(Text(x, y, RIM_STEP * i, 18, code[p]))
    table = []
    for ring in range(32):
        bx, by = spiral_point(ring)
        row = []
        for i, p in enumerate(perm):
            # the PS shifts the baseline down 3pt before drawing
            x, y = rotate(bx, by - 3 + CAP * 12 / 2, RIM_STEP * i)
            ch = code[p ^ perm_v[31 - ring]]
            items.append(Text(x, y, RIM_STEP * i, 12, ch))
            row.append(ch)
        table.append(row)
    return Board("addition-stator", items), table


def addition_rotor(code: list[str], perm_v: list[int], pivot_r: float) -> Board:
    """The universal top wheel: 32 windows over the spiral, labeled with the
    letter each window adds, plus the grip ring and pointer."""
    ax, ay = polar(HANDLE_R, 40)
    bx, by = polar(DISC_R, 40)
    cx, cy = polar(DISC_R, 140)
    dx, dy = polar(HANDLE_R, 140)
    items = [
        EdgeArc(0, 0, HANDLE_R, 140, 40),
        EdgeSeg(ax, ay, bx, by),
        EdgeArc(0, 0, DISC_R, 40, 140),
        EdgeSeg(cx, cy, dx, dy),
        EdgeCircle(0, 0, pivot_r),
        Poly([(0, DISC_R), (10, DISC_R - 20), (-10, DISC_R - 20)]),
    ]
    items += arc_text("codex32", 12, 270, 263, outside=False)
    for ring in range(32):
        wx, wy = spiral_point(ring)
        items.append(Window(wx, wy, WINDOW))
        items.append(Text(wx - 18.4, wy + 0.36, 0, 12, code[perm_v[31 - ring]]))
        items.append(Seg(wx - 12.8, wy - 0.5, wx - 8.8, wy - 0.5, 0.6))
        items.append(Poly([(wx - 6.8, wy - 0.5), (wx - 8.8, wy - 2.5), (wx - 8.8, wy + 1.5)]))
        items.append(Poly([(wx - 14.8, wy - 0.5), (wx - 12.8, wy - 2.5), (wx - 12.8, wy + 1.5)]))
    return Board("addition-rotor", items)
