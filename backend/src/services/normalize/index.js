// Non-LLM, deterministic input normalisation. Runs before every detector so
// all of them - and the semantic-evidence grounding check - see the same
// text. Deliberately does NOT map look-alike letters to ASCII: homoglyph
// detection (domain-matching URL-04) needs the original characters.

import { createHash } from "node:crypto";

const ZERO_WIDTH_RE = /[​-‍⁠﻿­]/g;

/** NFKC, zero-width/soft-hyphen removal, unified line endings, trimmed. */
export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(ZERO_WIDTH_RE, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** Case/whitespace/quote-insensitive form, used only for substring grounding. */
export function foldForMatch(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function inputHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Locates `evidence` inside `text` (already normalised) and returns the
 * exact matched substring and its span, or null when it does not occur.
 * This is the grounding test for semantic-model evidence: a quote that is
 * not in the submitted message is never shown or scored.
 */
export function locateEvidence(text, evidence) {
  if (typeof evidence !== "string") return null;
  const needle = normalizeText(evidence);
  if (needle.length < 3) return null;
  const exact = text.indexOf(needle);
  if (exact !== -1) return { text: needle, span: [exact, exact + needle.length] };

  // Tolerate case/whitespace/quote-style differences only: build a folded
  // copy of `text` with an index map back to the original.
  const folded = [];
  const map = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i].toLowerCase();
    if (/[‘’‛`´]/.test(ch)) ch = "'";
    if (/[“”«»]/.test(ch)) ch = '"';
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      ch = " ";
      prevSpace = true;
    } else {
      prevSpace = false;
    }
    folded.push(ch);
    map.push(i);
  }
  const hay = folded.join("");
  const foldedNeedle = foldForMatch(needle);
  const at = hay.indexOf(foldedNeedle);
  if (at === -1) return null;
  const start = map[at];
  const end = map[at + foldedNeedle.length - 1] + 1;
  return { text: text.slice(start, end), span: [start, end] };
}
