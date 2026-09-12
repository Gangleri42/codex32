// Learn tab: a short primer plus an interactive GF(32) playground.

import { add, charToValue, inv, mul, valueToChar } from "../gf32.js";
import { el, select } from "../ui.js";
import { card } from "./common.js";

export function mountLearn(root, ctx) {
  const { data } = ctx;
  const play = el("div", { class: "playground" });

  function renderPlay(a, b) {
    const av = charToValue(a);
    const bv = charToValue(b);
    const sum = valueToChar(add(av, bv));
    const product = valueToChar(mul(av, bv));
    play.replaceChildren(
      el("div", { class: "pg-row" },
        select(data.code.map((c) => ({ value: c, label: c })), a, (v) => renderPlay(v, b)),
        el("span", { class: "pg-op", text: "⊕" }),
        select(data.code.map((c) => ({ value: c, label: c })), b, (v) => renderPlay(a, v)),
        el("span", { class: "result-badge", text: `${a} ⊕ ${b} = ${sum}` }),
      ),
      el("div", { class: "pg-row" },
        el("span", { class: "muted", text: `${a} ⊗ ${b}` }),
        el("span", { class: "result-badge", text: `${product}` }),
        el("span", { class: "muted small", text: `inverse of ${a} is ${valueToChar(inv(av))}; division works because every nonzero element has one` }),
      ),
      el("div", { class: "pg-actions" },
        el("button", { class: "ghost", type: "button", text: "Show the addition on the wheel", onclick: () => ctx.openWheel("addition", a, b) }),
        el("button", { class: "ghost", type: "button", text: "Show the product on the fusion wheel", onclick: () => ctx.openWheel("fusion", product) }),
      ),
    );
  }

  const wheelList = [
    ["Addition", "XOR two characters: turn to the first, read the window labelled with the second."],
    ["Fusion", "Multiply over GF(32): the window sets the multiplier, the inner ring points at products."],
    ["Translation", "The reverse face: translate a share by a fusion symbol."],
    ["Recovery", "Turn to the share you are translating, then read the factors aimed at the other indices."],
  ];

  root.append(
    card("What codex32 is",
      el("p", { class: "lede", text: "codex32 turns a BIP32 master seed into a short string of bech32 characters with an error-detecting checksum, and splits it into Shamir shares that can be written on paper and recovered with pencil, worksheets, and the volvelles." }),
      el("p", { class: "muted", text: "It is intentionally low-tech: every step is a lookup, a comparison, or one XOR. That is what makes the wheels work — the arithmetic is done by aligning glyphs rather than typing into a computer." }),
    ),
    card("The field is just 32 characters",
      el("p", { class: "muted", text: "Each character is a number 0–31. Addition is XOR of the five bits; multiplication is polynomial multiplication modulo x⁵+x³+1. Every nonzero character has an inverse, so you can divide too." }),
      play,
    ),
    card("The four volvelles",
      el("ul", { class: "wheel-list" }, ...wheelList.map(([name, text]) =>
        el("li", {}, el("strong", { text: `${name}. ` }), text))),
      el("p", { class: "muted small", text: "Open the Explore tab to spin them; the worksheets use the same arithmetic under the hood so you can check your work." }),
    ),
    card("Use it carefully",
      el("p", { class: "muted", text: "This app is an educational companion to the codex32 booklet. It is not a wallet and does not touch the network. For anything holding real value, verify with a compatible implementation and never type a seed into an untrusted device." }),
    ),
  );
  renderPlay("A", "T");
}
