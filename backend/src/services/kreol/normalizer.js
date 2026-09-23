// Conservative Kreol spelling normaliser - for MATCHING only.
//
// Mauritian Kreol has no single spelling standard ("nou"/"nu", "pou"/"pu",
// "ou"/"u", "finn"/"inn"/"'nn"), and SMS text drops or adds accents. Detection
// rules are written against one spelling, so a scam that happens to use
// another slips past them. normalizeKreol() produces a *second* representation
// of the text in which those respellings are unified. It never replaces the
// original: callers keep `originalText` as the authoritative evidence and use
// toOriginal() to map any match on the normalised text back to the exact
// characters the sender wrote.
//
// What it will and will not rewrite:
//   - Entities (URLs, emails, amounts, phone numbers, codes, dates, usernames)
//     are never touched.
//   - Variants come from the classified resource (variants.js):
//       safe               rewritten anywhere
//       ambiguous          rewritten only when the message is Kreol-dominant
//       do_not_normalize   never rewritten ("en", "in" are English/French words)
//   - Context rules that need no dictionary:
//       "ou'nn" / "mo'nn" -> "ou finn" / "mo finn"   (contraction)
//       "<pronoun> inn|in|fin|ine" -> "<pronoun> finn" (perfective marker; "finn"
//         is by far the most frequent spelling in the training data)
//       accents are stripped when the message contains Kreol at all (matching only,
//         so "bloké" and "bloque" reach the same rule)
//   - Negation words (pa, pann, zame, zamai) and all other words are never
//     rewritten, so "Pa partaz ou OTP" can never turn into "Partaz ou OTP".
//
// Deterministic: same input, same output.

import { findEntities } from "./entities.js";
import { detectLanguageMix } from "./language.js";
import { getVariantTable } from "./variants.js";

const TOKEN_RE = /[\p{L}\p{M}][\p{L}\p{M}'’]*/gu;
const CONTRACTION_RE = /^(ou|mo|to|li|nou|nu|zot)['’]nn?$/iu;
const PERFECTIVE_VARIANTS = new Set(["inn", "in", "fin", "ine"]);
const SUBJECT_PRONOUNS = new Set(["ou", "u", "to", "mo", "li", "nou", "nu", "zot"]);

function matchCase(original, replacement) {
  if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] !== original[0].toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function overlapsEntity(spans, start, end) {
  return spans.some((s) => start < s.end && end > s.start);
}

/**
 * @param {string} originalText
 * @returns {{ originalText: string, normalizedText: string, changed: boolean,
 *   changes: { kind: string, safety: string, from: string, to: string, start: number, end: number }[],
 *   toOriginal: (start: number, end: number) => [number, number] }}
 */
export function normalizeKreol(originalText) {
  const text = typeof originalText === "string" ? originalText : "";
  const entitySpans = findEntities(text);
  const mix = detectLanguageMix(text);
  const dominant = mix.primary === "mfe" && mix.kreolStrong >= 2;
  const kreolPresent = mix.kreolStrong >= 2;
  const table = getVariantTable();

  const tokens = [...text.matchAll(TOKEN_RE)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  const edits = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (overlapsEntity(entitySpans, tok.start, tok.end)) continue;
    const lower = tok.text.toLowerCase();
    let edit = null;

    const contraction = CONTRACTION_RE.exec(tok.text);
    if (contraction) {
      edit = { kind: "contraction", safety: "safe", to: `${contraction[1]} finn` };
    } else if (PERFECTIVE_VARIANTS.has(lower) && i > 0 && SUBJECT_PRONOUNS.has(tokens[i - 1].text.toLowerCase()) && /^\s+$/.test(text.slice(tokens[i - 1].end, tok.start))) {
      edit = { kind: "perfective_marker", safety: "safe", to: matchCase(tok.text, "finn") };
    } else {
      const variant = table.get(lower);
      if (variant && (variant.safety === "safe" || (variant.safety === "ambiguous" && dominant))) {
        edit = { kind: "spelling_variant", safety: variant.safety, to: matchCase(tok.text, variant.canonical) };
      } else if (kreolPresent && /[^\u0000-\u007f]/.test(tok.text)) {
        const stripped = tok.text.normalize("NFD").replace(/\p{M}/gu, "");
        if (stripped !== tok.text) edit = { kind: "diacritic", safety: "safe", to: stripped };
      }
    }
    if (edit && edit.to !== tok.text) edits.push({ ...edit, from: tok.text, start: tok.start, end: tok.end });
  }

  // Build the normalised string and a segment map back to the original.
  const segments = []; // { nStart, nEnd, oStart, oEnd, replaced }
  let out = "";
  let cursor = 0;
  const identity = (from, to) => {
    if (to > from) {
      segments.push({ nStart: out.length, nEnd: out.length + (to - from), oStart: from, oEnd: to, replaced: false });
      out += text.slice(from, to);
    }
  };
  for (const e of edits) {
    identity(cursor, e.start);
    segments.push({ nStart: out.length, nEnd: out.length + e.to.length, oStart: e.start, oEnd: e.end, replaced: true });
    out += e.to;
    cursor = e.end;
  }
  identity(cursor, text.length);

  const segmentAt = (n) => segments.find((s) => n >= s.nStart && n < s.nEnd);
  const toOriginal = (start, end) => {
    if (segments.length === 0) return [start, end];
    const first = segmentAt(start);
    const last = segmentAt(Math.max(start, end - 1));
    const oStart = first ? (first.replaced ? first.oStart : first.oStart + (start - first.nStart)) : text.length;
    const oEnd = last ? (last.replaced ? last.oEnd : last.oStart + (end - 1 - last.nStart) + 1) : text.length;
    return [oStart, Math.max(oStart, oEnd)];
  };

  return {
    originalText: text,
    normalizedText: out,
    changed: edits.length > 0,
    changes: edits.map(({ kind, safety, from, to, start, end }) => ({ kind, safety, from, to, start, end })),
    toOriginal,
  };
}
