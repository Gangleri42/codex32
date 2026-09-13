// The checksum worksheet (the ladder), ported from the workbench's
// core/worksheets/ladder.ts, itself a port of SSS32.ps:1561-1700.
// Cells are addressed "row:col".  The top diagonal holds the share's 45
// characters; the running residue and the checksum-table lookups derive from
// them; the last row must come out as SECRETSHARE32.

import { add, charToValue, mul } from "../gf32.js";
import { checksumOf, initialWorksheetResidue, shortGenerator } from "../codex32.js";

const fe = (s) => [...s].map(charToValue);

export const X13 = shortGenerator();
export const X14 = fe("JRKHESSKK2QH8");
export const INITIAL_RESIDUE = initialWorksheetResidue();
export const TARGET = fe("SECRETSHARE32");

export function cellId(row, col) {
  return `${row}:${col}`;
}

// Sheet geometry in PostScript points (14pt cells, 2pt gaps after every four
// columns, 1pt gaps after every two rows), matching SSS32.ps.
export const XSIZE = 14;
export const XGAP = 2;
export const YSIZE = 14;
export const YGAP = 1;
export const GROUP = 4;

export const cellX = (col) => XSIZE * col + XGAP * Math.floor(col / GROUP);
export const cellY = (row) => YSIZE * row + YGAP * Math.floor(row / 2);
export const track = (index, group) => index + Math.floor(index / group) + 1;
export const SHEET_WIDTH_PT = cellX(47) + XSIZE; // 694pt
export const SHEET_HEIGHT_PT = cellY(34) + YSIZE; // 507pt

// T(a, b)[i] = a * x^14 + b * x^13, coefficientwise: the checksum table word.
export function lookupT(a, b) {
  return X14.map((x, i) => add(mul(a, x), mul(b, X13[i])));
}

export function ladderLayout(shareLen = 48) {
  const dataChars = shareLen - 3;
  const firstRowLen = 13;
  const numSteps = (dataChars - firstRowLen) / 2;
  const rows = 2 * numSteps + 3;
  const targetRow = 2 * numSteps + 2;
  const checksumStart = shareLen - 13; // first full-string index of the checksum
  const cells = [];
  const labels = [];
  const byId = new Map();

  const push = (cell) => {
    cells.push(cell);
    byId.set(cell.id, cell);
  };

  for (let col = 0; col < 3; col++) {
    push({ id: cellId(0, col), row: 0, col, kind: "prefix", bold: true, pink: false, number: col + 1, deps: [], phase: "given" });
  }
  for (let col = 3; col <= 15; col++) {
    push({ id: cellId(0, col), row: 0, col, kind: "data", bold: true, pink: false, number: col + 1, charIndex: col, deps: [], phase: "given" });
  }
  for (let col = 3; col <= 15; col++) {
    push({ id: cellId(1, col), row: 1, col, kind: "initial", bold: false, pink: false, charIndex: col, deps: [], phase: "given", given: INITIAL_RESIDUE[col - 3] });
  }

  for (let step = 1; step <= numSteps; step++) {
    const row = 2 * step;
    for (let col = row + 1; col <= row + 13; col++) {
      push({ id: cellId(row, col), row, col, kind: "residue", bold: false, pink: false, deps: [cellId(row - 2, col), cellId(row - 1, col)], phase: "top-down" });
    }
    for (const col of [row + 14, row + 15]) {
      const charIndex = col;
      push({
        id: cellId(row, col), row, col,
        kind: charIndex >= checksumStart ? "checksum" : "data",
        bold: true, pink: false, number: charIndex + 1, charIndex, deps: [], phase: "given",
      });
    }
    const lookupRow = row + 1;
    for (let col = lookupRow + 2; col <= lookupRow + 14; col++) {
      push({ id: cellId(lookupRow, col), row: lookupRow, col, kind: "lookup", bold: false, pink: false, deps: [cellId(row, row + 1), cellId(row, row + 2)], phase: "top-down" });
    }
  }

  for (let col = checksumStart; col < shareLen; col++) {
    push({
      id: cellId(targetRow, col), row: targetRow, col, kind: "target", bold: false, pink: false,
      charIndex: col, deps: [cellId(targetRow - 2, col), cellId(targetRow - 1, col)], phase: "given",
      given: TARGET[col - checksumStart],
    });
  }

  // Pink triangle: the last six steps, widening down to the 13 checksum cells.
  for (let step = numSteps - 6; step <= numSteps; step++) {
    const row = 2 * step;
    for (let col = checksumStart; col <= row + 15; col++) {
      const cell = byId.get(cellId(row, col));
      if (cell) {
        cell.pink = true;
        if (cell.kind === "residue") cell.phase = "bottom-up";
      }
    }
  }

  for (let step = 1; step <= numSteps; step++) {
    const row = 2 * step;
    labels.push({ text: "+", row: row - 1, col: row });
    labels.push({ text: "=", row, col: row });
  }

  const topDiagonal = cells
    .filter((c) => c.kind === "data" || c.kind === "checksum")
    .map((c) => c.id)
    .sort((a, b) => {
      const [ar, ac] = a.split(":").map(Number);
      const [br, bc] = b.split(":").map(Number);
      return ar - br || ac - bc;
    });

  const bottomDiagonal = Array.from({ length: numSteps - 1 }, (_, i) => i + 1).flatMap((s) => [
    cellId(2 * s, 2 * s + 1),
    cellId(2 * s, 2 * s + 2),
  ]);

  const verificationOrder = [
    ...topDiagonal,
    ...cells
      .filter((c) => c.kind === "residue" || c.kind === "lookup" || c.kind === "target")
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((c) => c.id),
  ];

  const generationOrder = [
    ...topDiagonal.filter((id) => byId.get(id)?.kind === "data"),
    ...cells
      .filter((c) => (c.kind === "residue" || c.kind === "lookup") && c.phase === "top-down")
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((c) => c.id),
    ...cells
      .filter((c) => c.phase === "bottom-up")
      .sort((a, b) => b.row - a.row || b.col - a.col)
      .map((c) => c.id),
  ];

  const positionToCell = (postMs1) => {
    const full = postMs1 + 3;
    if (full <= 15) return cellId(0, full);
    const step = Math.ceil((full - 15) / 2);
    const offset = full - 15 - 2 * (step - 1);
    return cellId(2 * step, 2 * step + 13 + offset);
  };

  return {
    shareLen, numSteps, rows, cells, byId, labels, topDiagonal, bottomDiagonal,
    verificationOrder, generationOrder, positionToCell,
  };
}

