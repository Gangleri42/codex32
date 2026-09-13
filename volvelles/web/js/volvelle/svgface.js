// Renders the same per-face item lists face.js builds for the 3D canvas as an
// SVG, so the bench can show a clean 2D wheel by default with no extra data.
// Items are in page units (y up); the canvas renderer flips y, so this one
// maps each item to SVG space up front and keeps text upright.  The stator is
// wrapped in a group so it can be turned with one transform, not a re-render.

import {
  additionRotorItems, additionStatorItems, bRotorItems, bStatorItems,
  circlePoints, holeLoops, outlinePoints,
} from "./face.js";

const PS_CAP = 0.56;
const FONT_CAP = 0.73;

const FONT_LETTER = '"CX Mono", "DejaVu Sans Mono", "SFMono-Regular", Menlo, Consolas, monospace';
const FONT_SYMBOL = '"CX Symbols", "DejaVu Sans", "Segoe UI Symbol", "Noto Sans Symbols 2", system-ui, sans-serif';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const n = (v) => Math.round(v * 1000) / 1000;

function markup(items, size, extent, ink) {
  const c = size / 2;
  const s = size / (2 * extent);
  const map = (x, y) => [c + x * s, c - y * s];
  const out = [];
  for (const it of items) {
    if (it.kind === "circle") {
      const [px, py] = map(it.x, it.y);
      out.push(`<circle cx="${n(px)}" cy="${n(py)}" r="${n(it.r * s)}" fill="none" stroke="${ink}" stroke-width="${n(Math.max(it.width * s, 1))}"/>`);
    } else if (it.kind === "seg") {
      const [x1, y1] = map(it.x1, it.y1);
      const [x2, y2] = map(it.x2, it.y2);
      out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${ink}" stroke-width="${n(Math.max(it.width * s, 1))}" stroke-linecap="round"/>`);
    } else if (it.kind === "poly") {
      const pts = it.pts.map(([x, y]) => map(x, y).map(n).join(",")).join(" ");
      out.push(`<polygon points="${pts}" fill="${ink}"/>`);
    } else if (it.kind === "window") {
      const [px, py] = map(it.x, it.y);
      out.push(`<rect x="${n((-it.w / 2) * s)}" y="${n((-it.h / 2) * s)}" width="${n(it.w * s)}" height="${n(it.h * s)}" fill="none" stroke="${ink}" stroke-width="${n(Math.max(0.5 * s, 1))}" transform="translate(${n(px)},${n(py)})"/>`);
    } else if (it.kind === "text") {
      const [px, py] = map(it.x, it.y);
      const fontSize = it.size * s;
      const scale = PS_CAP / FONT_CAP;
      const sx = it.symbol ? scale : 1;
      const font = it.symbol ? FONT_SYMBOL : FONT_LETTER;
      out.push(
        `<g transform="translate(${n(px)},${n(py)}) rotate(${n(-it.angle)}) scale(${n(sx)},${n(scale)})">` +
          `<text x="0" y="${n((FONT_CAP * fontSize) / 2)}" font-family='${font}' font-weight="700" font-size="${n(fontSize)}" fill="${ink}" text-anchor="middle">${esc(it.s)}</text>` +
          `</g>`,
      );
    }
  }
  return out.join("");
}

const pivotRadius = (data) => data.geometry.addition.statorEdgeR * 0.012;

export function instrumentConfig(data, name) {
  const pivotR = pivotRadius(data);
  if (name === "addition") {
    const g = data.geometry.addition;
    const rotorItems = additionRotorItems(data);
    return {
      statorItems: additionStatorItems(data),
      rotorItems,
      statorOutline: circlePoints(g.statorEdgeR, 128),
      statorHoles: [circlePoints(pivotR, 48)],
      rotorOutline: outlinePoints(["addition_rotor"], data),
      rotorHoles: holeLoops(rotorItems, { pivotR, includeWindows: true }),
      statorExtent: g.statorEdgeR * 1.12,
      rotorExtent: g.handleR * 1.1,
      stepDeg: g.rimStep,
      detents: 32,
    };
  }
  const B = data.geometry.familyB;
  const face = data.familyB[name];
  const rotorItems = bRotorItems(data, name);
  return {
    statorItems: bStatorItems(data, face),
    rotorItems,
    statorOutline: circlePoints(B.radius, 128),
    statorHoles: [circlePoints(pivotR, 48)],
    rotorOutline: outlinePoints(["b_rotor", face.innerRadius], data),
    rotorHoles: holeLoops(rotorItems, { pivotR, includeWindows: true }),
    statorExtent: B.radius * 1.15,
    rotorExtent: B.tabTop * 1.12,
    stepDeg: B.step,
    detents: 31,
  };
}

// A filled disc with its holes cut out, so the plate below only shows through
// the windows rather than bleeding everywhere.
function boardPath(loops, holes, size, extent) {
  const c = size / 2;
  const s = size / (2 * extent);
  const loop = (pts) => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${n(c + x * s)} ${n(c - y * s)}`).join(" ") + " Z";
  return [...loops, ...holes].map(loop).join(" ");
}

// The full <svg>; the stator carries class "stator" so bench.js can set its
// transform.  A detent turns the stator by detent*stepDeg in SVG space.  Flat
// plate fills so the wheel reads as paper or e-ink, never a gradient.
export function instrumentSvg(data, name, { size = 900, palette } = {}) {
  const cfg = instrumentConfig(data, name);
  const extent = Math.max(cfg.statorExtent, cfg.rotorExtent);
  const ink = palette?.ink ?? "#141414";
  const plate = palette?.plate ?? "#f1f1ef";
  const plateTop = palette?.plateTop ?? "#f9f9f7";
  const edge = palette?.plateEdge ?? "#8a8a86";
  const stator = markup(cfg.statorItems, size, extent, ink);
  const rotor = markup(cfg.rotorItems, size, extent, ink);
  const statorBoard = boardPath([cfg.statorOutline], cfg.statorHoles, size, extent);
  const rotorBoard = boardPath([cfg.rotorOutline], cfg.rotorHoles, size, extent);
  return (
    `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${statorBoard}" fill="${plate}" fill-rule="evenodd" stroke="${edge}" stroke-width="1.2"/>` +
    `<g class="stator">${stator}</g>` +
    `<path d="${rotorBoard}" fill="${plateTop}" fill-rule="evenodd" stroke="${edge}" stroke-width="1.2"/>` +
    `<g class="rotor">${rotor}</g>` +
    `</svg>`
  );
}
