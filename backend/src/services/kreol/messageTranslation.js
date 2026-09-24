// On-demand translation of the message a user has just checked, for display next
// to the result. It is a side channel: POST /api/analyze never calls it, the
// verdict never waits on it, and nothing it returns is evidence.
//
//   message + wanted language
//     -> detect the message's own language (deterministic, language.js)
//     -> pick a supported direction (Kreol <-> English, Kreol <-> French only)
//     -> translateText(): protected entities, validation, one retry
//
// The web client swaps redaction placeholders for <PRIV_n> tokens before sending,
// so phone numbers and account numbers never reach the model. entities.js treats
// a <PRIV_n> like any other entity, so a dropped, duplicated or invented token is
// rejected by the same validation as a dropped URL.

import { detectLanguageMix } from "./language.js";
import { translateText } from "./translation.js";

export const TRANSLATE_TARGETS = Object.freeze(["mfe", "en", "fr"]);
export const MAX_TRANSLATE_LENGTH = 2000;

const DIRECTION_BY_PAIR = Object.freeze({
  "mfe>en": "mfe-en",
  "en>mfe": "en-mfe",
  "fr>mfe": "fr-mfe",
  "mfe>fr": "mfe-fr",
});

/**
 * @param {string} text
 * @param {"mfe"|"en"|"fr"} target
 * @param {{ provider?: Function }} [options]
 * @returns {Promise<{ status: "ok"|"same_language"|"undetermined"|"unsupported"|"rejected"|"unavailable",
 *   source: "mfe"|"en"|"fr"|null, target: string, text: string|null, problems: string[],
 *   machineTranslated: true, reviewed: false }>}
 */
export async function translateMessage(text, target, { provider } = {}) {
  const base = { source: null, target, text: null, problems: [], machineTranslated: true, reviewed: false };
  if (!TRANSLATE_TARGETS.includes(target) || typeof text !== "string" || text.trim() === "") {
    return { ...base, status: "unsupported" };
  }

  const mix = detectLanguageMix(text);
  // No marker word at all: detectLanguageMix defaults to "en", which is a guess.
  if (mix.languages.length === 0) return { ...base, status: "undetermined" };

  const source = mix.primary;
  if (source === target) return { ...base, source, status: "same_language" };

  const direction = DIRECTION_BY_PAIR[`${source}>${target}`];
  if (!direction) return { ...base, source, status: "unsupported" };

  const result = await translateText(text, direction, { provider });
  if (result.status === "ok") return { ...base, source, status: "ok", text: result.text };
  if (result.status === "rejected") {
    return { ...base, source, status: "rejected", problems: result.problems.map((p) => p.kind) };
  }
  // no provider, provider error, invalid input: the client only needs to know it is unavailable.
  return { ...base, source, status: "unavailable" };
}
