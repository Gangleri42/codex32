// The bench: the 2D wheel beside the checksum ladder, with the wheel readout
// and the active-cell proposal.  No framework; state lives here and the DOM is
// updated by hand.

import data from "./data.js";
import { add, charToValue, feFromChar, mul, toChar } from "./gf32.js";
import { checksumOf } from "./codex32.js";
import { el, toast } from "./ui.js";
import { fill, ladderLayout, operands, diagnose } from "./worksheets/ladder.js";
import { buildLadderGrid } from "./worksheets/ladder-grid.js";
import { instrumentConfig, instrumentSvg } from "./volvelle/svgface.js";
import { angleFor, detentFor, wrap180 } from "./volvelle/turn.js";
import { onThemeChange, palette } from "./theme.js";

const INSTRUMENTS = [
  { id: "addition", label: "Addition" },
  { id: "fusion", label: "Fusion" },
  { id: "translation", label: "Translation" },
  { id: "recovery", label: "Recovery" },
];

const SVG_SIZE = 900;

function dialFor(name, value) {
  const base = data.bases[name];
  const target = name === "recovery" ? value ^ 16 : value;
  let cur = 1;
  for (let t = 0; t < 31; t++) {
    if (cur === target) return t;
    cur = mul(cur, base);
  }
  return null;
}

