// Builds the checksum ladder as a DOM grid at the PostScript positions.  Pure
// DOM, no framework; bench.js owns the state and calls update() after changes.

import { feFromChar, toChar } from "../gf32.js";
import { SHEET_HEIGHT_PT, SHEET_WIDTH_PT, cellX, cellY } from "./ladder.js";
import { el } from "../ui.js";

const EDITABLE = new Set(["data", "checksum", "residue", "lookup"]);

function givenText(cell) {
  if (!cell) return null;
  if (cell.kind === "prefix") return ["M", "S", "1"][cell.col] ?? null;
  if (cell.kind === "initial" || cell.kind === "target") return toChar(cell.given, true);
  return null;
}

export function buildLadderGrid({ layout, getEntry, getExpected, onInput, onFocus, getActiveCell }) {
  const inputs = new Map();
  const cellNodes = new Map();

  const grid = el("div", { class: "ladder" });

  for (const cell of layout.cells) {
    const editable = EDITABLE.has(cell.kind);
    const node = el("div", {
      class: `lcell${cell.bold ? " bold" : " thin"}${cell.pink ? " pink" : ""}${editable ? "" : " given"}`,
      style: {
        left: `calc(${cellX(cell.col)} * var(--u))`,
        top: `calc(${cellY(cell.row)} * var(--u))`,
        width: `calc(14 * var(--u))`,
        height: `calc(14 * var(--u))`,
      },
      dataset: { cell: cell.id },
      onclick: () => onFocus(cell.id),
    });
    if (cell.number !== undefined) node.append(el("span", { class: "lnum", text: String(cell.number) }));
    if (editable) {
      const input = el("input", {
        class: "linput",
        maxlength: 1,
        inputmode: "text",
        autocapitalize: "characters",
        autocomplete: "off",
        spellcheck: false,
        "aria-label": `row ${cell.row}, column ${cell.col}`,
        value: getEntry(cell.id) ?? "",
      });
      input.addEventListener("input", () => {
        const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const last = clean.slice(-1);
        if (last && feFromChar(last) === null) {
          input.value = getEntry(cell.id) ?? "";
          return;
        }
        onInput(cell.id, last || null);
        if (last) advance(cell);
      });
      input.addEventListener("focus", () => onFocus(cell.id));
      node.append(input);
      inputs.set(cell.id, input);
    } else {
      node.append(el("span", { class: "lgiven", text: givenText(cell) ?? "" }));
    }
    cellNodes.set(cell.id, node);
    grid.append(node);
  }

  for (const label of layout.labels) {
    grid.append(el("span", {
      class: "lmarker",
      style: {
        left: `calc(${cellX(label.col)} * var(--u))`,
        top: `calc(${cellY(label.row)} * var(--u))`,
      },
      text: label.text,
    }));
  }

  function advance(from) {
    const index = layout.topDiagonal.indexOf(from.id);
    if (index < 0) return;
    const next = layout.topDiagonal[index + 1];
    inputs.get(next)?.focus({ preventScroll: true });
  }

  // Pasting a share fills the top diagonal from the focused cell onward.
  grid.addEventListener("paste", (event) => {
    const target = event.target.closest?.("[data-cell]");
    if (!target) return;
    const text = (event.clipboardData?.getData("text") || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .split("")
      .filter((c) => feFromChar(c) !== null)
      .join("");
    if (text.length < 2) return;
    event.preventDefault();
    const start = layout.topDiagonal.indexOf(target.dataset.cell);
    if (start < 0) return;
    for (let i = 0; i < text.length && start + i < layout.topDiagonal.length; i++) {
      onInput(layout.topDiagonal[start + i], text[i]);
    }
    update();
  });

  function update() {
    const active = getActiveCell();
    const expected = getExpected();
    for (const cell of layout.cells) {
      const node = cellNodes.get(cell.id);
      node.classList.toggle("active", active === cell.id);
      if (!EDITABLE.has(cell.kind)) continue;
      const typed = getEntry(cell.id);
      const input = inputs.get(cell.id);
      if (input) input.value = typed ?? "";
      const exp = expected.get(cell.id) ?? null;
      const val = typed ? feFromChar(typed) : null;
      node.dataset.status = !typed || exp === null || val === null ? "" : val === exp ? "ok" : "bad";
    }
  }

  return { el: grid, update };
}
