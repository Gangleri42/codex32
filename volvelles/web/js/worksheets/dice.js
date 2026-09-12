// Dice de-biasing worksheet.  Two throws of the same die give one unbiased bit
// (greater / smaller); five dice give a uniform 5-bit symbol, i.e. one valid
// codex32 character.  This is the booklet's method, made interactive.

import { CHARS } from "../gf32.js";
import { bytesToHex } from "../codex32.js";
import { copyButton, el, field, select } from "../ui.js";
import { card } from "./common.js";

const FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const roll = () => 1 + Math.floor(Math.random() * 6);

const bitsToChar = (seed) => {
  const bits = seed.map(([a, b]) => (a < b ? 0 : 1));
  const value = bits.reduce((acc, bit) => (acc << 1) | bit, 0);
  return { bits, value, char: CHARS[value] };
};

function payloadToBytes(payload) {
  let nextByte = 0;
  let rem = 0;
  const out = [];
  for (const ch of payload) {
    const fe = CHARS.indexOf(ch);
    if (rem < 3) nextByte |= fe << (3 - rem);
    else if (rem === 3) { out.push((nextByte | fe) & 0xff); nextByte = 0; }
    else {
      const over = rem - 3;
      out.push((nextByte | (fe >> over)) & 0xff);
      nextByte = (fe << (8 - over)) & 0xff;
    }
    rem = (rem + 5) % 8;
  }
  return out;
}

export function mountDice(root, ctx) {
  const state = { target: 26, dice: [], payload: "" };
  const tray = el("div", { class: "dice-tray" });
  const charOut = el("div", { class: "char-out-wrap" });
  const payloadBlock = el("div", { class: "payload-block" });

  function freshPair() {
    let a = roll();
    let b = roll();
    while (b === a) b = roll();
    return { a, b };
  }

  state.dice = Array.from({ length: 5 }, freshPair);

  function rerollDie(i, animate = false) {
    state.dice[i] = freshPair();
    renderTray();
  }

  function renderTray() {
    tray.replaceChildren(...state.dice.map((d, i) => {
      const bit = d.a < d.b ? 0 : 1;
      return el("div", { class: `die-pair${d.a === d.b ? " reject" : ""}` },
        el("span", { class: "die-n", text: `die ${i + 1}` }),
        el("div", { class: "die-faces" },
          el("button", { class: "die", type: "button", onclick: () => { d.a = (d.a % 6) + 1; renderTray(); } }, FACES[d.a]),
          el("span", { class: "cmp", text: d.a === d.b ? "=" : d.a < d.b ? "<" : ">" }),
          el("button", { class: "die", type: "button", onclick: () => { d.b = (d.b % 6) + 1; renderTray(); } }, FACES[d.b]),
        ),
        d.a === d.b
          ? el("button", { class: "ghost tiny", type: "button", text: "re-roll", onclick: () => rerollDie(i) })
          : el("span", { class: "bit", text: `bit ${bit}` }),
      );
    }));
    const valid = state.dice.every((d) => d.a !== d.b);
    const { char, bits, value } = bitsToChar(state.dice.map((d) => [d.a, d.b]));
    charOut.replaceChildren(
      el("div", { class: `char-out${valid ? "" : " pending"}` },
        el("span", { class: "muted", text: "this character" }),
        el("span", { class: "char-big", text: valid ? char : "—" }),
        el("code", { class: "muted", text: valid ? `${bits.join("")} = ${value}` : "re-roll the matched dice" }),
        el("button", { class: "primary", type: "button", disabled: !valid, text: "Add character",
          onclick: () => addChar(char) }),
      ),
    );
  }

  function addChar(char) {
    state.payload += char;
    for (let i = 0; i < 5; i++) state.dice[i] = freshPair();
    renderTray();
    renderPayload();
  }

  function rollAll() {
    const out = [];
    for (let c = 0; c < state.target; c++) {
      const seed = state.dice.map(() => {
        let a = roll();
        let b = roll();
        while (b === a) b = roll();
        return [a, b];
      });
      out.push(bitsToChar(seed).char);
    }
    state.payload = out.join("");
    for (let i = 0; i < 5; i++) state.dice[i] = freshPair();
    renderTray();
    renderPayload();
  }

  function renderPayload() {
    if (!state.payload) {
      payloadBlock.replaceChildren();
      return;
    }
    const hex = bytesToHex(payloadToBytes(state.payload));
    payloadBlock.replaceChildren(
      el("span", { class: "share-label", text: `${state.payload.length} characters · ${state.payload.length * 5} bits` }),
      el("div", { class: "payload" },
        el("code", { class: "share-code", text: state.payload }),
        copyButton(state.payload),
      ),
      el("div", { class: "kv" }, el("span", { text: "hex" }), el("code", { text: hex })),
      el("div", { class: "actions" },
        el("button", { class: "ghost", type: "button", text: "Use in checksum worksheet", onclick: () => ctx.sendHex(hex, "checksum") }),
        el("button", { class: "ghost", type: "button", text: "Use in split worksheet", onclick: () => ctx.sendHex(hex, "split") }),
      ),
    );
  }

  root.append(card("Dice de-biasing worksheet",
    el("p", { class: "lede", text: "Physical dice are never quite fair. Throw the same die twice and keep the direction of the throw (not the value): each pair is one unbiased bit. Five dice give five bits, exactly one codex32 character. If a die repeats, throw that die again." }),
    el("div", { class: "row" },
      field("Characters", select([26, 52].map((n) => ({ value: n, label: `${n} — ${n * 5}-bit (${n === 26 ? "128" : "256"}-bit seed)` })), state.target, (v) => { state.target = Number(v); })),
    ),
    el("div", { class: "actions" },
      el("button", { class: "primary", type: "button", text: "Re-roll all five", onclick: () => { for (let i = 0; i < 5; i++) state.dice[i] = freshPair(); renderTray(); } }),
      el("button", { class: "ghost", type: "button", text: "Generate all characters", onclick: rollAll }),
      el("button", { class: "ghost", type: "button", text: "Reset", onclick: () => { state.payload = ""; renderPayload(); for (let i = 0; i < 5; i++) state.dice[i] = freshPair(); renderTray(); } }),
    ),
    tray, charOut, payloadBlock));
  renderTray();
}