export function mountBench(root) {
  const layout = ladderLayout(48);
  const state = { instrument: "addition", detent: 0, angle: 0, highlight: null, mode: "verify", entries: {}, activeCell: null };

  const wheelHost = el("div", { class: "bench-wheel", role: "slider", tabindex: 0 });
  const readout = el("div", { class: "bench-readout" });
  const proposalBox = el("div", { class: "bench-proposal" });
  const diagnosisLine = el("p", { class: "bench-diagnosis muted small" });
  const gridHost = el("div", { class: "bench-sheet" });
  const modeInfo = el("span", { class: "muted small", text: "Type each cell; B, I, O and 1 are never bech32." });

  // The geometry (item lists, outlines) is rebuilt only when the instrument
  // changes, never from the drag loop.
  let cfg = instrumentConfig(data, state.instrument);
  const config = () => cfg;
  const getEntry = (id) => state.entries[id];
  const getActiveCell = () => state.activeCell;

  const chars = () =>
    Array.from({ length: 45 }, (_, p) => {
      const typed = state.entries[layout.positionToCell(p)];
      return typed ? feFromChar(typed) : null;
    });
  const expected = () => fill(layout, chars());

  const grid = buildLadderGrid({
    layout,
    getEntry,
    getExpected: expected,
    getActiveCell,
    onInput(id, value) {
      const next = { ...state.entries };
      if (value === null || value === "") delete next[id];
      else next[id] = value;
      state.entries = next;
      refresh();
    },
    onFocus(id) {
      state.activeCell = id;
      refresh();
    },
  });
  gridHost.append(grid.el);

  // --- wheel -----------------------------------------------------------------

  function renderWheel() {
    wheelHost.innerHTML = instrumentSvg(data, state.instrument, { size: SVG_SIZE, palette: palette() });
    applyRotation();
    wheelHost.setAttribute("aria-label", `${state.instrument} wheel`);
    wheelHost.setAttribute("aria-valuemin", "0");
    wheelHost.setAttribute("aria-valuemax", String(config().detents - 1));
    wheelHost.setAttribute("aria-valuenow", String(state.detent));
  }

  // The stator turns by `angle`; drag sets it continuously, release snaps it
  // to the nearest detent angle (the nearest revolution, so no long spin).
  function applyRotation() {
    const group = wheelHost.querySelector(".stator");
    if (!group) return;
    group.style.transform = `rotate(${state.angle}deg)`;
    wheelHost.setAttribute("aria-valuenow", String(state.detent));
  }

  function setDetent(detent) {
    const { stepDeg, detents } = config();
    state.detent = ((detent % detents) + detents) % detents;
    const base = angleFor(state.detent, stepDeg);
    state.angle = base + 360 * Math.round((state.angle - base) / 360);
    applyRotation();
    renderReadout();
  }

  function pointerAngle(event) {
    const rect = wheelHost.getBoundingClientRect();
    return (Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180) / Math.PI;
  }

  let drag = null;
  wheelHost.addEventListener("pointerdown", (e) => {
    drag = { lastPhi: pointerAngle(e) };
    wheelHost.classList.add("dragging");
    wheelHost.setPointerCapture(e.pointerId);
  });
  wheelHost.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const phi = pointerAngle(e);
    state.angle += wrap180(phi - drag.lastPhi);
    drag.lastPhi = phi;
    applyRotation();
  });
  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    wheelHost.classList.remove("dragging");
    const { stepDeg, detents } = config();
    setDetent(detentFor(state.angle, stepDeg, detents));
    try {
      wheelHost.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };
  wheelHost.addEventListener("pointerup", endDrag);
  wheelHost.addEventListener("pointercancel", endDrag);
  wheelHost.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") setDetent(state.detent + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setDetent(state.detent - 1);
    else if (e.key === "Home") setDetent(0);
    else return;
    e.preventDefault();
  });

  // --- readout ---------------------------------------------------------------

  function additionState() {
    const { rim, table, window_labels: labels } = data.addition;
    return { pointer: rim[state.detent], windows: labels.map((label, r) => ({ ring: r, label, value: table[r][state.detent] })) };
  }

  function proposalFor() {
    if (!state.activeCell) return null;
    const op = operands(layout, expected(), state.activeCell);
    if (op.kind !== "add" || op.x === null || op.y === null) return null;
    const x = toChar(op.x, true);
    const y = toChar(op.y, true);
    const dial = data.addition.rim.indexOf(x);
    const ring = data.addition.window_labels.indexOf(y);
    if (dial < 0 || ring < 0) return null;
    return { x, y, dial, ring, expected: toChar(add(op.x, op.y), true) };
  }

  function renderReadout() {
    readout.replaceChildren();
    if (state.instrument === "addition") {
      const { pointer, windows } = additionState();
      const proposal = proposalFor();
      readout.append(el("p", { class: "muted small" }, "Pointer at ", el("strong", { text: pointer })));
      const list = el("ol", { class: "window-list" });
      for (const w of windows) {
        const on = (proposal && proposal.ring === w.ring) || state.highlight === w.label;
        list.append(el("li", {
          class: on ? "on" : "",
          title: `${pointer} ⊕ ${w.label} = ${w.value}`,
        }, el("span", { class: "label", text: w.label }), el("span", { class: "arrow", text: "→" }), el("span", { class: "value", text: w.value })));
      }
      readout.append(list);
    } else {
      const face = data.familyB[state.instrument];
      const steps = face.rim.length;
      readout.append(el("p", { class: "muted small" }, state.instrument === "recovery" ? "Window on share " : "Multiplier ", el("strong", { text: face.rim[state.detent] })));
      const list = el("div", { class: "map-list" });
      for (let k = 0; k < steps; k++) {
        const input = face.inner[k];
        if (input === " ") continue;
        list.append(el("div", { class: "map-row" },
          el("span", { class: "map-in", text: input }),
          el("span", { class: "map-arrow", text: "→" }),
          el("span", { class: "map-out", text: face.rim[(k + state.detent) % steps] })));
      }
      readout.append(list);
    }
    renderProposal();
  }

  function renderProposal() {
    proposalBox.replaceChildren();
    const proposal = proposalFor();
    if (!proposal) {
      const op = state.activeCell ? operands(layout, expected(), state.activeCell) : null;
      if (op && op.kind === "lookup") {
        proposalBox.append(el("p", { class: "muted small", text: "This cell is a checksum-table lookup; read the word from the table." }));
      }
      return;
    }
    const reading = state.instrument === "addition" ? data.addition.table[proposal.ring][state.detent] : null;
    const correct = reading === proposal.expected;
    proposalBox.append(
      el("p", { text: `Dial the pointer to ${proposal.x}, then read the window labelled ${proposal.y}.` }),
      el("p", { class: `reading${correct ? " ok" : ""}` }, "The window reads ", el("strong", { text: reading ?? "—" }), correct ? "" : ` (expected ${proposal.expected})`),
    );
    if (state.instrument === "addition") {
      proposalBox.append(el("div", { class: "actions" },
        el("button", { class: "ghost", type: "button", text: `Dial ${proposal.x}`, onclick: () => setDetent(proposal.dial) }),
        el("button", {
          class: "primary", type: "button", text: "Take into the active cell", disabled: !correct,
          onclick: () => {
            state.entries = { ...state.entries, [state.activeCell]: reading };
            refresh();
          },
        })));
    }
  }

  // --- toolbar and instrument selection --------------------------------------

  function selectInstrument(name) {
    state.instrument = name;
    cfg = instrumentConfig(data, name);
    state.detent = 0;
    state.angle = 0;
    state.highlight = null;
    for (const [i, button] of [...instrumentBar.children].entries()) button.classList.toggle("active", INSTRUMENTS[i].id === name);
    renderWheel();
    renderReadout();
  }

  const instrumentBar = el("div", { class: "chips" },
    ...INSTRUMENTS.map((inst) => el("button", {
      class: `chip${inst.id === state.instrument ? " active" : ""}`,
      type: "button",
      text: inst.label,
      onclick: () => selectInstrument(inst.id),
    })));

  function setMode(mode, button) {
    state.mode = mode;
    for (const b of modeBar.querySelectorAll("button")) if (b.dataset.mode) b.classList.toggle("active", b === button);
    modeInfo.textContent = mode === "generate" ? "Type the header and payload, then Solve." : "Type each cell; B, I, O and 1 are never bech32.";
  }

  function solve() {
    const known = chars().slice(0, 32);
    if (known.some((v) => v === null)) {
      toast("Fill the header and payload first");
      return;
    }
    const checksum = checksumOf("ms", known, "short");
    const next = { ...state.entries };
    checksum.forEach((value, i) => {
      next[layout.positionToCell(32 + i)] = toChar(value, true);
    });
    state.entries = next;
    refresh();
    toast("Checksum solved; verify it on a fresh worksheet");
  }

  function clear() {
    state.entries = {};
    state.activeCell = null;
    refresh();
  }

  const modeBar = el("div", { class: "bench-modes" },
    el("button", { class: "ghost active", type: "button", dataset: { mode: "verify" }, text: "Verify", onclick: (e) => setMode("verify", e.currentTarget) }),
    el("button", { class: "ghost", type: "button", dataset: { mode: "generate" }, text: "Generate", onclick: (e) => setMode("generate", e.currentTarget) }),
    el("button", { class: "ghost", type: "button", text: "Solve checksum", onclick: solve }),
    el("button", { class: "ghost", type: "button", text: "Clear", onclick: clear }),
    modeInfo,
  );

  function refresh() {
    grid.update();
    renderReadout();
    updateDiagnosis();
  }

  // Name the first cell that diverges: a typed arithmetic cell, or the first
  // checksum column that does not read SECRETSHARE32.
  function updateDiagnosis() {
    const correct = expected();
    const user = new Map(correct);
    for (const cell of layout.cells) {
      if (cell.kind === "target") user.set(cell.id, cell.given);
      else if (cell.kind === "residue" || cell.kind === "lookup") {
        const typed = state.entries[cell.id];
        if (typed) user.set(cell.id, feFromChar(typed));
      }
    }
    const d = diagnose(layout, correct, user);
    if (!d) {
      diagnosisLine.textContent = "";
      return;
    }
    const cell = layout.byId.get(d.cellId);
    if (cell && cell.kind === "target") {
      diagnosisLine.textContent = `The share fails its checksum: column ${d.col + 1} (character ${cell.charIndex + 1}) should read ${toChar(cell.given, true)}.`;
    } else {
      diagnosisLine.textContent = `Arithmetic error at column ${d.col + 1}, row ${d.row + 1}: the worksheet gives ${toChar(correct.get(d.cellId), true)}.`;
    }
  }

  root.append(el("div", { class: "bench" },
    el("section", { class: "bench-left" }, instrumentBar, wheelHost, readout),
    el("section", { class: "bench-right" },
      el("h2", { text: "Checksum worksheet" }),
      modeBar,
      diagnosisLine,
      el("div", { class: "sheet-scroll" }, gridHost),
      proposalBox)));

  selectInstrument("addition");
  onThemeChange(() => renderWheel());

  return {
    show(name, a, b) {
      selectInstrument(name);
      state.highlight = name === "addition" && b != null ? String(b).toUpperCase() : null;
      if (name === "addition" && a != null) {
        const dial = data.addition.rim.indexOf(String(a).toUpperCase());
        if (dial >= 0) setDetent(dial);
        else renderReadout();
      } else if (name !== "addition" && a != null) {
        const dial = dialFor(name, charToValue(String(a).toUpperCase()));
        if (dial !== null) setDetent(dial);
        else renderReadout();
      } else {
        renderReadout();
      }
    },
    setDetent,
    setInstrument: selectInstrument,
  };
}
