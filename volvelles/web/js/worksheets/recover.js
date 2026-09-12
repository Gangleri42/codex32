// Recover worksheet: rebuild a secret (or any share) from threshold-many
// shares, showing the Lagrange factors that the recovery wheel supplies.

import { bytesToHex, parts, payloadToBytes, recoverSecret, verify } from "../codex32.js";
import { charToValue, lagrange, valueToChar } from "../gf32.js";
import { copyButton, el } from "../ui.js";
import { card } from "./common.js";

export function mountRecover(root, ctx) {
  const input = el("textarea", { class: "mono", rows: 5, spellcheck: false,
    placeholder: "paste k shares, one per line" });
  const result = el("div", { class: "worksheet-result" });

  function parseShares() {
    return input.value
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function run() {
    const raw = parseShares();
    if (raw.length === 0) {
      result.replaceChildren(el("p", { class: "error", text: "paste at least the threshold number of shares" }));
      return;
    }
    const statuses = raw.map((s) => verify(s));
    const valid = raw.filter((_, i) => statuses[i].ok);
    if (valid.length !== raw.length) {
      result.replaceChildren(
        el("p", { class: "error", text: `${raw.length - valid.length} share(s) failed their checksum — fix them before recovering.` }),
        el("div", { class: "share-list" }, ...raw.map((s, i) =>
          el("div", { class: "share" },
            el("code", { class: "share-code dim", text: s }),
            statuses[i].ok ? el("span", { class: "badge ok", text: "ok" }) : el("span", { class: "badge bad", text: statuses[i].error }),
          ))),
      );
      return;
    }
    try {
      const first = parts(valid[0]);
      const k = first.threshold;
      if (valid.length < k) throw new Error(`this is a ${k}-of-n set; you have ${valid.length} shares`);
      const indices = valid.map((s) => parts(s).shareIndex);
      const unique = new Set(indices.map((c) => c.toUpperCase()));
      if (unique.size !== indices.length) throw new Error("two shares have the same index");

      const recovered = recoverSecret(valid);
      const ok = verify(recovered).ok;
      const target = charToValue("S");
      const factors = valid.map((s) => {
        const p = parts(s);
        const l = lagrange(target, charToValue(p.shareIndex), indices.map(charToValue));
        return { index: p.shareIndex, factor: valueToChar(l), value: l };
      });

      result.replaceChildren(
        el("div", { class: `verdict ${ok ? "ok" : "bad"}` },
          el("strong", { text: ok ? "Secret recovered" : "Recovered share has a bad checksum" }),
          el("span", { text: `${valid.length} of ${k} shares used` }),
        ),
        el("div", { class: "share" },
          el("span", { class: "share-label", text: "S share (master secret)" }),
          el("code", { class: "share-code", text: recovered }),
          el("span", { class: "badge ok", text: "checksum ok" }),
          copyButton(recovered),
        ),
        el("div", { class: "kv" },
          el("span", { text: "seed hex" }), el("code", { text: bytesToHex(payloadToBytes(parts(recovered).payload)) }),
        ),
        el("h3", { text: "Recovery factors" }),
        el("p", { class: "muted small", text: "The recovery wheel turns each share's index into one of these Lagrange factors; the fusion wheel multiplies them together. The app fuses them with field arithmetic." }),
        el("div", { class: "factor-list" }, ...factors.map((f) =>
          el("div", { class: "factor" },
            el("span", { class: "share-label", text: `share ${f.index.toUpperCase()}` }),
            el("code", { text: f.factor }),
            el("span", { class: "muted small", text: `l(${f.value})` }),
          ))),
      );
    } catch (e) {
      result.replaceChildren(el("p", { class: "error", text: e.message }));
    }
  }

  root.append(card("Recover worksheet",
    el("p", { class: "lede", text: "Recovery is interpolation: any k valid shares determine the whole polynomial, so the S share, your secret seed, can be recomputed. Each share is verified first; a bad checksum means a corrupt share." }),
    input,
    el("div", { class: "actions" },
      el("button", { class: "primary", type: "button", text: "Recover secret", onclick: run }),
      el("button", { class: "ghost", type: "button", text: "Clear", onclick: () => { input.value = ""; result.replaceChildren(); } }),
    ),
    result));
}
