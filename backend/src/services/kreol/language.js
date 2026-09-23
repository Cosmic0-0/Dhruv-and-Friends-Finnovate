// Coarse, deterministic language detection for FraudLens text: English (en),
// French (fr) and Mauritian Kreol (mfe), including code-switched messages.
//
// This is a router for explanations, normalisation gating and retrieval - not
// a fraud detector. It never picks one language and switches the others off:
// every detector keeps running on the original text regardless of the result.
//
// How it scores: each word found in a language's marker list adds its weight
// to that language. Ambiguous words carry a lower weight (0.5) or none - for
// example "to" (Kreol "you" / English "to") and "la" (Kreol article / French
// article) count for nobody, "ou" (Kreol "you" / French "or") counts half.
// Entities (URLs, amounts, codes) are removed first so they cannot vote.
//
// Result: { primary, languages, mixed, scores, kreolStrong }
//   primary      "en" | "fr" | "mfe" (defaults to "en" when nothing matched)
//   languages    every language with real evidence, strongest first
//   mixed        more than one language has real evidence
//   kreolStrong  count of unambiguous Kreol markers (used to gate normalisation)

import { protectEntities } from "./entities.js";

const words = (s) => new Set(s.trim().split(/\s+/));

// Weight 1: words that are Kreol and (almost) nothing else, including the
// common alternative spellings (nu/pu, pey/peye, gagn/gagne, ...).
const MFE_STRONG = words(`
  pou pu pe pann zame zamai finn inn fin ena pena bizin kapav zordi aster asterla deswit touswit
  lor enn bann dimounn dimoun mwa twa mo nou nu zot bloke sispann nimero telefonn mesaz kont modpas labank lakaz
  avoy avoye reavoy partaz konfirm konfirme verifye klik pey peye gagn gagne resevwar atann mersi bonzour
  sinon avek depi kot kouma ankor seki kifer devan larzan lekip sekirite peyman transaksion demann reponn
  personn okenn eskrok fer ferm debloke reveni ale vini zour minit erdtan avan minwi repons pa kod
`);
// Weight 0.5: real Kreol words that are also words in French or English.
// ("to" and "la" are deliberately absent from every list.)
const MFE_WEAK = words("ou u sa li ek ar dan si ki");

const EN_STRONG = words(`
  the your you is are was were this that will please and with of for be been has have had not do does don't
  it we our me my send verify account payment click link details received receive debited credited claim share
  check reminder thanks thank hello dear customer security blocked suspended message phone pay free prize now
  today immediately anyone call tomorrow help just if by from at as or its them they their us password reply
`);
// "confirm" is English, French ("confirme") or a Kreol code-switch spelling.
const EN_WEAK = words("bank urgent number confirm");

const FR_STRONG = words(`
  vous votre vos est sont les des une pour avec dans sur nous merci veuillez cette ces pas je il elle ce du au aux
  que qui mot passe vérification verification envoyez communiquez jamais personne bonjour conseiller carte
  paiement reçu recu informons sécurité securite appelle demain aide ici bientôt bientot habituelle toute question
  contactez agence confirmer bloquée bloquee suspendu suspendue cher chère cordialement
`);
// "ou" is deliberately not here: French "ou" (or) is rare and single, while Kreol
// "ou" (you) repeats through a Kreol message, so counting it for French would let
// a purely Kreol text look French-mixed.
const FR_WEAK = words("de le banque client compte code");

const TOKEN_RE = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
const ACCENT_RE = /[éèêëàâçùûôîï]/u;

function scoreTokens(text) {
  const stripped = protectEntities(text).text.replace(/<[A-Z]+_\d+>/g, " ");
  const scores = { mfe: 0, en: 0, fr: 0 };
  let kreolStrong = 0;
  for (const raw of stripped.toLowerCase().match(TOKEN_RE) ?? []) {
    const token = raw.replace(/^['’-]+|['’-]+$/g, "");
    if (!token) continue;
    if (MFE_STRONG.has(token)) {
      scores.mfe += 1;
      kreolStrong += 1;
      continue; // a strong Kreol word never also votes for English/French
    }
    if (MFE_WEAK.has(token)) scores.mfe += 0.5;
    if (EN_STRONG.has(token)) scores.en += 1;
    else if (EN_WEAK.has(token)) scores.en += 0.5;
    if (FR_STRONG.has(token)) scores.fr += 1;
    else if (FR_WEAK.has(token)) scores.fr += 0.5;
    if (ACCENT_RE.test(token)) scores.fr += 0.5;
  }
  return { scores, kreolStrong };
}

const SECONDARY_MIN = 1.5;

/**
 * @param {string} text
 * @returns {{ primary: "en"|"fr"|"mfe", languages: string[], mixed: boolean, scores: {mfe:number,en:number,fr:number}, kreolStrong: number }}
 */
export function detectLanguageMix(text) {
  const { scores, kreolStrong } = scoreTokens(typeof text === "string" ? text : "");
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1] || (a[0] === "mfe" ? -1 : 1));
  if (ranked[0][1] === 0) return { primary: "en", languages: [], mixed: false, scores, kreolStrong };
  const languages = ranked.filter(([, s], i) => i === 0 || s >= SECONDARY_MIN).map(([lang]) => lang);
  return { primary: ranked[0][0], languages, mixed: languages.length > 1, scores, kreolStrong };
}

/** Legacy shape used for explanation templates: "en" | "fr" | "kreol". */
export function detectExplanationLanguage(text) {
  const { primary } = detectLanguageMix(text);
  return primary === "mfe" ? "kreol" : primary;
}

/** True when the message is Kreol-led enough to allow context-dependent respellings. */
export function isKreolDominant(text) {
  const mix = detectLanguageMix(text);
  return mix.primary === "mfe" && mix.kreolStrong >= 2;
}