// Fills every derivable cell from the 45 post-MS1 characters.  A null
// character propagates: partially filled worksheets compute as far as they can.
export function fill(layout, chars) {
  const values = new Map();
  for (const cell of layout.cells) if (cell.given !== undefined) values.set(cell.id, cell.given);
  for (const id of layout.topDiagonal) {
    const cell = layout.byId.get(id);
    if (!cell || cell.charIndex === undefined) continue;
    values.set(id, chars[cell.charIndex - 3] ?? null);
  }
  for (const cell of layout.cells) {
    if (cell.kind === "residue" || cell.kind === "target") {
      const [x, y] = cell.deps.map((d) => values.get(d) ?? null);
      values.set(cell.id, x === null || y === null ? null : add(x, y));
    } else if (cell.kind === "lookup") {
      const [a, b] = cell.deps.map((d) => values.get(d) ?? null);
      const i = cell.col - (cell.row + 2);
      values.set(cell.id, a === null || b === null ? null : lookupT(a, b)[i]);
    }
  }
  return values;
}

export function operands(layout, values, id) {
  const cell = layout.byId.get(id);
  if (!cell) return { kind: "given" };
  if (cell.kind === "residue" || cell.kind === "target") {
    return { kind: "add", x: values.get(cell.deps[0]) ?? null, y: values.get(cell.deps[1]) ?? null };
  }
  if (cell.kind === "lookup") {
    const [a, b] = cell.deps.map((d) => values.get(d) ?? null);
    return { kind: "lookup", key: [a, b], i: cell.col - (cell.row + 2) };
  }
  return { kind: "given" };
}

export function checkCell(values, id, entered) {
  return values.get(id) === entered;
}

export function lastRow(layout, values) {
  const row = 2 * layout.numSteps + 2;
  return Array.from({ length: 13 }, (_, i) => values.get(cellId(row, layout.shareLen - 13 + i)) ?? null);
}

export function isComplete(layout, values) {
  return layout.verificationOrder.every((id) => values.get(id) !== null && values.get(id) !== undefined);
}

// Generation mode: the header and payload are known, the checksum is not.
export function solvePink(layout, dataChars) {
  const checksum = checksumOf("ms", dataChars, "short");
  const values = fill(layout, [...dataChars, ...checksum]);
  return { values, checksum };
}

export function diagnose(layout, expected, user) {
  for (const id of layout.verificationOrder) {
    const e = expected.get(id) ?? null;
    const u = user.get(id) ?? null;
    if (e !== null && e !== u) {
      const cell = layout.byId.get(id);
      if (!cell) continue;
      return { col: cell.col, row: cell.row, cellId: id, charNumber: cell.charIndex };
    }
  }
  return null;
}

// The companion's bottom-diagonal trick: a derived share's sheet is the
// cellwise sum of the input sheets scaled by their derivation symbols.
export function interpolateCells(sheets, sigma) {
  const first = sheets[0];
  const out = new Map();
  for (const id of first.keys()) {
    let acc = 0;
    for (let i = 0; i < sheets.length; i++) {
      const v = sheets[i].get(id) ?? null;
      if (v === null) {
        acc = null;
        break;
      }
      acc = add(acc, mul(sigma[i], v));
    }
    out.set(id, acc);
  }
  return out;
}
