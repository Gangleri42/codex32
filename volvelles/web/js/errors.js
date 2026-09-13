// Error detection and correction, ported from the workbench's core/errors.ts.
// The residue is affine in the string, so a substitution +e at body position j
// shifts the syndrome by e * S_j, where S_j = x^(n-1-j) mod G.  GF(32)
// suffices for erasures and single or double substitutions.  Corrections are
// offered, never applied.

import { charToValue, div, feFromChar, inv, mul, toChar } from "./gf32.js";
import { Engine, normalizeInput, parts, verify } from "./codex32.js";

const WEIGHT = { erasure: 1, deletion: 1, substitution: 2, insertion: 2 };

function engineFor(variant) {
  return new Engine(variant);
}

export function syndrome(body, variant = "short") {
  const engine = engineFor(variant);
  engine.inputHrp("ms");
  for (const v of body) engine.inputFe(v);
  return engine.residue.map((v, i) => v ^ engine.target[i]);
}

export function xPowerMod(n, variant = "short") {
  const engine = engineFor(variant);
  for (let i = 0; i < n; i++) engine.inputFe(0);
  return [...engine.residue];
}

export function syndromeBasis(n, variant = "short") {
  return Array.from({ length: n }, (_, j) => xPowerMod(n - 1 - j, variant));
}

// Gaussian elimination over GF(32): sum_k e_k B[p_k] = deviations, 13 x r.
export function solveErasures(basis, positions, deviations) {
  const rows = 13;
  const cols = positions.length;
  const m = Array.from({ length: rows }, (_, i) => [...positions.map((p) => basis[p][i]), deviations[i]]);
  const where = new Array(cols).fill(-1);
  let rank = 0;
  for (let col = 0; col < cols && rank < rows; col++) {
    const pivot = m.findIndex((row, r) => r >= rank && row[col] !== 0);
    if (pivot < 0) continue;
    [m[rank], m[pivot]] = [m[pivot], m[rank]];
    const invPivot = inv(m[rank][col]);
    for (let c = col; c <= cols; c++) m[rank][c] = mul(m[rank][c], invPivot);
    for (let r = 0; r < rows; r++) {
      if (r !== rank && m[r][col] !== 0) {
        const factor = m[r][col];
        for (let c = col; c <= cols; c++) m[r][c] ^= mul(factor, m[rank][c]);
      }
    }
    where[col] = rank;
    rank++;
  }
  for (let r = rank; r < rows; r++) if (m[r][cols] !== 0) return null;
  if (rank < cols) return null;
  return where.map((row) => m[row][cols]);
}

function scalarMultiple(a, b) {
  let factor = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0 && b[i] === 0) continue;
    if (a[i] === 0 || b[i] === 0) return null;
    const f = div(a[i], b[i]);
    if (factor === null) factor = f;
    else if (factor !== f) return null;
  }
  return factor;
}

export function findSubstitutions(basis, deviations, max, fixedErasures = []) {
  const all = Array.from({ length: basis.length }, (_, i) => i).filter((i) => !fixedErasures.includes(i));
  const found = [];
  const brute = (positions, devs) => {
    const solution = solveErasures(basis, positions, devs);
    if (solution && solution.every((v) => v !== 0)) found.push({ positions, deviations: solution });
  };
  if (max >= 1) {
    for (const j of all) {
      const delta = scalarMultiple(deviations, basis[j]);
      if (delta !== null && delta !== 0) found.push({ positions: [j], deviations: [delta] });
    }
  }
  if (max >= 2) {
    for (let a = 0; a < all.length; a++) {
      for (let b = a + 1; b < all.length; b++) brute([all[a], all[b]], deviations);
    }
  }
  if (max >= 3) {
    for (let a = 0; a < all.length; a++) {
      for (let b = a + 1; b < all.length; b++) {
        for (let c = b + 1; c < all.length; c++) brute([all[a], all[b], all[c]], deviations);
      }
    }
  }
  return found;
}

function parseLoose(input) {
  const s = normalizeInput(input);
  const sep = s.lastIndexOf("1");
  if (sep < 0) return null;
  const data = s.slice(sep + 1);
  const body = [];
  for (const ch of data) {
    if (ch === "?") body.push(null);
    else {
      const v = feFromChar(ch);
      if (v === null) return null;
      body.push(v);
    }
  }
  return { hrp: s.slice(0, sep), body, caseName: /[A-Z]/.test(data) ? "upper" : "lower" };
}

function parseShare(s) {
  const res = verify(s);
  if (!res.ok) return { ok: false, error: res.error };
  try {
    const p = parts(s);
    return { ok: true, value: { threshold: p.threshold, id: p.id, index: charToValue(p.shareIndex) } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function correct(input, opts = {}) {
  const max = opts.maxSubstitutions ?? 2;
  const loose = parseLoose(input);
  if (!loose || loose.body.length < 13) return [];
  const n = loose.body.length;
  const variant = n > 100 ? "long" : "short";
  const basis = syndromeBasis(n, variant);
  const erasures = loose.body.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  const known = loose.body.map((v) => v ?? 0);

  const groups = [];
  if (erasures.length > 0 && erasures.length <= 8) {
    const solved = solveErasures(basis, erasures, syndrome(known, variant));
    if (solved) {
      const fixed = [...known];
      const edits = erasures.map((pos, i) => {
        fixed[pos] = solved[i];
        return { kind: "erasure", pos, to: solved[i] };
      });
      const residual = syndrome(fixed, variant);
      if (residual.every((v) => v === 0)) {
        groups.push({ edits });
      } else {
        for (const extra of findSubstitutions(basis, residual, max, erasures)) {
          groups.push({
            edits: [
              ...edits,
              ...extra.positions.map((pos, i) => ({ kind: "substitution", pos, from: known[pos], to: known[pos] ^ extra.deviations[i] })),
            ],
          });
        }
      }
    }
  } else if (erasures.length === 0) {
    const deviations = syndrome(known, variant);
    if (deviations.every((v) => v === 0)) groups.push({ edits: [] });
    for (const found of findSubstitutions(basis, deviations, max)) {
      groups.push({
        edits: found.positions.map((pos, i) => ({ kind: "substitution", pos, from: known[pos], to: known[pos] ^ found.deviations[i] })),
      });
    }
  }

  const byString = new Map();
  for (const group of groups) {
    const candidate = makeCandidate(loose, group.edits, opts);
    if (!byString.has(candidate.corrected)) byString.set(candidate.corrected, candidate);
  }
  return [...byString.values()].sort((a, b) => a.weight - b.weight || Number(b.headerOk) - Number(a.headerOk));
}

function makeCandidate(loose, edits, opts) {
  const full = loose.body.map((v) => v ?? 0);
  for (const edit of edits) if (edit.to !== null) full[edit.pos] = edit.to;
  const corrected = `${loose.hrp}1${full.map((v) => toChar(v, loose.caseName === "upper")).join("")}`;
  const parsed = parseShare(corrected);
  const reasons = [];
  if (!parsed.ok) reasons.push(parsed.error);
  let headerOk = parsed.ok;
  if (parsed.ok && opts.context) {
    const p = parsed.value;
    headerOk =
      (opts.context.k === 0 || p.threshold === opts.context.k) &&
      p.id === opts.context.id &&
      !opts.context.usedIndexes.includes(p.index);
  }
  return {
    corrected,
    edits,
    weight: edits.reduce((sum, e) => sum + WEIGHT[e.kind], 0),
    headerOk,
    reasons,
  };
}
