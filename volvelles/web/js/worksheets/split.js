// Split worksheet: create a codex32 secret and its Shamir shares, or derive
// more shares from an existing secret.  Mirrors the booklet's generation
// procedure (initial k shares, then translation to derive the rest).

import {
  bytesToHex, deriveShares, fromSeed, interpolateAt, parts, payloadToBytes, verify,
} from "../codex32.js";
import { copyButton, el, field, select } from "../ui.js";
import { card, randomBytes, shareIndexSequence } from "./common.js";

const payloadLen = (bits) => Math.ceil(bits / 5);

export function mountSplit(root, ctx) {
  const state = { mode: "new", threshold: "2", count: "3", id: "acd2", hrp: "ms", bits: "128", existing: "", seedHex: "" };
  const result = el("div", { class: "worksheet-result" });

  const existingInput = el("textarea", { class: "mono", rows: 2, spellcheck: false,
    placeholder: "an existing S share, e.g. ms10testsxxxxxxxxxxxxxxxxxxxxxxxxxx4nzvca9cmczlw",
    oninput: (e) => { state.existing = e.target.value.trim(); } });

  const controls = el("div", { class: "form-grid" },
    field("Threshold k", select([2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({ value: k, label: String(k) })), state.threshold,
      (v) => { state.threshold = v; })),
    field("Total shares n", select(Array.from({ length: 30 }, (_, i) => i + 2).map((n) => ({ value: n, label: String(n) })), state.count,
      (v) => { state.count = v; })),
    field("Identifier", el("input", { class: "mono", maxlength: 4, value: state.id, spellcheck: false,
      oninput: (e) => { state.id = e.target.value.toUpperCase(); e.target.value = state.id; } })),
    state.mode === "new"
      ? field("Seed size", select([{ value: "128", label: "128-bit" }, { value: "256", label: "256-bit" }], state.bits, (v) => { state.bits = v; }))
      : null,
  );

  function build() {
    try {
      const k = Number(state.threshold);
      const n = Number(state.count);
      if (n < k) throw new Error("total shares must be at least the threshold");
      const indices = shareIndexSequence(Math.max(n, k));

      let seedShares;
      let secret;
      if (state.mode === "new") {
        const bytes = state.seedHex ? hexToBytes(state.seedHex) : randomBytes(state.bits === "256" ? 32 : 16);
        // For a brand-new secret the first k shares are random; the secret is implied.
        seedShares = indices.slice(0, k).map((idx) =>
          fromSeed({ hrp: state.hrp, threshold: k, id: state.id, shareIndex: idx, data: bytes }));
        secret = interpolateAt(seedShares, "S");
      } else {
        if (!state.existing) throw new Error("paste an existing S share (or use New secret)");
        const res = verify(state.existing);
        if (!res.ok) throw new Error(`existing share is not valid: ${res.error}`);
        const p = parts(state.existing);
        if (p.shareIndex.toUpperCase() !== "S") throw new Error("the existing share must have index S");
        const bytes = payloadToBytes(p.payload);
        const data = bytes;
        const normalized = fromSeed({ hrp: p.hrp, threshold: k, id: p.id || state.id, shareIndex: "S", data });
        const randoms = indices.slice(0, k - 1).map((idx) =>
          fromSeed({ hrp: p.hrp, threshold: k, id: p.id || state.id, shareIndex: idx, data: randomBytes(data.length) }));
        seedShares = [normalized, ...randoms];
        secret = normalized;
      }

      const shares = deriveShares(seedShares, indices.slice(0, n));
      const verified = shares.every((s) => verify(s).ok);
      render({ secret, shares, verified, k, n });
    } catch (e) {
      result.replaceChildren(el("p", { class: "error", text: e.message }));
    }
  }

  const hexToBytes = (hex) => {
    const clean = hex.replace(/[^0-9a-fA-F]/g, "");
    const out = [];
    for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
    return out;
  };

  function render({ secret, shares, verified, k, n }) {
    const secretCard = el("div", { class: "callout warn" },
      el("strong", { text: "The secret seed (S share)" }),
      el("p", { class: "muted", text: "Whoever holds any " + k + " shares can rebuild this. Distribute the shares, never the S share." }),
      el("div", { class: "share" },
        el("code", { class: "share-code", text: secret }),
        copyButton(secret),
      ),
      el("div", { class: "kv" },
        el("span", { text: "hex" }), el("code", { text: bytesToHex(payloadToBytes(parts(secret).payload)) }),
        el("span", { text: "checksum" }), el("code", { text: verify(secret).ok ? "ok" : "FAILED" }),
      ),
    );
    const list = el("div", { class: "share-list" },
      ...shares.map((s) => el("div", { class: "share" },
        el("span", { class: "share-label", text: `share ${parts(s).shareIndex.toUpperCase()}` }),
        el("code", { class: "share-code", text: s }),
        verify(s).ok ? el("span", { class: "badge ok", text: "ok" }) : el("span", { class: "badge bad", text: "bad" }),
        copyButton(s),
      )),
    );
    result.replaceChildren(
      el("div", { class: "verdict ok" },
        el("strong", { text: `Created ${n} shares with threshold ${k}` }),
        el("span", { text: verified ? "every share verified" : "verification failed" }),
      ),
      secretCard,
      el("h3", { text: "Shares" }),
      el("p", { class: "muted small", text: "Each share is a point on the same degree-(k−1) polynomial. The volvelle translation step derives new shares by interpolation; here the app does the same arithmetic." }),
      list,
      el("div", { class: "actions" },
        copyButton(shares.join("\n"), "Copy all shares"),
        el("span", { class: "muted small", text: "Store each on its own worksheet, in separate places." }),
      ),
    );
  }

  const seg = el("div", { class: "tabs" },
    el("button", { class: "tab active", type: "button", text: "New secret", onclick: () => setMode("new") }),
    el("button", { class: "tab", type: "button", text: "Re-share existing", onclick: () => setMode("existing") }),
  );

  const newBody = el("div", { class: "tab-body" },
    controls,
    el("div", { class: "actions" },
      el("button", { class: "primary", type: "button", text: "Generate shares", onclick: build }),
      el("button", { class: "ghost", type: "button", text: "Use dice payload", disabled: !state.seedHex, id: "split-dice",
        onclick: () => build() }),
    ),
  );
  const existingBody = el("div", { class: "tab-body hidden" }, existingInput);

  function setMode(mode) {
    state.mode = mode;
    [...seg.children].forEach((b, i) => b.classList.toggle("active", (i === 0) === (mode === "new")));
    newBody.classList.toggle("hidden", mode !== "new");
    existingBody.classList.toggle("hidden", mode === "new");
  }

  root.append(card("Split worksheet",
    el("p", { class: "lede", text: "Split a seed into n Shamir shares that need any k to reconstruct. Generate the first k shares, then derive the rest by translation, the job of the fusion/translation volvelle." }),
    seg, newBody, existingBody, result));

  ctx.setSplitHex = (hex) => {
    state.seedHex = hex;
    const button = document.getElementById("split-dice");
    if (button) button.disabled = false;
    toast("Payload loaded into split worksheet");
  };
}
