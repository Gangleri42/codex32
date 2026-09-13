// Theme and tint.  The greyscale e-ink tokens live in css/app.css; this module
// resolves the system light/dark choice for the JS-rendered assets (the SVG
// wheel and the three.js instrument), and owns the colour cast that tints the
// whole app.  System only: no theme toggle, only an optional tint.

const TINT_KEY = "codex32-volvelles.tint.v1";

// Palette for the SVG and three.js assets.  The UI itself uses the CSS tokens.
export const palettes = {
  light: {
    ink: "#141414",
    muted: "#5c5c5c",
    plate: "#f1f1ef",
    plateTop: "#f9f9f7",
    plateEdge: "#8a8a86",
    stage: "#e7e7e4",
    board: "#f2f2f0",
    boardTop: "#fbfbfa",
    edge: "#3a3a3a",
  },
  dark: {
    ink: "#ececec",
    muted: "#9a9a9a",
    plate: "#1c1c1c",
    plateTop: "#242424",
    plateEdge: "#5a5a5a",
    stage: "#101010",
    board: "#1a1a1a",
    boardTop: "#222222",
    edge: "#0a0a0a",
  },
};

export function resolvedTheme() {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function palette() {
  return palettes[resolvedTheme()];
}

export function onThemeChange(callback) {
  if (typeof matchMedia !== "function") return () => {};
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

// --- tint ------------------------------------------------------------------

const DEFAULTS = { hue: 38, sat: 0.5, amount: 0.16 };
const tintListeners = new Set();

function loadTint() {
  try {
    const raw = localStorage.getItem(TINT_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

let tint = loadTint();

export function getTint() {
  return { ...tint };
}

export function tintColor({ hue = tint.hue, sat = tint.sat } = {}) {
  return `hsl(${Math.round(hue)} ${Math.round(sat * 100)}% 50%)`;
}

export function applyTint() {
  const root = document.documentElement;
  root.style.setProperty("--tint", tintColor());
  root.style.setProperty("--tint-amount", String(tint.amount));
}

export function setTint(next) {
  tint = { ...tint, ...next };
  try {
    localStorage.setItem(TINT_KEY, JSON.stringify(tint));
  } catch {
    /* storage unavailable */
  }
  applyTint();
  for (const listener of tintListeners) listener(tint);
}

export function onTintChange(callback) {
  tintListeners.add(callback);
  return () => tintListeners.delete(callback);
}
