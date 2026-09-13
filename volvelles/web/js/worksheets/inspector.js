// Share inspector: parse a codex32 string, show its parts and checksum status,
// and offer candidate corrections (never applied silently).  Ported from the
// workbench's Inspector.

import { bytesToHex, normalizeInput, parts, payloadToBytes, verify } from "../codex32.js";
import { feFromChar, toChar } from "../gf32.js";
import { correct, syndrome } from "../errors.js";
import { copyButton, el, select } from "../ui.js";
import { card } from "./common.js";

function errorText(result) {
  if (result.ok) return "";
  const e = result.error;
  return typeof e === "string" ? e : String(e);
}

export function mountInspector(root) {
  const input = el("textarea", { class: "mono", rows: 3, spellcheck: false, autocomplete: "off", autocapitalize: "characters",
    placeholder: "MS1...  ('?' marks a character you cannot read)" });
  const maxSubs = select([{ value: "1", label: "single substitution" }, { value: "2", label: "up to two" }, { value: "3", label: "up to three (slow)" }], "2", () => render());
  const output = el("div", { class: "inspector-out" });

  function render() {
    output.replaceChildren();
    const normalized = normalizeInput(input.value);
    if (!normalized) {
      output.append(el("p", { class: "muted", text: "Paste a codex32 string to inspect it." }));
      return;
    }
    const result = verify(normalized);
    if (result.ok) {
      let p;
      try {
        p = parts(normalized);
      } catch (e) {
        output.append(el("p", { class: "status bad", text: e.message }));
        return;
      }
      const hex = bytesToHex(payloadToBytes(p.payload));
      output.append(
        el("p", { class: "status ok", text: "Valid checksum." }),
        el("div", { class: "kv" },
          el("span", { text: "Prefix" }), el("code", { text: p.hrp }),
          el("span", { text: "Threshold" }), el("code", { text: p.threshold === 0 ? "0 (the secret itself)" : String(p.threshold) }),
          el("span", { text: "Identifier" }), el("code", { text: p.id }),
          el("span", { text: "Index" }), el("code", { text: p.shareIndex.toUpperCase() }),
          el("span", { text: "Payload hex" }), el("code", { text: hex })),
        el("div", { class: "share" }, el("code", { class: "share-code", text: normalized }), copyButton(normalized)));
      return;
    }

    output.append(el("p", { class: "status bad", text: errorText(result) }));
    if (normalized.includes("?") || !/^[a-z0-9]+$/i.test(normalized)) {
      output.append(el("p", { class: "muted small", text: "Corrections are offered only for a full string of bech32 characters; '?' erasures are solved too." }));
    }

    const sep = normalized.lastIndexOf("1");
    const body = sep >= 0 ? normalized.slice(sep + 1) : normalized;
    const values = [...body].map((c) => (c === "?" ? 0 : feFromChar(c) ?? 0));
    if (values.length >= 13) {
      const variant = values.length > 100 ? "long" : "short";
      output.append(el("p", { class: "muted" },
        "The residue below carries no information about your share data, only about the errors. ",
        el("span", { class: "residue mono", text: syndrome(values, variant).map((v) => toChar(v, true)).join("") })));
    }

    const candidates = correct(normalized, { maxSubstitutions: Number(maxSubs.value) });
    if (candidates.length === 0) {
      output.append(el("p", { class: "muted", text: "No candidate with that many errors; compare against the paper copy." }));
    } else {
      const list = el("ul", { class: "candidate-list" });
      for (const candidate of candidates.slice(0, 8)) {
        const edits = candidate.edits
          .map((e) => (e.kind === "erasure" ? `position ${e.pos + 1}: erased → ${toChar(e.to, true)}` : `position ${e.pos + 1}: ${toChar(e.from, true)} → ${toChar(e.to, true)}`))
          .join("; ");
        list.append(el("li", {},
          el("code", { class: `mono${candidate.headerOk ? " header-ok" : ""}`, text: candidate.corrected.toUpperCase() }),
          el("p", { class: "muted small", text: edits || "already valid" }),
          el("button", { class: "ghost", type: "button", text: "Matches my copy",
            onclick: () => {
              input.value = candidate.corrected;
              render();
            } })));
      }
      output.append(el("h3", { text: "Candidates" }), list);
    }
  }

  input.addEventListener("input", render);

  root.append(card("Share inspector",
    el("p", { class: "lede", text: "Paste a codex32 string to see its parts, its checksum status and, when the checksum fails, candidate corrections for confirmation. It never applies a correction on its own." }),
    el("label", { class: "field" }, el("span", { class: "field-label", text: "Share" }), input),
    el("div", { class: "actions" }, el("span", { class: "field-label", text: "Attempt" }), maxSubs),
    output));

  render();
  return {};
}
