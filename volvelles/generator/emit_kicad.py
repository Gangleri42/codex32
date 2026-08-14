"""Write KiCad 7 board files from wheel primitives.

Page space (pt, Y up, angles CCW) maps to sheet space (mm, Y down) about the
sheet center. Positions flip in Y; rotation angles pass through unchanged
because both KiCad and PostScript treat positive as visually counterclockwise.

Gold artwork is emitted twice: on the copper layer and, with slightly wider
strokes, on the mask layer, so the ENIG-plated copper shows through the black
solder mask with a registration margin.

Back-face artwork (Board.back_items) goes to B.Cu/B.Mask mirrored about the
sheet's vertical centerline with negated text angles and (justify mirror),
which is KiCad's convention for text that reads correctly from the back
(verified against kicad-cli --mirror output). Board cutouts are front-only.

Symbol texts use DejaVu Sans: KiCad's stroke font lacks aleph and the card
suits, and renders the pilcrow like a pi, which a lookup wheel cannot afford.
"""

import math
import uuid
from wheels import (Board, Circle, EdgeArc, EdgeCircle, EdgeSeg, Poly, Seg,
                    Text, Window, CAP, PT_MM, polar)

SHEET_CX, SHEET_CY = 297, 210  # A2 center
MASK_BLOOM = 0.1
EDGE_W = 0.1
WINDOW_CORNER_R = 0.8
UUID_NS = uuid.UUID("f7b5e1a2-4c3d-4e0f-9a86-2f0d54c0de32")

HEADER = """(kicad_pcb (version 20221018) (generator vovelle_gen)
  (general (thickness 1.6))
  (paper "A2")
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (32 "B.Adhes" user "B.Adhesive")
    (33 "F.Adhes" user "F.Adhesive")
    (34 "B.Paste" user)
    (35 "F.Paste" user)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user)
    (39 "F.Mask" user)
    (40 "Dwgs.User" user "User.Drawings")
    (41 "Cmts.User" user "User.Comments")
    (42 "Eco1.User" user "User.Eco1")
    (43 "Eco2.User" user "User.Eco2")
    (44 "Edge.Cuts" user)
    (45 "Margin" user)
    (46 "B.CrtYd" user "B.Courtyard")
    (47 "F.CrtYd" user "F.Courtyard")
    (48 "B.Fab" user)
    (49 "F.Fab" user)
  )
  (setup (pad_to_mask_clearance 0))
  (net 0 "")
"""


def fmt(v: float) -> str:
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


