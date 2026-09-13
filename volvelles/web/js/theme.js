// Theme and colour cast.  The greyscale e-ink tokens live in css/app.css; this
// module resolves the system light/dark choice for the JS-rendered assets (the
// SVG wheel and the three.js instrument), and owns the warm/cold cast that
// tints the whole app.

const CAST_KEY = "codex32-volvelles.cast.v1";

// Palette for the SVG and three.js assets.  The UI itself uses the CSS tokens.
export const palettes = {
  light: {
    ink: "#2b2b2b",
    muted: "#656565",
    plate: "#f4f4f2",
    plateTop: "#fafaf8",
    plateEdge: "#a6a6a1",
    stage: "#e3e3e0",
    board: "#f4f4f2",
    boardTop: "#fafaf8",
    edge: "#3a3a3a",
  },
  dark: {
    ink: "#c9c9c9",
    muted: "#8f8f8f",
    plate: "#1d1d1d",
    plateTop: "#242424",
    plateEdge: "#4a4a4a",
    stage: "#1c1c1c",
    board: "#1d1d1d",
    boardTop: "#242424",
    edge: "#101010",
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

// --- warm/cold cast --------------------------------------------------------

const CASTS = {
  warm: { hue: 36, sat: 0.4, amount: 0.12 },
  cold: { hue: 208, sat: 0.32, amount: 0.1 },
};
const castListeners = new Set();

function loadCast() {
  try {
    const value = localStorage.getItem(CAST_KEY);
    if (value === "warm" || value === "cold") return value;
  } catch {
    /* storage unavailable */
  }
  return "warm";
}

let cast = loadCast();

export function getCast() {
  return cast;
}

export function getTint() {
  return { ...CASTS[cast] };
}

export function setCast(next) {
  if (next !== "warm" && next !== "cold") return;
  cast = next;
  try {
    localStorage.setItem(CAST_KEY, cast);
  } catch {
    /* storage unavailable */
  }
  applyTint();
  for (const listener of castListeners) listener(cast);
}

export function onCastChange(callback) {
  castListeners.add(callback);
  return () => castListeners.delete(callback);
}

export const onTintChange = onCastChange;

export function applyTint() {
  const { hue, sat, amount } = CASTS[cast];
  const root = document.documentElement;
  root.style.setProperty("--tint", `hsl(${hue} ${Math.round(sat * 100)}% 50%)`);
  root.style.setProperty("--tint-amount", String(amount));
}
