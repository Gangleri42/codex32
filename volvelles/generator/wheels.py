"""Addition-volvelle geometry, ported from drawBottomWheelPage and
showTopWheelPage in SSS32 (2023-03-07 bw edition).

All coordinates are PostScript points with Y up and angles in degrees
counterclockwise, exactly as in the source; the emitters convert to their
own conventions. Everything drawable is gold (copper + mask opening);
Edge* and Window items are board cutouts.
"""

import math
from dataclasses import dataclass, field

PT_MM = 25.4 / 72
CAP = 0.56  # Courier cap height per em; converts baseline anchors to centers

MAGIC = 94            # spiral step per ring, degrees (/magic)
RIM_STEP = -360 / 32  # rim step, clockwise (/angle)
RIM_R = math.sqrt(38) * 40
DISC_R = 240          # rotor edge; alignment circle on the stator
STATOR_EDGE_R = 268
HANDLE_R = 290
WINDOW = 12

THIN = 0.4
THICK = 1.4

B_RADIUS = 200        # family-B disc edge (fusion / translation / recovery)
B_TITLE_SZ = 6
B_GLYPH_SZ = 18
B_STEP = -360 / 31    # 31 nonzero field elements around the rim, clockwise
B_HANDLE_W = 54
B_TAB_TOP = B_RADIUS + 27  # paper folds here; the PCB tab just ends
B_CAP_R = 5


@dataclass
class Text:
    x: float
    y: float
    angle: float
    size: float  # PS font size; cap height is CAP * size
    s: str
    symbol: bool = False  # code2 glyphs need an outline font, see emit_kicad


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
    w: float
    h: float


@dataclass
class Board:
    name: str
    items: list
    shape: tuple  # svg preview outline: ("circle", r) | ("addition_rotor",) | ("b_rotor", inner_r)
    back_items: list = field(default_factory=list)


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
    return Board("addition-stator", items, ("circle", STATOR_EDGE_R)), table


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
        items.append(Window(wx, wy, WINDOW, WINDOW))
        items.append(Text(wx - 18.4, wy + 0.36, 0, 12, code[perm_v[31 - ring]]))
        items.append(Seg(wx - 12.8, wy - 0.5, wx - 8.8, wy - 0.5, 0.6))
        items.append(Poly([(wx - 6.8, wy - 0.5), (wx - 8.8, wy - 2.5), (wx - 8.8, wy + 1.5)]))
        items.append(Poly([(wx - 14.8, wy - 0.5), (wx - 12.8, wy - 2.5), (wx - 12.8, wy + 1.5)]))
    return Board("addition-rotor", items, ("addition_rotor",))


@dataclass
class DiscSpec:
    """One family-B wheel face: fusion, translation, or recovery.

    Pointer sizes follow the PS conventions: positive points outward from the
    given radius, negative inward, zero draws nothing.
    """
    name: str
    title: str
    rim: list[str]    # 31 glyphs clockwise from the top, on the bottom disc
    inner: list[str]  # 31 glyphs on the rotating top disc; " " leaves a gap
    rim_symbol: bool
    inner_symbol: bool
    rim_ptr: float    # outerPointerSz
    inner_ptr: float  # innerPointerSz
    handle_ptr: float

    @property
    def inner_radius(self) -> float:
        return B_RADIUS - B_TITLE_SZ - B_GLYPH_SZ + self.rim_ptr


def pointer(x: float, y: float, sz: float, rot: float = 0) -> Poly:
    """drawPointer: triangle with its apex at (x, y), pointing up for sz > 0."""
    pts = [(x, y), (x + sz / 2, y - sz), (x - sz / 2, y - sz)]
    return Poly([rotate(px, py, rot) for px, py in pts])