class Emitter:
    def __init__(self, board: Board, scale: float):
        self.k = PT_MM * scale
        self.board = board
        self.lines = [HEADER]
        self.n = 0

    def uid(self) -> str:
        self.n += 1
        return str(uuid.uuid5(UUID_NS, f"{self.board.name}:{self.n}"))

    def xy(self, x: float, y: float, back: bool) -> tuple[float, float]:
        if back:
            return SHEET_CX - x * self.k, SHEET_CY - y * self.k
        return SHEET_CX + x * self.k, SHEET_CY - y * self.k

    def add(self, s: str):
        self.lines.append("  " + s + "\n")

    def gold_layers(self, back: bool):
        return (("B.Cu", 0), ("B.Mask", MASK_BLOOM)) if back else (("F.Cu", 0), ("F.Mask", MASK_BLOOM))

    def text(self, t: Text, back: bool):
        x, y = self.xy(t.x, t.y, back)
        h = CAP * t.size * self.k
        w = max(0.16, h / 6)
        face = '(face "DejaVu Sans") ' if t.symbol else ""
        angle = (-t.angle if back else t.angle) % 360
        justify = " (justify mirror)" if back else ""
        for layer, bloom in self.gold_layers(back):
            self.add(
                f'(gr_text "{t.s}" (at {fmt(x)} {fmt(y)} {fmt(angle)}) '
                f'(layer "{layer}") (tstamp {self.uid()}) '
                f"(effects (font {face}(size {fmt(h)} {fmt(h)}) (thickness {fmt(w + bloom)})){justify}))"
            )

    def circle(self, c: Circle, back: bool):
        x, y = self.xy(c.x, c.y, back)
        w = max(0.15, c.width * self.k)
        for layer, bloom in self.gold_layers(back):
            self.add(
                f"(gr_circle (center {fmt(x)} {fmt(y)}) (end {fmt(x + c.r * self.k)} {fmt(y)}) "
                f"(stroke (width {fmt(w + bloom)}) (type default)) (fill none) "
                f'(layer "{layer}") (tstamp {self.uid()}))'
            )

    def seg(self, s: Seg, back: bool):
        x1, y1 = self.xy(s.x1, s.y1, back)
        x2, y2 = self.xy(s.x2, s.y2, back)
        w = max(0.15, s.width * self.k)
        for layer, bloom in self.gold_layers(back):
            self.add(
                f"(gr_line (start {fmt(x1)} {fmt(y1)}) (end {fmt(x2)} {fmt(y2)}) "
                f"(stroke (width {fmt(w + bloom)}) (type default)) "
                f'(layer "{layer}") (tstamp {self.uid()}))'
            )

    def poly(self, p: Poly, back: bool):
        pts = " ".join(f"(xy {fmt(x)} {fmt(y)})"
                       for x, y in (self.xy(*pt, back) for pt in p.pts))
        for layer, _ in self.gold_layers(back):
            self.add(
                f"(gr_poly (pts {pts}) (stroke (width 0) (type default)) (fill solid) "
                f'(layer "{layer}") (tstamp {self.uid()}))'
            )

    def edge_line(self, x1, y1, x2, y2):
        self.add(
            f"(gr_line (start {fmt(x1)} {fmt(y1)}) (end {fmt(x2)} {fmt(y2)}) "
            f'(stroke (width {fmt(EDGE_W)}) (type default)) (layer "Edge.Cuts") (tstamp {self.uid()}))'
        )

    def edge_arc_pts(self, start, mid, end):
        self.add(
            f"(gr_arc (start {fmt(start[0])} {fmt(start[1])}) (mid {fmt(mid[0])} {fmt(mid[1])}) "
            f"(end {fmt(end[0])} {fmt(end[1])}) "
            f'(stroke (width {fmt(EDGE_W)}) (type default)) (layer "Edge.Cuts") (tstamp {self.uid()}))'
        )

    def edge_circle(self, c: EdgeCircle):
        x, y = self.xy(c.x, c.y, False)
        self.add(
            f"(gr_circle (center {fmt(x)} {fmt(y)}) (end {fmt(x + c.r * self.k)} {fmt(y)}) "
            f'(stroke (width {fmt(EDGE_W)}) (type default)) (fill none) '
            f'(layer "Edge.Cuts") (tstamp {self.uid()}))'
        )

    def edge_arc(self, a: EdgeArc):
        a2 = a.a2 if a.a2 > a.a1 else a.a2 + 360
        pts = []
        for ang in (a.a1, (a.a1 + a2) / 2, a2):
            px, py = polar(a.r, ang)
            pts.append(self.xy(a.x + px, a.y + py, False))
        self.edge_arc_pts(*pts)

    def window(self, win: Window):
        x, y = self.xy(win.x, win.y, False)
        hx, hy = win.w * self.k / 2, win.h * self.k / 2
        r = min(WINDOW_CORNER_R, hx / 2, hy / 2)
        self.edge_line(x - hx + r, y - hy, x + hx - r, y - hy)
        self.edge_line(x + hx, y - hy + r, x + hx, y + hy - r)
        self.edge_line(x + hx - r, y + hy, x - hx + r, y + hy)
        self.edge_line(x - hx, y + hy - r, x - hx, y - hy + r)
        # corner arcs: from the end of one side to the start of the next
        d = r * math.sqrt(2) / 2
        self.edge_arc_pts((x + hx - r, y - hy), (x + hx - r + d, y - hy + r - d), (x + hx, y - hy + r))
        self.edge_arc_pts((x + hx, y + hy - r), (x + hx - r + d, y + hy - r + d), (x + hx - r, y + hy))
        self.edge_arc_pts((x - hx + r, y + hy), (x - hx + r - d, y + hy - r + d), (x - hx, y + hy - r))
        self.edge_arc_pts((x - hx, y - hy + r), (x - hx + r - d, y - hy + r - d), (x - hx + r, y - hy))

    def dispatch(self, item, back: bool):
        kind = type(item)
        if kind is Text:
            self.text(item, back)
        elif kind is Circle:
            self.circle(item, back)
        elif kind is Seg:
            self.seg(item, back)
        elif kind is Poly:
            self.poly(item, back)
        else:
            if back:
                raise ValueError(f"cutout {item} on the back face; edges are front-only")
            if kind is EdgeCircle:
                self.edge_circle(item)
            elif kind is EdgeArc:
                self.edge_arc(item)
            elif kind is EdgeSeg:
                self.edge_line(*self.xy(item.x1, item.y1, False),
                               *self.xy(item.x2, item.y2, False))
            else:
                self.window(item)

    def run(self) -> str:
        for item in self.board.items:
            self.dispatch(item, back=False)
        for item in self.board.back_items:
            self.dispatch(item, back=True)
        self.lines.append(")\n")
        return "".join(self.lines)


def emit(board: Board, scale: float) -> str:
    return Emitter(board, scale).run()
