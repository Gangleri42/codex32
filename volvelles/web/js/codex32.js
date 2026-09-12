// codex32: BCH checksums and Shamir secret sharing over GF(32).
//
// A faithful port of the rust-codex32 reference implementation, itself the
// reference for BIP-XXXX.  Everything is string-in/string-out so the app can
// show exactly the characters a user writes on a worksheet.

import { add, charToValue, div, mul, valueToChar, CHARS } from "./gf32.js";

const SHORT_LEN = 13;
const LONG_LEN = 15;

const defs = {
  short: {
    generator: [25, 27, 17, 8, 0, 25, 25, 25, 31, 27, 24, 16, 16],
    target: "secretshare32".split("").map(charToValue),
    length: SHORT_LEN,
  },
  long: {
    generator: [15, 10, 25, 26, 9, 25, 21, 6, 23, 21, 6, 5, 22, 4, 23],
    target: "secretshare32ex".split("").map(charToValue),
    length: LONG_LEN,
  },
};

export class Engine {
  constructor(kind) {
    const def = defs[kind];
    this.kind = kind;
    this.generator = def.generator;
    this.target = def.target;
    this.residue = [...new Array(def.length - 1).fill(0), 1];
  }

  inputFe(e) {
    const { residue, generator } = this;
    const n = residue.length;
    const xn = residue[0];
    for (let i = 1; i < n; i++) residue[i - 1] = residue[i];
    residue[n - 1] = e;
    for (let i = 0; i < n; i++) residue[i] ^= mul(generator[i], xn);
  }

  inputHrp(hrp) {
    for (const ch of hrp) {
      this.inputFe((ch.toLowerCase().charCodeAt(0) >> 5) & 31);
    }
    this.inputFe(0);
    for (const ch of hrp) {
      this.inputFe(ch.toLowerCase().charCodeAt(0) & 31);
    }
  }

  inputChar(c) {
    this.inputFe(charToValue(c));
  }

  inputDataStr(s) {
    for (const c of s) this.inputChar(c);
  }

  inputOwnTarget() {
    for (const u of this.target) this.inputFe(u);
  }

  get valid() {
    return this.residue.every((v, i) => v === this.target[i]);
  }

  get residueChars() {
    return this.residue.map(valueToChar).join("");
  }
}

const checksumLengthFor = (totalLength) => (totalLength > 93 ? LONG_LEN : SHORT_LEN);
const kindFor = (length) => (checksumLengthFor(length) === LONG_LEN ? "long" : "short");

export { kindFor as checksumKindFor };

export function splitSeparator(s) {
  const i = s.lastIndexOf("1");
  if (i === -1) return { hrp: "", data: s };
  return { hrp: s.slice(0, i), data: s.slice(i + 1) };
}

// Append the correct checksum to a string that does not have one yet.
export function fromUnchecksummed(s) {
  const kind = s.length < 81 ? "short" : "long";
  const engine = new Engine(kind);
  const { hrp, data } = splitSeparator(s);
  engine.inputHrp(hrp);
  engine.inputDataStr(data);
  engine.inputOwnTarget();
  return s + engine.residueChars;
}

export function verify(s) {
  // Reject mixed case the way bech32 does.
  const hasLower = /[a-z]/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  if (hasLower && hasUpper) {
    return { ok: false, error: "mixed case: codex32 strings are all-lower or all-upper" };
  }
  const engine = new Engine(kindFor(s.length));
  const { hrp, data } = splitSeparator(s);
  try {
    engine.inputHrp(hrp);
    engine.inputDataStr(data);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!engine.valid) {
    return { ok: false, error: "bad checksum" };
  }
  return { ok: true, kind: engine.kind };
}

export function parts(s) {
  const { hrp, data } = splitSeparator(s);
  const checksumLen = checksumLengthFor(s.length);
  const thresholdChar = data[0];
  const threshold = thresholdChar === "0" ? 0 : Number(thresholdChar);
  if (thresholdChar !== "0" && !(threshold >= 2 && threshold <= 9)) {
    throw new Error(`invalid threshold ${JSON.stringify(thresholdChar)}`);
  }
  return {
    hrp,
    threshold,
    id: data.slice(1, 5),
    shareIndex: data[5],
    payload: data.slice(6, data.length - checksumLen),
    checksum: data.slice(data.length - checksumLen),
  };
}

