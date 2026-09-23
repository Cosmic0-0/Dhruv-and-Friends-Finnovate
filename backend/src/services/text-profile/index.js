// A description of pasted text for the Check screen's meta row
// ("Kreol detected · 1 link · 68 chars"). Descriptive only: it never adds a
// signal, a score or a verdict. It reuses the pipeline's own language
// markers (services/lexicon) and link extraction (services/domain-matching)
// so the web client does not carry a second copy of that logic.

import { languageScores } from "../lexicon/index.js";
import { extractLinks } from "../domain-matching/index.js";
import { normalizeText } from "../normalize/index.js";

/**
 * @param {string} text
 * @returns {{ language: "en"|"fr"|"kreol"|"mixed"|null, links: number, hosts: string[] }}
 *   language is null when no marker words were found (too short to tell).
 */
export function profileText(text) {
  const normalized = normalizeText(text);
  const ranked = Object.entries(languageScores(normalized)).sort((a, b) => b[1] - a[1]);
  const [[top, best], [, second]] = ranked;
  let language = null;
  if (best > 0) {
    // Two languages each carrying real weight = code-switched ("mixed").
    language = second >= 2 && second >= best / 2 ? "mixed" : top;
  }
  const hosts = [...new Set(extractLinks(normalized).map((l) => l.host).filter(Boolean))];
  return { language, links: extractLinks(normalized).length, hosts: hosts.slice(0, 10) };
}
