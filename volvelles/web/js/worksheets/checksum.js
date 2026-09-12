// Checksum worksheet: generate or verify a codex32 checksum with a visible
// polynomial-division trace, linking each XOR to the addition wheel.

import { charToValue, mul, valueToChar } from "../gf32.js";
import {
  Engine, bytesToHex, checksumKindFor, fromSeed, parts, payloadToBytes, verify,
} from "../codex32.js";
import { copyButton, el, field, select } from "../ui.js";
import { card, hexToBytesLocal, isBech32Id, randomBytes, SHARE_ALPHABET } from "./common.js";

const TARGET = "secretshare32";

function trace(hrp, dataStr, kind, withTarget) {
  const engine = new Engine(kind);
  const steps = [];
  const push = (label, fe, note) => {
    const before = [...engine.residue];
    const xn = before[0];
    const shifted = before.slice(1).concat([fe]);
    const lookup = engine.generator.map((g) => mul(g, xn));
    const after = shifted.map((v, i) => v ^ lookup[i]);
    engine.inputFe(fe);
    steps.push({ label, fe, note, xn, shifted, lookup, after });
  };
  for (const ch of hrp) push(`HRP ${ch} · high`, (ch.toLowerCase().charCodeAt(0) >> 5) & 31, `space bits of "${ch}"`);
  push("HRP · separator", 0, "a single zero byte separates HRP halves");
  for (const ch of hrp) push(`HRP ${ch} · low`, ch.toLowerCase().charCodeAt(0) & 31, `low bits of "${ch}"`);
  for (const ch of dataStr) push(ch, charToValue(ch), "share data");
  if (withTarget) for (const ch of TARGET) push(ch, charToValue(ch), "target residue");
  return { steps, residue: [...engine.residue] };
}

function residueCells(values, changed) {
  return el("div", { class: "residue" }, ...values.map((v, i) =>
    el("span", { class: `cell${changed && changed[i] ? " changed" : ""}`, text: valueToChar(v) })));
}