// Convert a base-32 payload to bytes (right-padding an incomplete final group).
export function payloadToBytes(payload) {
  const out = [];
  let nextByte = 0;
  let rem = 0;
  for (const ch of payload) {
    const fe = charToValue(ch);
    if (rem < 3) {
      nextByte |= fe << (3 - rem);
    } else if (rem === 3) {
      out.push((nextByte | fe) & 0xff);
      nextByte = 0;
    } else {
      const overshoot = rem - 3;
      out.push((nextByte | (fe >> overshoot)) & 0xff);
      nextByte = (fe << (8 - overshoot)) & 0xff;
    }
    rem = (rem + 5) % 8;
  }
  return out;
}

export function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex) {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length % 2 !== 0) throw new Error("hex string must have an even length");
  const out = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

const thresholdChar = (k) => String(k);

// Build a codex32 share from raw seed bytes.
export function fromSeed({ hrp = "ms", threshold, id, shareIndex, data }) {
  if (id.length !== 4) throw new Error("id must be exactly 4 characters");
  const upper = hrp === hrp.toUpperCase();
  const body = (s) => (upper ? s.toUpperCase() : s.toLowerCase());
  let ret = `${hrp}1${thresholdChar(threshold)}${body(id)}${body(shareIndex)}`;

  let nextU5 = 0;
  let rem = 0;
  for (const byte of data) {
    const u5 = (nextU5 << (5 - rem)) | (byte >> (3 + rem));
    ret += valueToChar(u5);
    nextU5 = byte & ((1 << (3 + rem)) - 1);
    if (rem >= 2) {
      ret += valueToChar(nextU5 >> (rem - 2));
      nextU5 &= (1 << (rem - 2)) - 1;
    }
    rem = (rem + 8) % 5;
  }
  if (rem > 0) ret += valueToChar(nextU5 << (5 - rem));

  const engine = new Engine(data.length < 51 ? "short" : "long");
  engine.inputHrp(hrp);
  engine.inputDataStr(ret.slice(hrp.length + 1));
  engine.inputOwnTarget();
  return ret + engine.residueChars;
}

// Lagrange-interpolate `shares` to the share at index `target` (a character).
// Pass target "S" to recover the master secret.
export function interpolateAt(shares, target) {
  if (shares.length === 0) throw new Error("no shares given");
  const targetValue = charToValue(target);
  const first = parts(shares[0]);
  if (first.threshold > shares.length) {
    throw new Error(`need ${first.threshold} shares to reconstruct, got ${shares.length}`);
  }
  const indices = [];
  for (const share of shares) {
    const p = parts(share);
    if (share.length !== shares[0].length) throw new Error("shares have different lengths");
    if (p.hrp !== first.hrp) throw new Error("shares have different HRPs");
    if (p.threshold !== first.threshold) throw new Error("shares have different thresholds");
    if (p.id !== first.id) throw new Error("shares have different identifiers");
    indices.push(charToValue(p.shareIndex));
  }
  if (indices.includes(targetValue)) {
    return shares[indices.indexOf(targetValue)];
  }

  let mult = 1;
  for (const idx of indices) mult = mul(mult, add(idx, targetValue));

  const payloadLen = 6 + first.payload.length + first.checksum.length;
  const hrpLen = shares[0].length - payloadLen;
  const result = new Array(payloadLen).fill(0);

  for (let i = 0; i < shares.length; i++) {
    let inverse = 1;
    for (let j = 0; j < shares.length; j++) {
      if (i !== j && indices[i] === indices[j]) {
        throw new Error(`repeated share index ${shares[i][hrpLen + 5]}`);
      }
      const term = add(indices[j], i === j ? targetValue : indices[i]);
      inverse = mul(inverse, term);
    }
    const coeff = div(mult, inverse);
    for (let j = 0; j < result.length; j++) {
      const ch = shares[i][hrpLen + j];
      result[j] = add(result[j], mul(coeff, charToValue(ch)));
    }
  }

  const upper = first.hrp === first.hrp.toUpperCase();
  const body = result.map((v) => (upper ? valueToChar(v).toUpperCase() : valueToChar(v))).join("");
  return `${first.hrp}1${body}`;
}

// Derive the shares at `indices` from a set of seed shares (the paper's
// "translation" step).  Pass indices including "S" to get the implied secret.
export function deriveShares(seedShares, indices) {
  return indices.map((idx) => interpolateAt(seedShares, idx));
}

// Recover the master secret (share index S) from threshold-many shares.
export function recoverSecret(shares) {
  return interpolateAt(shares, "S");
}

export function describe(s) {
  const p = parts(s);
  const bytes = payloadToBytes(p.payload);
  return { ...p, bytes, hex: bytesToHex(bytes) };
}

export { CHARS };
