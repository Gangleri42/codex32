// Draws each volvelle face (rings, pointers, glyphs, labels) into a canvas
// texture.  The item lists mirror generator/wheels.py one-for-one so the web
// wheels carry the same glyphs the printed/PCB wheels do.

export const CAP = 0.56; // Courier cap height per em
const D2R = Math.PI / 180;

export const rotate = (x, y, deg) => {
  const a = deg * D2R;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

export const polar = (r, deg) => [r * Math.cos(deg * D2R), r * Math.sin(deg * D2R)];

export const arcText = (s, size, centerAngle, radius, outside, charWidth = 0.55) => {
  const xr = outside ? radius + size / 4 : radius - size / 3;
  const chars = [...s];
  const half = chars.map(() => ((charWidth * size) / 2 / xr) / D2R);
  const total = half.reduce((a, b) => a + b, 0) * 2;
  let a = outside ? centerAngle + total / 2 : centerAngle - total / 2;
  const out = [];
  chars.forEach((ch, i) => {
    const h = half[i];
    const ca = outside ? a - h : a + h;
    const [x, y] = polar(radius + ((CAP * size) / 2) * (outside ? 1 : -1), ca);
    out.push({ kind: "text", x, y, angle: outside ? ca - 90 : ca + 90, size, s: ch });
    a += outside ? -2 * h : 2 * h;
  });
  return out;
};

const pointer = (x, y, sz, rot = 0) => {
  const pts = [
    [x, y],
    [x + sz / 2, y - sz],
    [x - sz / 2, y - sz],
  ];
  return { kind: "poly", pts: pts.map(([px, py]) => rotate(px, py, rot)) };
};

const text = (x, y, angle, size, s, symbol = false) => ({ kind: "text", x, y, angle, size, s, symbol });
const circle = (x, y, r, width) => ({ kind: "circle", x, y, r, width });
const seg = (x1, y1, x2, y2, width) => ({ kind: "seg", x1, y1, x2, y2, width });
const poly = (pts) => ({ kind: "poly", pts });
const windowRect = (x, y, w, h) => ({ kind: "window", x, y, w, h });

export function additionStatorItems(data) {
  const { code } = data;
  const g = data.geometry.addition;
  const items = [circle(0, 0, g.discR, 1.0)];
  items.push(...arcText("Addition", 12, 270, 30, false));
  for (let k = 0; k < 8; k++) items.push(...arcText("Addition", 6, 16.875 + 45 * k, 262, true));
  const rim = data.addition.rim;
  for (let i = 0; i < rim.length; i++) {
    const [x, y] = rotate(0, g.rimR + (CAP * 18) / 2, g.rimStep * i);
    items.push(text(x, y, g.rimStep * i, 18, rim[i]));
  }
  for (let ring = 0; ring < 32; ring++) {
    const [bx, by] = g.spiral[ring];
    for (let i = 0; i < 32; i++) {
      const [x, y] = rotate(bx, by - 3 + (CAP * 12) / 2, g.rimStep * i);
      items.push(text(x, y, g.rimStep * i, 12, data.addition.table[ring][i]));
    }
  }
  return items;
}

export function additionRotorItems(data) {
  const g = data.geometry.addition;
  const items = [...arcText("codex32", 12, 270, 263, false)];
  for (let ring = 0; ring < 32; ring++) {
    const [wx, wy] = g.spiral[ring];
    items.push(windowRect(wx, wy, g.window, g.window));
    items.push(text(wx - 18.4, wy + 0.36, 0, 12, data.addition.window_labels[ring]));
    items.push(seg(wx - 12.8, wy - 0.5, wx - 8.8, wy - 0.5, 0.6));
    items.push(poly([[wx - 6.8, wy - 0.5], [wx - 8.8, wy - 2.5], [wx - 8.8, wy + 1.5]]));
    items.push(poly([[wx - 14.8, wy - 0.5], [wx - 12.8, wy - 2.5], [wx - 12.8, wy + 1.5]]));
  }
  items.push(poly([[0, g.discR], [10, g.discR - 20], [-10, g.discR - 20]]));
  return items;
}

export function bStatorItems(data, face) {
  const B = data.geometry.familyB;
  const items = [circle(0, 0, face.innerRadius, B.thick ?? 1.4)];
  for (let k = 0; k < 8; k++) {
    items.push(...arcText(face.title, B.titleSize, 22.5 + 45 * k, B.radius - B.titleSize, true));
  }
  const base = B.radius - B.titleSize - 0.8 * B.glyphSize + (CAP * B.glyphSize) / 2;
  face.rim.forEach((g, k) => {
    const [x, y] = rotate(0, base, B.step * k);
    items.push(text(x, y, B.step * k, B.glyphSize, g, face.rimSymbol));
    if (face.rimPtr) items.push(pointer(0, face.innerRadius, face.rimPtr, B.step * k));
  });
  return items;
}

export function bRotorItems(data, name) {
  const B = data.geometry.familyB;
  const face = data.familyB[name];
  const ir = face.innerRadius;
  const winLo = ir - face.rimPtr;
  const winHi = B.radius - B.titleSize;
  const items = [windowRect(0, (winLo + winHi) / 2, 0.6 * B.glyphSize * 1.2, winHi - winLo)];
  if (face.handlePtr) items.push(pointer(0, B.radius - B.titleSize, face.handlePtr));
  items.push(...arcText(face.title, 12, 270, 30, false));
  const base = ir - 0.8 * B.glyphSize - face.innerPtr + (CAP * B.glyphSize) / 2;
  face.inner.forEach((g, k) => {
    if (g !== " ") {
      const [x, y] = rotate(0, base, B.step * k);
      items.push(text(x, y, B.step * k, B.glyphSize, g, face.innerSymbol));
    }
    if (face.innerPtr) items.push(pointer(0, ir, face.innerPtr, B.step * k));
  });
  if (name === "translation") {
    const y = 209;
    items.push(text(-16, y + (CAP * 27) / 2 - 6, 0, 27, "Q"));
    items.push(text(16, y + (CAP * 27) / 2 - 6, 0, 27, "Q"));
    items.push(seg(-5, y, 5, y, 1.4));
    items.push(poly([[9, y], [5, y - 3], [5, y + 3]]));
    items.push(poly([[-9, y], [-5, y - 3], [-5, y + 3]]));
  }
  if (name === "recovery") {
    const bigR = ir - B.glyphSize - 1;
    for (let k = 1; k < 16; k++) {
      const [x, y] = rotate(0, bigR, -B.step * k);
      items.push(circle(x, y, 1, 0.4));
      items.push(circle(-x, y, 1, 0.4));
    }
    items.push(text(0, 154 + (CAP * 8) / 2, 0, 8, "share to"));
    items.push(text(0, 146 + (CAP * 8) / 2, 0, 8, "translate"));
    items.push(seg(0, 162, 0, 171, 1));
    items.push(poly([[0, 176], [3.5, 169], [-3.5, 169]]));
  }
  return items;
}

// Outline polygons, ported from emit_solid._outline_points.
function arcPts(cx, cy, r, a1, a2, step = 1.5) {
  if (a2 <= a1) a2 += 360;
  const n = Math.max(6, Math.ceil((a2 - a1) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a1 + ((a2 - a1) * i) / n) * D2R;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export function outlinePoints(shape, data) {
  const B = data.geometry.familyB;
  if (shape[0] === "addition_rotor") {
    const g = data.geometry.addition;
    const pts = arcPts(0, 0, g.handleR, 140, 400);
    pts.push(polar(g.discR, 40));
    pts.push(...arcPts(0, 0, g.discR, 40, 140).slice(1));
    return pts;
  }
  if (shape[0] === "b_rotor") {
    const ir = shape[1];
    const hw = B.handleW / 2;
    const capR = 5;
    const tabBase = Math.sqrt(ir * ir - hw * hw);
    const theta = (Math.atan2(tabBase, hw) / D2R + 360) % 360;
    const pts = arcPts(0, 0, ir, 180 - theta, 360 + theta);
    pts.push([hw, B.tabTop - capR]);
    pts.push(...arcPts(hw - capR, B.tabTop - capR, capR, 0, 90, 4).slice(1));
    pts.push([-hw + capR, B.tabTop]);
    pts.push(...arcPts(-hw + capR, B.tabTop - capR, capR, 90, 180, 4).slice(1));
    return pts;
  }
  throw new Error(`no outline for shape ${shape[0]}`);
}

export function circlePoints(r, segments = 96) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

// Window/pivot holes for a face, as closed point loops.
export function holeLoops(items, { shape, pivotR, includeWindows = true }) {
  const holes = [circlePoints(pivotR, 48)];
  if (includeWindows) {
    for (const it of items) {
      if (it.kind !== "window") continue;
      const hw = it.w / 2;
      const hh = it.h / 2;
      holes.push([
        [it.x - hw, it.y - hh],
        [it.x + hw, it.y - hh],
        [it.x + hw, it.y + hh],
        [it.x - hw, it.y + hh],
      ]);
    }
  }
  return holes;
}

const FONT_LETTER = '700 {SIZE}px "CX Mono", "DejaVu Sans Mono", "SFMono-Regular", Menlo, Consolas, monospace';
const FONT_SYMBOL = '700 {SIZE}px "CX Symbols", "DejaVu Sans", "Segoe UI Symbol", "Noto Sans Symbols 2", system-ui, sans-serif';

// The source sizes glyphs for Courier (cap height 0.56 em).  The embedded
// DejaVu faces are much taller (0.73 em), so scale them back to the paper's cap
// height; letters keep their advance (DejaVu Mono 0.602 em ~ Courier 0.6 em) and
// are squished vertically, symbols scale uniformly as in emit_svg.py.
const PS_CAP = 0.56;
const FONT_CAP = 0.73;

// Render one face into a canvas.  `extent` is the half-width, in page units,
// that the canvas covers; the canvas is square.
export function renderFace(items, { extent, size = 2048, ink = "#e6b24c", board = "#08090b" }) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const s = size / (2 * extent);
  const c = size / 2;
  const toX = (x) => c + x * s;
  const toY = (y) => c - y * s;

  ctx.clearRect(0, 0, size, size);
  const vignette = ctx.createRadialGradient(c, c * 0.9, size * 0.05, c, c, size * 0.72);
  vignette.addColorStop(0, "#11141b");
  vignette.addColorStop(1, board);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  for (const it of items) {
    if (it.kind === "circle") {
      const w = Math.max(it.width * s, 1.2);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(toX(it.x), toY(it.y), it.r * s, 0, Math.PI * 2);
      ctx.stroke();
    } else if (it.kind === "seg") {
      ctx.lineWidth = Math.max(it.width * s, 1.2);
      ctx.beginPath();
      ctx.moveTo(toX(it.x1), toY(it.y1));
      ctx.lineTo(toX(it.x2), toY(it.y2));
      ctx.stroke();
    } else if (it.kind === "poly") {
      ctx.beginPath();
      it.pts.forEach(([x, y], i) => {
        const px = toX(x);
        const py = toY(y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    } else if (it.kind === "window") {
      ctx.lineWidth = Math.max(0.5 * s, 1.2);
      ctx.strokeRect(toX(it.x - it.w / 2), toY(it.y + it.h / 2), it.w * s, it.h * s);
    } else if (it.kind === "text") {
      const px = toX(it.x);
      const py = toY(it.y);
      const fontSize = it.size * s;
      const scale = PS_CAP / FONT_CAP;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-it.angle * D2R);
      ctx.scale(it.symbol ? scale : 1, scale);
      ctx.font = it.symbol
        ? FONT_SYMBOL.replace("{SIZE}", fontSize.toFixed(2))
        : FONT_LETTER.replace("{SIZE}", fontSize.toFixed(2));
      // The item position is the cap centre; drop the baseline half a cap below.
      ctx.fillText(it.s, 0, (FONT_CAP * fontSize) / 2);
      ctx.restore();
    }
  }
  return canvas;
}
