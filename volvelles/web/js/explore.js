// Explore tab: the interactive 3D volvelles plus a live readout of what the
// current wheel setting shows.

import { charToValue, valueToChar } from "./gf32.js";
import { el, select } from "./ui.js";
import { Volvelle3D } from "./volvelle/wheel3d.js";
import { getTint, onCastChange, onThemeChange, palette } from "./theme.js";

const INSTRUMENTS = [
  { name: "addition", label: "Addition", blurb: "XOR two characters. Turn the wheel to set the first character, then read the window labelled with the second." },
  { name: "fusion", label: "Fusion", blurb: "Multiplication over GF(32). The window shows the multiplier; each inner glyph points at its product on the outer ring." },
  { name: "translation", label: "Translation", blurb: "The other face of the fusion disc: a decoder ring that translates a share by a factor." },
  { name: "recovery", label: "Recovery", blurb: "Turn to the share you are translating, then read the factors aimed at the other share indices." },
];

export function mountExplore(root, ctx) {
  const { data } = ctx;
  let current = "addition";
  const state = { addB: "A" };

  const viewport = el("div", { class: "viewport", id: "viewport" });
  let volvelle;
  const chips = el("div", { class: "chips" });
  const readout = el("div", { class: "readout" });
  const blurb = el("p", { class: "blurb" });
  const range = el("input", { type: "range", min: 0, max: 31, value: 0, class: "dial" });
  const dialValue = el("span", { class: "dial-value" });
  const snap = el("input", { type: "checkbox", checked: true });
  snap.addEventListener("change", () => volvelle?.setSnap(snap.checked));
  range.addEventListener("input", () => volvelle?.setSetting(Number(range.value)));

  for (const inst of INSTRUMENTS) {
    chips.append(el("button", {
      class: `chip${inst.name === current ? " active" : ""}`,
      type: "button",
      text: inst.label,
      onclick: () => selectInstrument(inst.name),
    }));
  }

  const viewTop = el("button", { class: "ghost", type: "button", text: "Top view", onclick: () => volvelle?.setTop(true) });
  const view3d = el("button", { class: "ghost active", type: "button", text: "3D view", onclick: () => volvelle?.setTop(false) });

  const panel = el("aside", { class: "panel" },
    el("div", { class: "panel-head" },
      el("h2", { text: "Volvelle" }),
      el("p", { class: "muted", text: "Drag the lower disc · right-drag to orbit · scroll to zoom" }),
    ),
    chips,
    el("div", { class: "view-row" }, viewTop, view3d),
    blurb,
    el("div", { class: "dial-row" },
      el("label", { class: "field-label", text: "Setting" }),
      range,
      dialValue,
      el("label", { class: "snap" }, snap, " snap"),
    ),
    readout,
  );

  root.append(el("div", { class: "explore" }, viewport, panel));

  function selectInstrument(name) {
    current = name;
    [...chips.children].forEach((c, i) => c.classList.toggle("active", INSTRUMENTS[i].name === name));
    blurb.textContent = INSTRUMENTS.find((i) => i.name === name).blurb;
    range.max = (name === "addition" ? 32 : 31) - 1;
    volvelle.show(name);
  }

  function renderReadout(index) {
    dialValue.textContent = `${index + 1} / ${Number(range.max) + 1}`;
    readout.replaceChildren(...(current === "addition" ? additionReadout(index) : ringReadout(index)));
  }

  function additionReadout(j) {
    const { rim, table, window_labels: labels } = data.addition;
    const first = rim[j];
    const grid = el("div", { class: "glyph-grid" });
    labels.forEach((label, r) => {
      const result = table[r][j];
      const on = label === state.addB;
      grid.append(el("div", { class: `glyph-cell${on ? " on" : ""}`, title: `${first} ⊕ ${label} = ${result}` },
        el("span", { class: "op", text: `${first}⊕${label}` }),
        el("span", { class: "res", text: result }),
      ));
    });
    const setA = (a) => {
      const idx = rim.indexOf(a);
      if (idx >= 0) volvelle.setSetting(idx);
    };
    return [
      el("h3", { text: "Addition wheel" }),
      el("p", { class: "muted", text: `Wheel set to ${first}. Each window shows ${first} ⊕ its label.` }),
      el("div", { class: "calc-row" },
        select(rim.map((l) => ({ value: l, label: l })), first, setA),
        el("span", { class: "plus", text: "⊕" }),
        select(rim.map((l) => ({ value: l, label: l })), state.addB, (v) => { state.addB = v; renderReadout(j); }),
        el("span", { class: "result-badge", text: `${valueToChar(charToValue(first) ^ charToValue(state.addB))}` }),
      ),
      grid,
    ];
  }

  function ringReadout(p) {
    const face = data.familyB[current];
    const steps = face.rim.length;
    const rim = face.rim;
    const inner = face.inner;
    const shown = rim[p];
    const rows = el("div", { class: "map-list" });
    for (let k = 0; k < steps; k++) {
      const input = inner[k];
      if (input === " ") continue;
      const target = rim[(k + p) % steps];
      rows.append(el("div", { class: "map-row" },
        el("span", { class: "map-in", text: input }),
        el("span", { class: "map-arrow", text: "\u2192" }),
        el("span", { class: "map-out", text: target }),
      ));
    }
    const title = current === "fusion" ? "Fusion wheel" : current === "translation" ? "Translation wheel" : "Recovery wheel";
    const lead = current === "recovery"
      ? `Window is on share ${shown}. Inner symbols aim at the other share indices.`
      : `The window shows ${shown}. Every inner glyph points at its ${current === "fusion" ? "product" : "translated value"} on the rim.`;
    return [
      el("h3", { text: title }),
      el("p", { class: "muted", text: lead }),
      el("div", { class: "map-legend" }, el("span", { text: "inner glyph" }), el("span", { text: "\u2192" }), el("span", { text: "rim glyph" })),
      rows,
    ];
  }

  function wire(instance) {
    instance.onSettingChange = ({ index }) => {
      range.value = index;
      renderReadout(index);
    };
    instance.onTopChange = (on) => {
      viewTop.classList.toggle("active", on);
      view3d.classList.toggle("active", !on);
    };
  }

  function createVolvelle() {
    const instance = new Volvelle3D(viewport, data, { palette: palette(), tint: getTint() });
    instance.snap = snap.checked;
    wire(instance);
    return instance;
  }

  // The warm/cold cast is switched from the header; the 3D just follows it.
  onCastChange(() => volvelle?.setTint(getTint()));

  onThemeChange(() => {
    if (!volvelle) return;
    volvelle.dispose();
    viewport.replaceChildren();
    volvelle = createVolvelle();
    selectInstrument(current);
  });

  volvelle = createVolvelle();
  selectInstrument("addition");
  return {
    selectInstrument,
    setAddOperands(a, b) {
      state.addB = b;
      selectInstrument("addition");
      const idx = data.addition.rim.indexOf(a);
      if (idx >= 0) volvelle?.setSetting(idx);
    },
    setSetting(index) {
      volvelle?.setSetting(index);
    },
  };
}