def b_stator_face(spec: DiscSpec, pivot_r: float, with_edge: bool) -> list:
    """One face of a family-B bottom disc: rim ring plus repeated titles."""
    items = []
    if with_edge:
        items += [EdgeCircle(0, 0, B_RADIUS), EdgeCircle(0, 0, pivot_r)]
    items.append(Circle(0, 0, spec.inner_radius, THICK))
    for k in range(8):
        items += arc_text(spec.title, B_TITLE_SZ, 22.5 + 45 * k,
                          B_RADIUS - B_TITLE_SZ, outside=True)
    base = B_RADIUS - B_TITLE_SZ - 0.8 * B_GLYPH_SZ + CAP * B_GLYPH_SZ / 2
    for k, g in enumerate(spec.rim):
        x, y = rotate(0, base, B_STEP * k)
        items.append(Text(x, y, B_STEP * k, B_GLYPH_SZ, g, spec.rim_symbol))
        if spec.rim_ptr:
            items.append(pointer(0, spec.inner_radius, spec.rim_ptr, B_STEP * k))
    return items


def b_rotor(spec: DiscSpec, pivot_r: float, decor: list) -> Board:
    """A family-B top disc: glyph ring, grip tab with the rim window, title."""
    ir = spec.inner_radius
    hw = B_HANDLE_W / 2
    gap = math.degrees(math.asin(hw / ir))
    tab_base = math.sqrt(ir * ir - hw * hw)
    win_lo, win_hi = ir - spec.rim_ptr, B_RADIUS - B_TITLE_SZ
    items = [
        EdgeArc(0, 0, ir, 90 + gap, 90 - gap),
        EdgeSeg(hw, tab_base, hw, B_TAB_TOP - B_CAP_R),
        EdgeArc(hw - B_CAP_R, B_TAB_TOP - B_CAP_R, B_CAP_R, 0, 90),
        EdgeSeg(hw - B_CAP_R, B_TAB_TOP, -hw + B_CAP_R, B_TAB_TOP),
        EdgeArc(-hw + B_CAP_R, B_TAB_TOP - B_CAP_R, B_CAP_R, 90, 180),
        EdgeSeg(-hw, B_TAB_TOP - B_CAP_R, -hw, tab_base),
        EdgeCircle(0, 0, pivot_r),
        Window(0, (win_lo + win_hi) / 2, 0.6 * B_GLYPH_SZ * 1.2, win_hi - win_lo),
    ]
    if spec.handle_ptr:
        items.append(pointer(0, B_RADIUS - B_TITLE_SZ, spec.handle_ptr))
    items += arc_text(spec.title, 12, 270, 30, outside=False)
    base = ir - 0.8 * B_GLYPH_SZ - spec.inner_ptr + CAP * B_GLYPH_SZ / 2
    for k, g in enumerate(spec.inner):
        if g != " ":
            x, y = rotate(0, base, B_STEP * k)
            items.append(Text(x, y, B_STEP * k, B_GLYPH_SZ, g, spec.inner_symbol))
        if spec.inner_ptr:
            items.append(pointer(0, ir, spec.inner_ptr, B_STEP * k))
    return Board(f"{spec.name}-rotor", items + decor, ("b_rotor", ir))


def translation_tab_decor() -> list:
    """The Q<->Q mark on the tab: value zero maps to itself at any setting."""
    y = 209
    return [
        Text(-16, y + CAP * 27 / 2 - 6, 0, 27, "Q"),
        Text(16, y + CAP * 27 / 2 - 6, 0, 27, "Q"),
        Seg(-5, y, 5, y, 1.4),
        Poly([(9, y), (5, y - 3), (5, y + 3)]),
        Poly([(-9, y), (-5, y - 3), (-5, y + 3)]),
    ]


def recovery_rotor_decor(inner_radius: float) -> list:
    """Pair markers and the window caption from the recovery top disc."""
    big_r = inner_radius - B_GLYPH_SZ - 1
    items = []
    for k in range(1, 16):
        x, y = rotate(0, big_r, -B_STEP * k)
        items += [Circle(x, y, 1, THIN), Circle(-x, y, 1, THIN)]
    items += [
        Text(0, 154 + CAP * 8 / 2, 0, 8, "share to"),
        Text(0, 146 + CAP * 8 / 2, 0, 8, "translate"),
        Seg(0, 162, 0, 171, 1),
        Poly([(0, 176), (3.5, 169), (-3.5, 169)]),
    ]
    return items
