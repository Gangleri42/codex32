// App shell: tab routing and the shared context handed to each worksheet.

import data from "./data.js";
import { mountExplore } from "./explore.js";
import { mountChecksum } from "./worksheets/checksum.js";
import { mountDice } from "./worksheets/dice.js";
import { mountSplit } from "./worksheets/split.js";
import { mountRecover } from "./worksheets/recover.js";
import { mountLearn } from "./worksheets/learn.js";
import { toast } from "./ui.js";
import { charToValue, powers } from "./gf32.js";

// Rim positions indexed by the field element they carry, so a bech32 character
// from elsewhere in the app can be found on the fusion/translation/recovery
// wheels (which are lettered with the code2 symbol alphabet).
function rimIndexByValue(instrument, value) {
  const base = data.bases[instrument];
  if (instrument === "recovery") {
    const idx = powers(base).indexOf(value ^ 16);
    return idx;
  }
  return powers(base).indexOf(value);
}

const TABS = [
  { id: "explore", mount: mountExplore },
  { id: "learn", mount: mountLearn },
  { id: "checksum", mount: mountChecksum },
  { id: "dice", mount: mountDice },
  { id: "split", mount: mountSplit },
  { id: "recover", mount: mountRecover },
];

const content = document.getElementById("tab-content");
const nav = document.getElementById("tabs");
const mounted = new Map();
const panes = new Map();

const ctx = {
  data,
  openWheel(instrument, a, b) {
    const explore = ensureTab("explore");
    activate("explore");
    if (instrument === "addition" && b != null) {
      explore.setAddOperands(a, b);
    } else if (instrument === "addition") {
      explore.selectInstrument("addition");
      explore.setSetting(data.addition.rim.indexOf(a));
    } else {
      explore.selectInstrument(instrument);
      const idx = rimIndexByValue(instrument, charToValue(a));
      if (idx >= 0) explore.setSetting(idx);
    }
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

const initial = TABS.find((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : "explore";
activate(initial);
