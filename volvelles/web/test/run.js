// Verifies the JS codex32 port against the rust-codex32 reference vectors.
// Run: node test/run.js
import assert from "node:assert/strict";
import * as gf from "../js/gf32.js";
import * as c32 from "../js/codex32.js";
import * as ladder from "../js/worksheets/ladder.js";
import * as errs from "../js/errors.js";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};

test("alphabet round-trips", () => {
  const s = Array.from({ length: 32 }, (_, v) => gf.valueToChar(v)).join("");
  assert.equal(s, "qpzry9x8gf2tvdw0s3jn54khce6mua7l");
});

test("multiplication matches a from-scratch carryless mul", () => {
  const reduce = (x) => {
    let acc = 0;
    for (let i = 0; i < 5; i++) {
      if (x & (1 << i)) acc ^= 1 << i;
    }
    return acc;
  };
  const naive = (x, y) => {
    let acc = 0;
    for (let i = 0; i < 5; i++) {
      if (x & (1 << i)) acc ^= y << i;
    }
    // reduce mod x^5 + x^3 + 1 (0b101001)
    for (let bit = 9; bit >= 5; bit--) {
      if (acc & (1 << bit)) acc ^= 0b101001 << (bit - 5);
    }
    return reduce(acc);
  };
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 32; y++) {
      assert.equal(gf.mul(x, y), naive(x, y), `mul(${x},${y})`);
    }
  }
});

test("inverse property", () => {
  for (let x = 1; x < 32; x++) assert.equal(gf.mul(x, gf.inv(x)), 1);
});

test("translation wheel (rust gf32::tests::translation_wheel)", () => {
  assert.equal(gf.powers(20).map(gf.valueToChar).join(""), "p529kt3uw8hlmecvxr470na6djfsgyz");
});

test("recovery wheel (rust gf32::tests::recovery_wheel)", () => {
  assert.equal(
    gf.powers(10).map((v) => gf.valueToChar(gf.add(v, 16))).join(""),
    "36xp78tgk9ldaecjy4mvh0funwr2zq5",
  );
});

test("bip_vector_1: parse + payload bytes", () => {
  const secret = "ms10testsxxxxxxxxxxxxxxxxxxxxxxxxxx4nzvca9cmczlw";
  assert.equal(c32.verify(secret).ok, true);
  const p = c32.parts(secret);
  assert.equal(p.hrp, "ms");
  assert.equal(p.threshold, 0);
  assert.equal(p.shareIndex.toUpperCase(), "S");
  assert.equal(p.id, "test");
  assert.equal(p.payload, "xxxxxxxxxxxxxxxxxxxxxxxxxx");
  assert.equal(p.checksum, "4nzvca9cmczlw");
  assert.equal(c32.bytesToHex(c32.payloadToBytes(p.payload)), "318c6318c6318c6318c6318c6318c631");
});

test("bip_vector_2: interpolate D and S from A,C", () => {
  const shareAC = [
    "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM",
    "MS12NAMECACDEFGHJKLMNPQRSTUVWXYZ023FTR2GDZMPY6PN",
  ];
  assert.equal(c32.interpolateAt(shareAC, "D"), "MS12NAMEDLL4F8JLH4E5VDVULDLFXU2JHDNLSM97XVENRXEG");
  const seed = c32.interpolateAt(shareAC, "S");
  assert.equal(seed, "MS12NAMES6XQGUZTTXKEQNJSJZV4JV3NZ5K3KWGSPHUH6EVW");
  assert.equal(c32.bytesToHex(c32.payloadToBytes(c32.parts(seed).payload)), "d1808e096b35b209ca12132b264662a5");
});

test("bip_vector_3: k=3 interpolation", () => {
  const sac = [
    "ms13cashsllhdmn9m42vcsamx24zrxgs3qqjzqud4m0d6nln",
    "ms13casha320zyxwvutsrqpnmlkjhgfedca2a8d0zehn8a0t",
    "ms13cashcacdefghjklmnpqrstuvwxyz023949xq35my48dr",
  ];
  assert.equal(c32.interpolateAt(sac, "D"), "ms13cashd0wsedstcdcts64cd7wvy4m90lm28w4ffupqs7rm");
  assert.equal(c32.interpolateAt(sac, "E"), "ms13casheekgpemxzshcrmqhaydlp6yhms3ws7320xyxsar9");
  assert.equal(c32.interpolateAt(sac, "F"), "ms13cashf8jh6sdrkpyrsp5ut94pj8ktehhw2hfvyrj48704");
});

test("bip_vector_4: from_seed bit packing", () => {
  const seedB = [
    0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88,
    0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00,
    0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88,
    0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00,
  ];
  const seed = c32.fromSeed({ hrp: "ms", threshold: 0, id: "leet", shareIndex: "S", data: seedB });
  assert.equal(seed, "ms10leetsllhdmn9m42vcsamx24zrxgs3qrl7ahwvhw4fnzrhve25gvezzyqqtum9pgv99ycma");
  assert.deepEqual(c32.payloadToBytes(c32.parts(seed).payload), seedB);
});

test("bip_vector_5: long seed", () => {
  const long =
    "MS100C8VSM32ZXFGUHPCHTLUPZRY9X8GF2TVDW0S3JN54KHCE6MUA7LQPZYGSFJD6AN074RXVCEMLH8WU3TK925ACDEFGHJKLMNPQRSTUVWXY06FHPV80UNDVARHRAK";
  assert.equal(c32.verify(long).ok, true);
  assert.equal(
    c32.bytesToHex(c32.payloadToBytes(c32.parts(long).payload)),
    "dc5423251cb87175ff8110c8531d0952d8d73e1194e95b5f19d6f9df7c01111104c9baecdfea8cccc677fb9ddc8aec5553b86e528bcadfdcc201c17c638c47e9",
  );
});

