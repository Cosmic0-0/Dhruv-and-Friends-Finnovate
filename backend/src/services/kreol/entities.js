// Protected-entity layer for the Kreol language services.
//
// Anything a fraud message is *about* (links, amounts, codes, phone numbers,
// addresses) must survive normalisation, translation and generation exactly.
// findEntities() locates them, protectEntities() swaps them for stable
// placeholders before text goes to a translator, restoreEntities() puts the
// exact original strings back, and validateEntities() rejects a translation
// that lost, duplicated, altered or invented an entity.
//
// Deterministic, no I/O, no model calls.

const CURRENCY = String.raw`(?:Rs\.?|MUR|USD|EUR|GBP|€|\$|£)`;
const AMOUNT_BODY = String.raw`(?:\d{1,3}(?:[ ,.  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;

// Priority order: earlier types claim their span first; later matches that
// overlap a claimed span are dropped.
const PATTERNS = [
  ["url", /\b(?:https?:\/\/|www\.)[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/giu],
  ["email", /\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}\b/giu],
  ["amount", new RegExp(String.raw`(?<![\p{L}\p{N}])${CURRENCY}\s?${AMOUNT_BODY}(?![\p{L}\p{N}])|(?<![\p{L}\p{N}.,])${AMOUNT_BODY}\s?(?:Rs|MUR|USD|EUR|€)(?![\p{L}\p{N}])`, "giu")],
  ["date", /(?<![\p{N}])(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})(?![\p{N}])/gu],
  ["domain", /(?<![\p{L}\p{N}@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,24})(?![\p{L}\p{N}-])(?:\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]])?/giu],
  ["username", /(?<![\p{L}\p{N}_])@[A-Za-z0-9_.]{3,30}/gu],
  ["phone", /(?<![\p{N}])\+?\d{2,3}[ -]?\d{3,4}[ -]?\d{4}(?![\p{N}])/gu],
  // OTPs, PINs, account/reference numbers: any remaining run of 4+ digits,
  // allowing single spaces or hyphens between digit groups.
  ["number", /(?<![\p{L}\p{N}])\d(?:[ -]?\d){3,}(?![\p{L}\p{N}])/gu],
];

// A bare "domain" match must not swallow abbreviations such as "e.g" or "a.m".
const NOT_A_DOMAIN = /^(?:e\.g|i\.e|a\.m|p\.m|etc)\.?$/i;
// Ordinary decimals such as "3.5" or version-like text are not domains: require a letter TLD (done above).

/**
 * @param {string} text
 * @returns {{ type: string, value: string, start: number, end: number }[]} non-overlapping, ordered by position
 */
export function findEntities(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const claimed = [];
  const overlaps = (s, e) => claimed.some((c) => s < c.end && e > c.start);
  for (const [type, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (type === "domain" && NOT_A_DOMAIN.test(m[0])) continue;
      if (overlaps(start, end)) continue;
      claimed.push({ type, value: m[0], start, end });
    }
  }
  return claimed.sort((a, b) => a.start - b.start);
}

const PLACEHOLDER_RE = /<([A-Z]+)_(\d+)>/g;

/**
 * Replaces every entity with `<TYPE_n>` (n counts per type, from 1).
 * @param {string} text
 * @returns {{ text: string, entities: { placeholder: string, type: string, value: string, start: number, end: number }[] }}
 */
export function protectEntities(text) {
  const found = findEntities(text);
  const counters = {};
  const entities = found.map((e) => {
    counters[e.type] = (counters[e.type] || 0) + 1;
    return { ...e, placeholder: `<${e.type.toUpperCase()}_${counters[e.type]}>` };
  });
  let out = "";
  let cursor = 0;
  for (const e of entities) {
    out += text.slice(cursor, e.start) + e.placeholder;
    cursor = e.end;
  }
  out += text.slice(cursor);
  return { text: out, entities };
}

/** Puts the exact original values back. Placeholders that are not in `entities` are left untouched. */
export function restoreEntities(text, entities) {
  const byPlaceholder = new Map(entities.map((e) => [e.placeholder, e.value]));
  return text.replace(PLACEHOLDER_RE, (whole) => (byPlaceholder.has(whole) ? byPlaceholder.get(whole) : whole));
}

/**
 * Checks translated text that still contains placeholders.
 * Fails when a placeholder is lost or duplicated, an unknown placeholder
 * appears, or the model wrote a raw entity of its own (for example an amount
 * it made up or altered instead of using the placeholder).
 * @returns {{ ok: boolean, problems: { kind: string, detail: string }[] }}
 */
export function validateEntities(translated, entities) {
  const problems = [];
  const known = new Set(entities.map((e) => e.placeholder));
  const seen = new Map();
  for (const m of translated.matchAll(PLACEHOLDER_RE)) seen.set(m[0], (seen.get(m[0]) || 0) + 1);
  for (const e of entities) {
    const n = seen.get(e.placeholder) || 0;
    if (n === 0) problems.push({ kind: "lost", detail: e.placeholder });
    else if (n > 1) problems.push({ kind: "duplicated", detail: e.placeholder });
  }
  for (const placeholder of seen.keys()) {
    if (!known.has(placeholder)) problems.push({ kind: "unknown_placeholder", detail: placeholder });
  }
  const withoutPlaceholders = translated.replace(PLACEHOLDER_RE, " ");
  for (const raw of findEntities(withoutPlaceholders)) {
    problems.push({ kind: "unsupported_entity", detail: raw.value });
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Final check on restored text: every original entity value occurs exactly as
 * often as it did in the source.
 */
export function validateRestored(restored, entities) {
  const problems = [];
  const expected = new Map();
  for (const e of entities) expected.set(e.value, (expected.get(e.value) || 0) + 1);
  for (const [value, count] of expected) {
    const actual = restored.split(value).length - 1;
    if (actual !== count) problems.push({ kind: actual < count ? "lost" : "duplicated", detail: value });
  }
  return { ok: problems.length === 0, problems };
}
