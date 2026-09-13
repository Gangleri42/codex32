// The eight explainers from the workbench, with a wheel-driven exercise each.
// Every answer is computed from the same arithmetic the wheels encode, so a
// lesson cannot drift from the tools.

import data from "./data.js";
import { add, charToValue, div, mul, toChar } from "./gf32.js";
import { INITIAL_RESIDUE } from "./worksheets/ladder.js";

const CODE2 = data.code2;
const S = 16;
const sym = (s) => CODE2.indexOf(s);

const lagrangeBasis = (target, xs) =>
  xs.map((xi, i) => {
    let numerator = 1;
    let denominator = 1;
    for (let j = 0; j < xs.length; j++) {
      if (i === j) continue;
      numerator = mul(numerator, add(target, xs[j]));
      denominator = mul(denominator, add(xi, xs[j]));
    }
    return div(numerator, denominator);
  });

const A = charToValue("A");
const C = charToValue("C");
const T = charToValue("T");

export const lessons = [
  {
    id: "characters",
    title: "Thirty-two characters",
    lead: "Five bits, one bech32 character, and a symbol alphabet for multipliers.",
    sections: [
      { body: "Each codex32 character stands for a five-bit field element, so thirty-two values fit in one character. The alphabet is QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L; the letters b, i, o and 1 are left out because they are easy to confuse when copied by hand." },
      { heading: "Symbols", body: "The multiplication wheels use a second alphabet, code2, from × and ℵ through the punctuation marks. It is the same thirty-two values in disguise, kept distinct so a multiplier cannot be mistaken for data." },
    ],
    exercise: {
      prompt: "Type the bech32 character for the five-bit value 11101 (twenty-nine).",
      answer: () => toChar(29, true),
      hint: "Count from zero down the alphabet Q P Z R Y 9 X 8 G F 2 T V D W 0 S 3 J N 5 4 K H C E 6 M U A 7 L.",
    },
  },
  {
    id: "addition",
    title: "The Addition wheel",
    lead: "The 32×32 table as a spiral under thirty-two windows.",
    sections: [
      { body: "The stator carries every pair of characters as a promise: a spiral of 1024 glyphs, one for each x and y. The rotor has a pointer and thirty-two windows, each labelled with the letter it adds. Turn the pointer to x and read the window labelled y, and you have x + y. Addition is symmetric; it does not matter which character is which." },
    ],
    exercise: {
      prompt: "Dial the pointer to A and read the window labelled T. What does it show?",
      answer: () => toChar(add(A, T), true),
      hint: "Addition is XOR of the five bits: A is 11101, T is 10110.",
      show: { instrument: "addition", a: "A", b: "T" },
    },
  },
  {
    id: "fusion",
    title: "Fusion",
    lead: "Multiplying symbols by turning a wheel.",
    sections: [
      { body: "Fusing combines the recovery factors of several shares into one. Turn the fusion wheel to the first symbol, find the next symbol on the inner ring, and turn the wheel to whatever it points at; repeat. The wheel winds up at the product." },
    ],
    exercise: {
      prompt: "Fusing multiplies two symbols. Type the code2 symbol for the product of β and η.",
      answer: () => CODE2[mul(sym("β"), sym("η"))],
      hint: "Multiply the two field values and read the symbol for the result.",
      show: { instrument: "fusion" },
    },
  },
  {
    id: "translation",
    title: "Translation",
    lead: "The same wheel seen from the other side.",
    sections: [
      { body: "Turn the fusion/translation wheel so the window shows a symbol, then flip it over. The translation side acts as a decoder ring, mapping each character to the character scaled by that symbol. The Q↔Q mark on the tab records that zero maps to itself." },
    ],
    exercise: {
      prompt: "Any bech32 character multiplied by Q becomes what character?",
      answer: () => toChar(0, true),
      hint: "Zero times anything is zero; the translation tab prints Q ↔ Q.",
      show: { instrument: "translation", a: "Q" },
    },
  },
  {
    id: "ladder",
    title: "The checksum ladder",
    lead: "A worksheet that divides the share by a fixed generator.",
    sections: [
      { body: "The worksheet starts from a pre-printed residue, adds the data characters pair by pair, and looks up thirteen-character words in the checksum table. When the final row reads SECRETSHARE32 the share is valid." },
    ],
    exercise: {
      prompt: "Type the thirteen-character pre-printed initial residue on the checksum worksheet.",
      answer: () => INITIAL_RESIDUE.map((v) => toChar(v, true)).join(""),
      hint: "It is the residue of the hrp plus thirteen zeros. The companion printed it with a character missing.",
    },
  },
  {
    id: "splitting",
    title: "Splitting a secret",
    lead: "Dice for the initial shares, derivation symbols for the rest.",
    sections: [
      { body: "Roll the dice de-biasing worksheet for each initial share and add a checksum. Every further share is a weighted sum of the initial ones: each input share is multiplied by its derivation symbol and the rows are added." },
    ],
    exercise: {
      prompt: "Deriving share D from the two inputs A and C, type the code2 symbol that translates share A. (Paste the symbol, or open the tables.)",
      answer: () => CODE2[lagrangeBasis(charToValue("D"), [A, C])[0]],
      hint: "The symbol is the Lagrange basis l_A evaluated at D.",
      show: { instrument: "translation" },
    },
  },
  {
    id: "recovery",
    title: "The Recovery wheel",
    lead: "Reading (w + S) / (w + p) and the wrong-order trap.",
    sections: [
      { body: "Turn the wheel to the share you want to translate. Each other share's index points at its factor (w + S) / (w + p). The pair marks make it easy to read the wheel backwards by accident, which swaps two factors." },
    ],
    exercise: {
      prompt: "With the window on A and the other share C, type the code2 symbol that C points to.",
      answer: () => CODE2[div(add(C, S), add(C, A))],
      hint: "The factor is (C + S) / (C + A).",
      show: { instrument: "recovery", a: "A" },
    },
  },
  {
    id: "errors",
    title: "Errors and residues",
    lead: "What a failed checksum can and cannot tell you.",
    sections: [
      { body: "If the final row is not SECRETSHARE32, the residue describes the difference between what you wrote and a valid share. It carries no information about the secret itself, only about the errors. Because the code has distance nine, up to four substitutions are uniquely correctable; the inspector offers candidates for you to confirm." },
    ],
    exercise: {
      prompt: "The code has distance nine. Up to how many substitutions can it uniquely correct? Type a number.",
      answer: () => "4",
      hint: "Forward error correction corrects floor((d − 1) / 2).",
    },
  },
];