test("fromUnchecksummed matches the BIP vector", () => {
  assert.equal(
    c32.fromUnchecksummed("ms10testsxxxxxxxxxxxxxxxxxxxxxxxxxx"),
    "ms10testsxxxxxxxxxxxxxxxxxxxxxxxxxx4nzvca9cmczlw",
  );
});

test("bad checksums are rejected", () => {
  const bad = [
    "ms10fauxsxxxxxxxxxxxxxxxxxxxxxxxxxxve740yyge2ghq",
    "ms10fauxsxxxxxxxxxxxxxxxxxxxxxxxxxxve740yyge2ghp",
    "ms10fauxsxxxxxxxxxxxxxxxxxxxxxxxxxxxxlk3yepcstwr",
  ];
  for (const s of bad) assert.equal(c32.verify(s).ok, false, s);
});

test("mixed case is rejected", () => {
  assert.equal(c32.verify("Ms10fauxsxxxxxxxxxxxxxxxxxxxxxxxxxxuqxkk05lyf3x2").ok, false);
});

test("k=2: derive shares, then recover from any two", () => {
  const rnd = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 256));
  const a = c32.fromSeed({ hrp: "ms", threshold: 2, id: "wyrm", shareIndex: "A", data: rnd(16) });
  const c = c32.fromSeed({ hrp: "ms", threshold: 2, id: "wyrm", shareIndex: "C", data: rnd(16) });
  const [s, d, e] = c32.deriveShares([a, c], ["S", "D", "E"]);
  assert.equal(c32.verify(s).ok, true);
  assert.equal(c32.parts(s).shareIndex.toUpperCase(), "S");
  assert.equal(c32.recoverSecret([a, c]), s);
  assert.equal(c32.recoverSecret([a, d]), s);
  assert.equal(c32.recoverSecret([c, e]), s);
});

test("k=3: derive shares, then recover from any three", () => {
  const rnd = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 256));
  const seeds = ["A", "C", "D"].map((idx) =>
    c32.fromSeed({ hrp: "ms", threshold: 3, id: "wyrm", shareIndex: idx, data: rnd(16) }),
  );
  const extras = c32.deriveShares(seeds, ["S", "E", "F", "G"]);
  const s = extras[0];
  assert.equal(c32.verify(s).ok, true);
  assert.equal(c32.recoverSecret(seeds), s);
  assert.equal(c32.recoverSecret([seeds[0], seeds[1], extras[1]]), s);
  assert.equal(c32.recoverSecret([seeds[0], extras[1], extras[2]]), s);
  assert.throws(() => c32.recoverSecret([seeds[0], seeds[0], seeds[1]]), /repeated/);
});

test("checksum worksheet: initial residue and layout", () => {
  assert.equal(ladder.INITIAL_RESIDUE.map((v) => gf.toChar(v, true)).join(""), "33XW87RR3YLJG");
  const layout = ladder.ladderLayout(48);
  assert.equal(layout.cells.length, 490);
  assert.equal(layout.rows, 35);
  assert.equal(layout.numSteps, 16);
  assert.equal(layout.topDiagonal.length, 45);
});

test("checksum worksheet: vector 2 share A verifies", () => {
  const share = "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM";
  const layout = ladder.ladderLayout(48);
  const chars = [...share.slice(3)].map(gf.feFromChar);
  const values = ladder.fill(layout, chars);
  assert.equal(ladder.lastRow(layout, values).map((v) => gf.toChar(v, true)).join(""), "SECRETSHARE32");
  assert.equal(ladder.isComplete(layout, values), true);
});

test("checksum worksheet: generation reproduces the checksum", () => {
  const share = "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM";
  const layout = ladder.ladderLayout(48);
  const data = [...share.slice(3, 35)].map(gf.feFromChar);
  const { checksum } = ladder.solvePink(layout, data);
  assert.equal(checksum.map((v) => gf.toChar(v, true)).join(""), share.slice(35));
});

test("checksum worksheet: names the column of a planted error", () => {
  const share = "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM";
  const layout = ladder.ladderLayout(48);
  const good = ladder.fill(layout, [...share.slice(3)].map(gf.feFromChar));
  const badChars = [...share.slice(3)];
  badChars[10] = badChars[10] === "A" ? "C" : "A";
  const bad = ladder.fill(layout, badChars.map(gf.feFromChar));
  const d = ladder.diagnose(layout, good, bad);
  assert.ok(d, "an error is found");
  assert.equal(d.cellId, layout.positionToCell(10));
});

test("error correction: syndrome, single, double and erasure", () => {
  const good = "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM";
  const body = [...good.slice(3)].map(gf.feFromChar);
  assert.equal(errs.syndrome(body).every((v) => v === 0), true);

  const one = [...good];
  one[10] = one[10] === "A" ? "C" : "A";
  const single = errs.correct(one.join(""), { maxSubstitutions: 1 });
  assert.equal(single[0].corrected, good);
  assert.deepEqual(single[0].edits.map((e) => e.pos), [7]);

  const two = [...good];
  two[8] = "A";
  two[30] = "C";
  const double = errs.correct(two.join(""), { maxSubstitutions: 2 });
  assert.equal(double.some((c) => c.corrected === good), true);

  const erased = good.slice(0, 10) + "?" + good.slice(11);
  const solved = errs.correct(erased, { maxSubstitutions: 1 });
  assert.equal(solved[0].corrected, good);
  assert.equal(solved[0].edits[0].kind, "erasure");
});

console.log(`\n${passed} tests passed`);