export function mountChecksum(root, ctx) {
  let mode = "generate";
  const state = {
    hrp: "ms",
    threshold: "2",
    id: "acd2",
    index: "A",
    hex: bytesToHex(randomBytes(16)),
  };

  const result = el("div", { class: "worksheet-result" });

  const idInput = el("input", { class: "mono", maxlength: 4, value: state.id, spellcheck: false,
    oninput: (e) => { state.id = e.target.value.toUpperCase(); e.target.value = state.id; } });
  const hexInput = el("textarea", { class: "mono", rows: 2, spellcheck: false,
    oninput: (e) => { state.hex = e.target.value; } });
  hexInput.value = state.hex;

  const form = el("div", { class: "form-grid" },
    field("HRP", el("input", { class: "mono", value: state.hrp, maxlength: 8,
      oninput: (e) => { state.hrp = e.target.value.toLowerCase(); e.target.value = state.hrp; } })),
    field("Threshold k", select([0, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({ value: k, label: String(k) })), state.threshold,
      (v) => { state.threshold = v; if (v === "0") state.index = "S"; })),
    field("Identifier (4 chars)", idInput),
    field("Share index", select(["S", ...SHARE_ALPHABET].map((c) => ({ value: c, label: c })), state.index,
      (v) => { state.index = v; })),
    field("Seed data (hex)", hexInput, "16 bytes (128-bit) or 32 bytes (256-bit)"),
  );

  const verifyInput = el("textarea", { class: "mono", rows: 3, spellcheck: false,
    placeholder: "paste a full codex32 share, e.g. ms10testsxxxxxxxxxxxxxxxxxxxxxxxxxx4nzvca9cmczlw" });

  function runGenerate() {
    try {
      const bytes = hexToBytesLocal(state.hex);
      if (bytes.length === 0) throw new Error("enter some seed bytes as hex");
      if (!isBech32Id(state.id)) throw new Error("identifier must be 4 bech32 characters");
      const share = fromSeed({ hrp: state.hrp, threshold: Number(state.threshold), id: state.id, shareIndex: state.index, data: bytes });
      const p = parts(share);
      const dataStr = `${state.threshold === "0" ? "0" : state.threshold}${p.id}${p.shareIndex}${p.payload}`;
      const kind = checksumKindFor(share.length);
      const { steps, residue } = trace(state.hrp, dataStr, kind, true);
      const checksum = residue.map(valueToChar).join("");
      renderShare({ share, steps, checksum, bytes });
    } catch (e) {
      result.replaceChildren(el("p", { class: "error", text: e.message }));
    }
  }

  function runVerify() {
    const share = verifyInput.value.trim();
    if (!share) {
      result.replaceChildren(el("p", { class: "error", text: "paste a share to verify" }));
      return;
    }
    const res = verify(share);
    if (!res.ok) {
      result.replaceChildren(el("p", { class: "error", text: `Not valid: ${res.error}` }));
      return;
    }
    const kind = checksumKindFor(share.length);
    const sep = share.lastIndexOf("1");
    const hrp = sep === -1 ? "" : share.slice(0, sep);
    const dataStr = sep === -1 ? share : share.slice(sep + 1);
    const { steps } = trace(hrp, dataStr, kind, false);
    const last = steps[steps.length - 1];
    const finalResidue = last ? last.after : [];
    const target = TARGET.split("").map(charToValue);
    const match = finalResidue.length === target.length && finalResidue.every((v, i) => v === target[i]);
    result.replaceChildren(
      el("div", { class: `verdict ${match ? "ok" : "bad"}` },
        el("strong", { text: match ? "Checksum verified" : "Checksum mismatch" }),
        el("span", { text: match ? "the residue after the full share equals the target SECRETSHARE32" : "this share is corrupt or mistyped" }),
      ),
      el("div", { class: "residue-compare" },
        el("span", { class: "muted", text: "computed residue" }),
        residueCells(finalResidue, finalResidue.map((v, i) => v !== target[i])),
        el("span", { class: "muted", text: "target" }),
        residueCells(target, target.map((v, i) => v !== finalResidue[i])),
      ),
      traceTable(steps),
    );
  }

  function renderShare({ share, steps, checksum, bytes }) {
    result.replaceChildren(
      el("div", { class: "share" },
        el("span", { class: "share-label", text: "codex32 share" }),
        el("code", { class: "share-code", text: share }),
        el("span", { class: "badge ok", text: "checksum ok" }),
        copyButton(share),
      ),
      el("div", { class: "kv" },
        el("span", { text: "checksum" }), el("code", { text: checksum }),
        el("span", { text: "seed hex" }), el("code", { text: bytesToHex(bytes) }),
        el("span", { text: "payload" }), el("code", { text: `${bytes.length} bytes · ${payloadToBytes(parts(share).payload).length} recovered` }),
      ),
      el("p", { class: "muted small", text: "Every cell below is one XOR, the same operation as the addition wheel. The generator lookup values come from the checksum table; the shifted residue is added to them." }),
      traceTable(steps, { wheelLink: true }),
    );
  }

  function traceTable(steps, { wheelLink = false } = {}) {
    const rows = steps.map((step, i) => {
      const row = el("div", { class: "trace-row", dataset: { step: i } },
        el("span", { class: "trace-label", text: step.label }),
        el("span", { class: "trace-input", text: valueToChar(step.fe) }),
        el("span", { class: "trace-xn", text: valueToChar(step.xn) }),
        residueCells(step.after, step.shifted.map((v, k) => v !== step.after[k] || step.lookup[k] !== 0)),
      );
      row.addEventListener("click", () => {
        rows.forEach((r) => r.classList.remove("active"));
        row.classList.add("active");
        detail.replaceChildren(...stepDetail(step, wheelLink));
      });
      return row;
    });
    const detail = el("div", { class: "trace-detail", text: "click a step to see the operands" });
    const header = el("div", { class: "trace-row head" },
      el("span", { class: "trace-label", text: "step" }),
      el("span", { class: "trace-input", text: "in" }),
      el("span", { class: "trace-xn", text: "×" }),
      el("span", { class: "trace-cells-label", text: "residue (13–15 coefficients)" }),
    );
    return el("div", { class: "trace" }, header, el("div", { class: "trace-scroll" }, ...rows), detail);
  }

  function stepDetail(step, wheelLink) {
    const cells = step.after.map((v, i) => el("div", { class: "op-cell" },
      el("span", { text: `${valueToChar(step.shifted[i])} ⊕ ${valueToChar(step.lookup[i])}` }),
      el("strong", { text: valueToChar(v) }),
    ));
    const out = [el("p", { class: "muted small", text: `${step.label}${step.note ? ` · ${step.note}` : ""}` }), el("div", { class: "op-grid" }, ...cells)];
    if (wheelLink && ctx.openWheel) {
      out.push(el("button", { class: "ghost", type: "button", text: "Show this XOR on the addition wheel",
        onclick: () => ctx.openWheel("addition", valueToChar(step.shifted[0]), valueToChar(step.lookup[0])) }));
    }
    return out;
  }

  const toggle = el("div", { class: "tabs" },
    el("button", { class: "tab active", type: "button", text: "Generate", onclick: () => setMode("generate") }),
    el("button", { class: "tab", type: "button", text: "Verify", onclick: () => setMode("verify") }),
  );
  const generateBody = el("div", { class: "tab-body" },
    form,
    el("div", { class: "actions" },
      el("button", { class: "primary", type: "button", text: "Compute checksum", onclick: runGenerate }),
      el("button", { class: "ghost", type: "button", text: "Random 128-bit",
        onclick: () => { state.hex = bytesToHex(randomBytes(16)); hexInput.value = state.hex; runGenerate(); } }),
      el("button", { class: "ghost", type: "button", text: "Random 256-bit",
        onclick: () => { state.hex = bytesToHex(randomBytes(32)); hexInput.value = state.hex; runGenerate(); } }),
    ),
  );
  const verifyBody = el("div", { class: "tab-body hidden" },
    verifyInput,
    el("div", { class: "actions" }, el("button", { class: "primary", type: "button", text: "Verify share", onclick: runVerify })),
  );

  function setMode(next) {
    mode = next;
    [...toggle.children].forEach((b, i) => b.classList.toggle("active", (i === 0) === (next === "generate")));
    generateBody.classList.toggle("hidden", next !== "generate");
    verifyBody.classList.toggle("hidden", next === "generate");
    result.replaceChildren();
  }

  root.append(
    card("Checksum worksheet",
      el("p", { class: "lede", text: "codex32 protects a share with a 13-character BCH checksum. The worksheet divides the share by a generator polynomial; every cell is one XOR, so the addition wheel does the arithmetic." }),
      toggle, generateBody, verifyBody, result),
  );
  runGenerate();
  return {
    setHex(hex) {
      state.hex = hex;
      hexInput.value = hex;
      setMode("generate");
      runGenerate();
    },
  };
}
