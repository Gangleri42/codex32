// Learn tab: the eight explainers with a wheel-driven exercise each, plus a
// small GF(32) playground.  Exercises are graded against the core, not against
// fixed options.

import { add, charToValue, inv, mul, valueToChar } from "../gf32.js";
import { lessons } from "../lessons.js";
import { el, select } from "../ui.js";
import { card } from "./common.js";

function exerciseNode(exercise, ctx) {
  const input = el("input", { class: "mono ex-input", type: "text", spellcheck: false, autocomplete: "off" });
  const result = el("p", { class: "ex-result" });
  const hint = el("p", { class: "muted small ex-hint hidden", text: exercise.hint ?? "" });
  let done = false;

  function check() {
    const typed = input.value.trim();
    if (!typed) return;
    const answer = String(exercise.answer());
    done = /[^a-z0-9]/i.test(answer)
      ? typed === answer
      : typed.toLowerCase() === answer.toLowerCase();
    result.className = `ex-result ${done ? "ok" : "bad"}`;
    result.textContent = done ? "Correct." : "Not quite; check the wheel and try again.";
  }

  input.addEventListener("input", () => {
    if (done) {
      done = false;
      result.textContent = "";
      result.className = "ex-result";
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      check();
    }
  });

  const actions = el("div", { class: "actions" },
    el("button", { class: "primary", type: "button", text: "Check", onclick: check }),
    exercise.hint ? el("button", { class: "ghost", type: "button", text: "Hint", onclick: () => hint.classList.toggle("hidden") }) : null,
    exercise.show
      ? el("button", { class: "ghost", type: "button", text: "Show on the wheel", onclick: () => ctx.openWheel(exercise.show.instrument, exercise.show.a, exercise.show.b) })
      : null);

  return el("div", { class: "exercise" },
    el("p", { class: "ex-prompt" }, el("strong", { text: "Try it. " }), exercise.prompt),
    el("div", { class: "ex-row" }, input, actions),
    hint,
    result);
}

export function mountLearn(root, ctx) {
  const { data } = ctx;

  const play = el("div", { class: "playground" });
  function renderPlay(a, b) {
    const av = charToValue(a);
    const bv = charToValue(b);
    play.replaceChildren(
      el("div", { class: "pg-row" },
        select(data.code.map((c) => ({ value: c, label: c })), a, (v) => renderPlay(v, b)),
        el("span", { class: "pg-op", text: "⊕" }),
        select(data.code.map((c) => ({ value: c, label: c })), b, (v) => renderPlay(a, v)),
        el("span", { class: "result-badge", text: `${a} ⊕ ${b} = ${valueToChar(add(av, bv))}` })),
      el("div", { class: "pg-row" },
        el("span", { class: "muted", text: `${a} ⊗ ${b} = ` }),
        el("span", { class: "result-badge", text: `${valueToChar(mul(av, bv))}` }),
        el("span", { class: "muted small", text: `inverse of ${a} is ${valueToChar(inv(av))}` })),
      el("div", { class: "pg-actions" },
        el("button", { class: "ghost", type: "button", text: "Show the XOR on the wheel", onclick: () => ctx.openWheel("addition", a, b) }),
        el("button", { class: "ghost", type: "button", text: "Show the product on the fusion wheel", onclick: () => ctx.openWheel("fusion", valueToChar(mul(av, bv))) })));
  }

  root.append(
    card("What codex32 is",
      el("p", { class: "lede", text: "codex32 turns a BIP32 master seed into a short string of bech32 characters with an error-detecting checksum, and splits it into Shamir shares that can be written on paper and recovered with pencil, worksheets, and the volvelles." }),
      el("p", { class: "muted", text: "Every step is a lookup, a comparison, or one XOR. That is what makes the wheels work: the arithmetic is done by aligning glyphs rather than typing into a computer." })),
    ...lessons.map((lesson, i) =>
      card(`${i + 1}. ${lesson.title}`,
        el("p", { class: "lede", text: lesson.lead }),
        ...lesson.sections.flatMap((s) => [s.heading ? el("h3", { text: s.heading }) : null, el("p", { class: "muted", text: s.body })]),
        exerciseNode(lesson.exercise, ctx))),
    card("GF(32) playground",
      el("p", { class: "muted", text: "Each character is a number 0–31. Addition is XOR; multiplication is polynomial multiplication modulo x⁵+x³+1. Every nonzero character has an inverse, so you can divide too." }),
      play));

  renderPlay("A", "T");
}
