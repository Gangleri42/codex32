// App shell: tab routing and the shared context handed to each worksheet.

import data from "./data.js";
import { mountExplore } from "./explore.js";
import { mountBench } from "./bench.js";
import { mountChecksum } from "./worksheets/checksum.js";
import { mountDice } from "./worksheets/dice.js";
import { mountSplit } from "./worksheets/split.js";
import { mountRecover } from "./worksheets/recover.js";
import { mountLearn } from "./worksheets/learn.js";
import { mountInspector } from "./worksheets/inspector.js";
import { applyTint, getCast, onCastChange, setCast } from "./theme.js";
import { el, toast } from "./ui.js";

const TABS = [
  { id: "bench", mount: mountBench },
  { id: "explore", mount: mountExplore },
  { id: "learn", mount: mountLearn },
  { id: "checksum", mount: mountChecksum },
  { id: "dice", mount: mountDice },
  { id: "split", mount: mountSplit },
  { id: "recover", mount: mountRecover },
  { id: "inspector", mount: mountInspector },
];

const content = document.getElementById("tab-content");
const nav = document.getElementById("tabs");
const mounted = new Map();
const panes = new Map();

const ctx = {
  data,
  openWheel(instrument, a, b) {
    const bench = ensureTab("bench");
    activate("bench");
    bench.show(instrument, a, b);
    toast(`Showing ${instrument} wheel`);
  },
  sendHex(hex, target) {
    if (target === "split") {
      ensureTab("split").setSplitHex(hex);
      activate("split");
    } else {
      ensureTab("checksum").setHex(hex);
      activate("checksum");
    }
  },
};

function ensureTab(id) {
  if (!mounted.has(id)) {
    const pane = document.createElement("div");
    pane.className = "tab-pane";
    pane.dataset.tab = id;
    content.append(pane);
    panes.set(id, pane);
    const def = TABS.find((t) => t.id === id);
    mounted.set(id, def.mount(pane, ctx));
  }
  return mounted.get(id);
}

function activate(id) {
  ensureTab(id);
  for (const [key, pane] of panes) pane.classList.toggle("active", key === id);
  for (const button of nav.children) button.classList.toggle("active", button.dataset.tab === id);
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

nav.addEventListener("click", (e) => {
  const button = e.target.closest("[data-tab]");
  if (button) activate(button.dataset.tab);
});

// The canvas glyphs need the embedded fonts before the first wheel is drawn.
try {
  await Promise.all([
    document.fonts.load('700 32px "CX Symbols"'),
    document.fonts.load('700 32px "CX Mono"'),
    document.fonts.ready,
  ]);
} catch {
  /* fall back to system fonts if the loader is unavailable */
}

// Warm/cold cast switch in the header.
const castHost = document.getElementById("cast-switch");
const castButtons = {};
for (const label of ["Warm", "Cold"]) {
  const id = label.toLowerCase();
  castButtons[id] = el("button", { type: "button", text: label, onclick: () => setCast(id) });
  castHost.append(castButtons[id]);
}
function paintCast(value) {
  for (const [id, button] of Object.entries(castButtons)) button.classList.toggle("active", id === value);
}
onCastChange(paintCast);
paintCast(getCast());

const initial = TABS.find((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : "bench";
applyTint();
activate(initial);
