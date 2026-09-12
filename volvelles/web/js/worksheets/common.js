// Shared helpers for the worksheet tabs.

import { el, copyButton, toast } from "../ui.js";
import { CHARS } from "../gf32.js";

export const SHARE_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXYZ023456789";

// Recommended share indices for deriving shares: A, C, D, E, ... (S reserved
// for the secret itself, matching the booklet's instructions).
export const shareIndexSequence = (count, includeS = false) => {
  const seq = [...SHARE_ALPHABET];
  return includeS ? ["S", ...seq].slice(0, count) : seq.slice(0, count);
};

export function randomBytes(n) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return [...out];
}

export const bytesToHexLocal = (bytes) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
export const hexToBytesLocal = (hex) => {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const out = [];
  for (let i = 0; i + 1 < clean.length + 1; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isNaN(byte)) out.push(byte);
  }
  return out;
};

export function isBech32Id(s) {
  return s.length === 4 && [...s].every((c) => CHARS.includes(c.toLowerCase()));
}

export function shareRow(share, { label, verified, note } = {}) {
  const group = el("div", { class: "share" },
    label ? el("span", { class: "share-label", text: label }) : null,
    el("code", { class: "share-code", text: share }),
    verified ? el("span", { class: "badge ok", text: "checksum ok" }) : null,
    note ? el("span", { class: "badge", text: note }) : null,
    copyButton(share),
  );
  return group;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    toast("Copy failed");
  }
}

export const card = (title, ...children) =>
  el("section", { class: "card" }, el("h2", { text: title }), ...children);
