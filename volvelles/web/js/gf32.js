// GF(32) arithmetic for codex32, ported from BIP-0173 / rust-codex32.
//
// Elements are the integers 0..31.  Addition is XOR; multiplication uses the
// discrete-log tables for the generator alpha = 2 with reduction 0b101001.

export const CHARS = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
export const CHARS_UPPER = CHARS.toUpperCase();

const LOG = [
  0, 0, 1, 14, 2, 28, 15, 22,
  3, 5, 29, 26, 16, 7, 23, 11,
  4, 25, 6, 10, 30, 13, 27, 21,
  17, 18, 8, 19, 24, 9, 12, 20,
];

const LOG_INV = [
  1, 2, 4, 8, 16, 9, 18, 13,
  26, 29, 19, 15, 30, 21, 3, 6,
  12, 24, 25, 27, 31, 23, 7, 14,
  28, 17, 11, 22, 5, 10, 20,
];

const CHARS_INV = new Map();
for (let i = 0; i < 32; i++) {
  CHARS_INV.set(CHARS[i], i);
  CHARS_INV.set(CHARS_UPPER[i], i);
}

export const add = (x, y) => x ^ y;
export const sub = add;

export function mul(x, y) {
  if (x === 0 || y === 0) return 0;
  return LOG_INV[(LOG[x] + LOG[y]) % 31];
}

export function div(x, y) {
  if (x === 0) return 0;
  if (y === 0) throw new Error("division by zero in GF(32)");
  return LOG_INV[(31 + LOG[x] - LOG[y]) % 31];
}

export function inv(x) {
  if (x === 0) return 0;
  return LOG_INV[(31 - LOG[x]) % 31];
}

export function pow(x, n) {
  if (n === 0) return 1;
  if (x === 0) return 0;
  let e = ((LOG[x] * n) % 31 + 31) % 31;
  return LOG_INV[e];
}

// base^0 .. base^30, requiring base to generate the whole multiplicative group.
export function powers(base) {
  if (base === 0) throw new Error("0 does not generate GF(32)*");
  const seq = [1];
  let cur = 1;
  for (let i = 0; i < 30; i++) {
    cur = mul(cur, base);
    seq.push(cur);
  }
  if (new Set(seq).size !== 31) throw new Error(`${base} does not generate GF(32)*`);
  return seq;
}

// Lagrange basis l_j evaluated at x, over the interpolation x-coordinates xs.
export function lagrange(x, xj, xs) {
  let acc = 1;
  for (const xi of xs) {
    if (xi === xj) continue;
    acc = mul(mul(acc, inv(xj ^ xi)), x ^ xi);
  }
  return acc;
}

export const charToValue = (c) => {
  const v = CHARS_INV.get(c);
  if (v === undefined) throw new Error(`not a bech32 character: ${JSON.stringify(c)}`);
  return v;
};

export const valueToChar = (v) => CHARS[v & 31];

// Null-returning variant for input validation (accepts either case), and the
// case-controlled inverse.  Used by the worksheet and inspector.
export const feFromChar = (c) => {
  const v = CHARS_INV.get(typeof c === "string" ? c : "");
  return v === undefined ? null : v;
};

export const toChar = (v, upper = false) => {
  const c = CHARS[v & 31];
  return upper ? c.toUpperCase() : c;
};
