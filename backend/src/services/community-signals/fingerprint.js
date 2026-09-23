// Non-LLM, deterministic message fingerprinting for community wave detection.
//
// Compliance note (data minimisation): the raw message is NEVER stored. Only
// two derived, non-reversible values are persisted per report event:
//   - templateHash: SHA-256 of a normalized "template" of the message, so
//     copies of the same scam that differ only in amounts, phone numbers,
//     names redacted to placeholders, or URL paths collapse to one hash.
//   - simhash: a 64-bit SimHash over the word tokens of that same template,
//     so near-duplicates (a word changed, a sentence reordered) still match
//     by Hamming distance even when the exact hash differs.
// Both are computed on text that has already passed through redact() (see
// services/redact), so no personal identifier contributes to either value.

import { createHash } from "node:crypto";

const PLACEHOLDER_RE = /\[(?:phone|email|account)[^\]]*\](?:@[^\s]+)?/gi;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,10})(?:\/[^\s]*)?/gi;
const SIMHASH_BITS = 64n;

/**
 * Collapses a (redacted) message to its reusable scam "template": accents
 * stripped (so Kreol/French spelling variants like "vérifier"/"verifier"
 * align), placeholders -> "ph", URLs -> bare hostname, digit runs -> "#",
 * punctuation dropped, whitespace collapsed.
 * @param {string} text
 * @returns {string}
 */
export function normalizeTemplate(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(PLACEHOLDER_RE, " ph ")
    .replace(URL_RE, " $1 ")
    .replace(/\d+(?:[.,\s]\d+)*/g, " # ")
    .replace(/[^\p{L}\p{N}#.\s-]/gu, " ")
    .replace(/(?<!\p{L})[.-]|[.-](?!\p{L})/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function templateTokens(text) {
  const normalized = normalizeTemplate(text);
  return normalized ? normalized.split(" ") : [];
}

/** @returns {string} 16 hex chars (64 bits) of SHA-256 over the normalized template */
export function templateHash(text) {
  return createHash("sha256").update(normalizeTemplate(text)).digest("hex").slice(0, 16);
}

function hash64(value) {
  return BigInt(`0x${createHash("sha1").update(value).digest("hex").slice(0, 16)}`);
}

/**
 * Charikar SimHash over the template's word tokens. Similar templates
 * produce hashes a small Hamming distance apart.
 *
 * Unigram features (not 2-/3-word shingles) chosen by measurement on
 * SMS-length scam variants: a one-word substitution lands at distance 4-5,
 * the same template retargeted at a different bank (MCB -> SBM) at ~11, and
 * unrelated scams at 28+. 3-word shingles put even a light rewording at ~28,
 * indistinguishable from an unrelated message - too brittle for texts this
 * short. See WAVE_RULES_V1.simhashMaxDistance for the threshold this implies.
 * @returns {string} 16 hex chars
 */
export function simhash(text) {
  const weights = new Array(Number(SIMHASH_BITS)).fill(0);
  for (const token of templateTokens(text)) {
    const h = hash64(token);
    for (let bit = 0n; bit < SIMHASH_BITS; bit++) {
      weights[Number(bit)] += (h >> bit) & 1n ? 1 : -1;
    }
  }
  let out = 0n;
  weights.forEach((w, bit) => {
    if (w > 0) out |= 1n << BigInt(bit);
  });
  return out.toString(16).padStart(16, "0");
}

export function hammingDistance(hexA, hexB) {
  let x = BigInt(`0x${hexA}`) ^ BigInt(`0x${hexB}`);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/**
 * @param {string} redactedText must already be redacted (services/redact)
 */
export function fingerprintMessage(redactedText) {
  return {
    templateHash: templateHash(redactedText),
    simhash: simhash(redactedText),
    tokenCount: templateTokens(redactedText).length,
  };
}
