// Non-LLM, deterministic phrase detectors in English, French and Kreol
// Morisien (including code-switched text). Kreol phrasing is taken from the
// reviewed rows of data/kreol-dataset/scam-corpus.jsonl (e.g. "Konfirm ou
// kod OTP", "pa dir personn", "fre douane", "deswit"), so Kreol detection is
// testable code, not "the LLM probably understands it".
//
// Demo note: this is what lets FraudLens catch a Kreol OTP-theft SMS with
// the LLM switched off - point at the SEC-01 evidence span on screen.

import { makeSignal } from "../signals/registry.js";

export const LEXICON_VERSION = "lexicon-1.0";

// JS \b only knows ASCII word characters, so /bloqué\b/ never matches
// "bloqué " and /\bà/ misbehaves. Every pattern below is compiled with \b
// rewritten to a Unicode-letter-aware boundary.
const UNICODE_BOUNDARY = "(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))";
function compile(re, extraFlags = "") {
  const flags = [...new Set(`${re.flags}u${extraFlags}`)].join("");
  return new RegExp(re.source.replaceAll("\\b", UNICODE_BOUNDARY), flags);
}

const CREDENTIAL_NOUN =
  "(?:otp|one[- ]time (?:password|pin|code)|(?:verification|security|confirmation|sms|\\d[- ]digit|\\d+[- ]chiffres?) code|code (?:de (?:v[ée]rification|s[ée]curit[ée])|re[çc]u|[àa] \\d+ chiffres|pin)|code\\b|pin(?: code)?\\b|password|passcode|mot de passe|modpas|cvv|cvc|kod\\b)";
const SHARE_VERB =
  "(?:send|give|share|provide|confirm|reply(?: back)?(?: with)?|tell|read(?: (?:it|them))?(?: back)?|forward|text|verify|envoy(?:ez|er)|donn(?:ez|er)|communiqu(?:ez|er)|transmett(?:ez|re)|confirm(?:ez|er)|indiqu(?:ez|er)|partag(?:ez|er)|r[ée]pond(?:ez|re)(?: avec)?|renvoy(?:ez|er)|dites|avoy(?:e)?|donn|konfirm(?:e)?|dir|partaz|ekrir|reponn(?: avek)?|verifye)";

/**
 * Each rule: code, lang, pattern. `negatable` rules are skipped when a
 * negation ("never", "do not", "ne ... pas", Kreol "pa"/"zame") governs the
 * match, so "Never share your OTP" is not a request to share it.
 */
const RULES = [
  // SEC-01 - asks the user to share a credential
  { code: "SEC-01", lang: "mixed", negatable: true, re: new RegExp(`\\b${SHARE_VERB}\\b[^.!?\\n]{0,30}?\\b${CREDENTIAL_NOUN}`, "iu") },
  { code: "SEC-01", lang: "en", negatable: true, re: /\bwhat (?:is|was) (?:the |your )?(?:otp|pin|password|code)\b/iu },

  // SEC-03 - asks you to log in via a link and enter your password. Distinct
  // from SEC-01 (which catches "share/confirm/verify your OTP/password" -
  // disclosing a credential directly in-chat): here the credential is
  // entered into a linked page, so SHARE_VERB's tight 30-char window misses
  // it - "logging into the new ParkEase system with your work email and
  // password" has ~50 chars of system-name filler between "log in" and
  // "password" that a phishing template routinely inserts. A wider window
  // is safe here because "log in" + "password" co-occurring is itself the
  // signal, independent of any URL being present in the text - this is
  // what catches a screenshot whose hyperlink target isn't visible as
  // OCR'd text at all (no href renders as pixels).
  //
  // "logging" is log+ging (not log+ing), and "log into"/"logging into"
  // need "into" as an alternative to a bare "in" ("in" alone isn't a \b
  // match inside "into") - verified directly against both surface forms.
  //
  // Unlike the other rules here, the window tolerates a single embedded
  // \n rather than excluding it: services/ocr's cleanExtractedText() joins
  // every wrapped screenshot line with exactly one \n (no blank-line
  // paragraph breaks survive it), so on OCR'd text every \n is a mid-
  // sentence line-wrap artifact, not a real sentence boundary - verified
  // live against a real screenshot where "logging into" and "password"
  // landed on either side of exactly this kind of wrap.
  { code: "SEC-03", lang: "en", re: /\b(?:log|sign)(?:s|ged|ging|ed|ing)?[- ]?(?:in|into)\b[^.!?]{0,100}?\b(?:password|passcode)\b/iu },
  { code: "SEC-03", lang: "fr", re: /\b(?:connectez|identifiez)[- ]?vous\b[^.!?]{0,100}?\bmot de passe\b/iu },
  { code: "SEC-03", lang: "mfe", re: /\bkonekte\b[^.!?]{0,100}?\bmodpas\b/iu },

  // SEC-02 - remote access software
  { code: "SEC-02", lang: "mixed", re: /\b(?:anydesk|teamviewer|quick ?support|rustdesk|ultraviewer|remote (?:access|desktop|control|support) (?:app|application|software|tool)|screen[- ]?shar(?:e|ing) (?:app|application))\b/iu },

  // PAY-03 - "safe account"
  { code: "PAY-03", lang: "en", re: /\b(?:safe|secure|safety|protected|holding) account\b|\b(?:move|transfer) (?:your |all your )?(?:money|funds|savings|balance) (?:to|into) (?:a |an )?(?:new|safe|secure|temporary|protected)\b/iu },
  { code: "PAY-03", lang: "fr", re: /\bcompte (?:s[ée]curis[ée]|s[ûu]r|de s[ée]curit[ée]|temporaire)\b/iu },
  { code: "PAY-03", lang: "mfe", re: /\bkont (?:sekirize|sekirite|provizwar)\b/iu },

  // PAY-02 - unusual payment method
  { code: "PAY-02", lang: "mixed", re: /\b(?:gift ?cards?|google play (?:cards?|vouchers?|gift ?cards?)|itunes (?:cards?|vouchers?)|steam cards?|amazon (?:gift )?cards?|bitcoin|btc|crypto(?:currency)?(?: wallet)?|usdt|binance|western union|moneygram|cash courier|cartes? cadeaux?|cryptomonnaie|kart kado)\b/iu },

  // PAY-04 - fee before release
  { code: "PAY-04", lang: "en", re: /\b(?:processing|release|clearance|customs|delivery|admin(?:istration)?|activation|registration|handling|verification|unlock(?:ing)?) fee\b|\bfee (?:to|before) (?:release|receive|claim|unlock)\b|\bstarter kit\b/iu },
  { code: "PAY-04", lang: "fr", re: /\bfrais (?:de |d')(?:dossier|douane|d[ée]douanement|livraison|d[ée]blocage|traitement|v[ée]rification|inscription)\b/iu },
  { code: "PAY-04", lang: "mfe", re: /\b(?:fre|frais) (?:douane|dwann|livrezon|livraison|inscription|lenskripsion|verification|verifikasion)\b/iu },

  // PAY-07 - payment details changed (invoice / supplier fraud)
  { code: "PAY-07", lang: "en", re: /\b(?:bank(?:ing)?|account|payment) details (?:have |has )?(?:changed|been (?:changed|updated))\b|\bnew (?:bank )?account (?:details|number)\b|\bupdated (?:bank|payment) details\b/iu },
  { code: "PAY-07", lang: "fr", re: /\bchangement de banque\b|\bnouveau compte\b|\bnouvelles coordonn[ée]es bancaires\b/iu },
  { code: "PAY-07", lang: "mfe", re: /\bdetail la banque inn sanze\b|\bnouvo (?:compte|kont)\b/iu },

  // PAY-01 - asks to send money. checkPassive: "A transfer of Rs 2,000 was
  // made from your account" is a bank narrating a completed transaction, not
  // asking the reader to send anything - "transfer"/"deposit" double as
  // nouns, so the bare verb match alone can't tell an imperative demand from
  // a passive notification (see EN-14 in data/test-payloads, a genuine debit
  // alert this used to misfire on).
  { code: "PAY-01", lang: "en", checkPassive: true, re: /\b(?:pay|send|transfer|deposit|remit|wire)\b[^.!?\n]{0,30}?(?:\brs\.?\s?\d|\bmur\s?\d|€\s?\d|\$\s?\d|\bmoney\b|\bfunds?\b|\bamount\b|\bfee\b)|\bmake (?:a|the) payment\b|\bpay (?:now|the (?:fee|amount))\b/iu },
  { code: "PAY-01", lang: "fr", re: /\b(?:payez|payer|r[ée]glez|r[ée]gler|envoyez|envoyer|m'envoyer|virez|versez|verser)\b[^.!?\n]{0,30}?(?:\brs\.?\s?\d|\bmur\b|€|\bargent\b|\bmontant\b|\bfrais\b)|\beffectuer le paiement\b|\bfaire un virement\b/iu },
  { code: "PAY-01", lang: "mfe", re: /\b(?:pey|peye|avoy(?:e)?|reavoy+|envoye|fer (?:enn )?transfer|depoz(?:e)?|investi)\b[^.!?\n]{0,30}?(?:\brs\.?\s?\d|\blarzan\b|\bkas\b|\bfre\b|\bfrais\b)|\bavoy(?:e)? lor sa (?:numero|nimero)\b|\bbizin rs\.?\s?\d/iu },

  // SOC-03 - secrecy
  { code: "SOC-03", lang: "en", re: /\b(?:don'?t|do not|never) tell (?:anyone|anybody|your|dad|mum|mom)\b|\btell no ?one\b|\bkeep (?:this|it) (?:secret|confidential|between us|to yourself)\b|\bdon'?t (?:inform|contact|call) (?:your )?(?:bank|family|anyone)\b|\bbetween (?:you and me|us)\b/iu },
  { code: "SOC-03", lang: "fr", re: /\bn'en parle(?:z)? pas\b|\bne (?:le |la |les )?dites (?:rien )?[àa] personne\b|\bgardez (?:ça|cela|le|la) (?:secret|pour vous)\b/iu },
  { code: "SOC-03", lang: "mfe", re: /\bpa dir (?:personn|papa|mama|dimounn|okenn)\b|\bpa koz(?:e)? (?:ar|avek) personn\b|\bgard sa (?:sekre|pou twa)\b/iu },

  // SOC-08 - bypass normal approval / verification (BEC: "skip the usual
  // sign-off", "no need to call to confirm"). Negatable: "never bypass the
  // approval process" is a policy reminder, not a request.
  { code: "SOC-08", lang: "en", negatable: true, re: /\bbypass (?:the |our |your )?(?:normal |usual |standard )?(?:process|procedure|approvals?|controls?|checks?|sign[- ]?off)\b|\b(?:skip|without) (?:the |our )?(?:usual|normal|standard) (?:approvals?|process|procedure|checks?|sign[- ]?off|verification)\b|\bdon'?t (?:go through|involve|copy|cc|loop in) (?:finance|accounts|procurement|the (?:finance|accounts|procurement) team|anyone else)\b|\bno need to (?:verify|call|check|confirm)\b/iu },
  { code: "SOC-08", lang: "fr", negatable: true, re: /\bsans (?:passer par|la validation|l'approbation|validation)\b|\bcontourn(?:er|ez) (?:la |les )?(?:proc[ée]dure|validation|contr[ôo]les?)\b|\binutile de (?:v[ée]rifier|rappeler|confirmer)\b/iu },
  { code: "SOC-08", lang: "mfe", re: /\bpa bizin (?:verifye|konfirme|apel|telefonn)\b|\bpa pas par (?:finans|kontabilite|lakontabilite)\b/iu },

  // SOC-02 - threats
  { code: "SOC-02", lang: "en", re: /\bsuspend(?:ed|sion)?\b|\b(?:will be|has been|be) (?:blocked|locked|frozen|closed|deactivated|terminated|restricted)\b|\blegal action\b|\bprosecut(?:ion|ed)\b|\barrest(?:ed)?\b|\bpenalt(?:y|ies)\b|\bbe fined\b|\bpermanent(?:ly)? (?:lock|block|closure|freeze)\b|\blose access\b/iu },
  { code: "SOC-02", lang: "fr", re: /\bsuspendu(?:e)?\b|\bbloqu[ée](?:e)?\b|\bgel[ée]\b|\bd[ée]sactiv[ée]\b|\bpoursuites\b|\bp[ée]nalit[ée]\b|\bamende\b/iu },
  { code: "SOC-02", lang: "mfe", re: /\bbloke\b|\bsispann\b|\bsispandi\b|\bpenalite\b|\bprosekision\b|\blapolis\b/iu },

  // SOC-01 - urgency. checkSafetyContact: "contact MCB immediately" in a
  // genuine "if this wasn't you" alert is the bank telling the reader to
  // reach it through a real channel, not the message pressuring the reader -
  // see EN-14/FR-14 in data/test-payloads, genuine debit alerts this used to
  // misfire on. Scam urgency aimed at the message's own number/link is
  // unaffected (no named institution to match).
  // (?<!expires? ...) - "this code will expire in 5 minutes" is a one-time
  // code's normal, expected lifetime, not a scam deadline; "verify in 5
  // minutes or lose access" (no "expire") is unaffected. Bare "expires? in"
  // (no number) was dropped from the trailing alternative below - it
  // re-matched the exact "expire in 5 minutes" phrase the lookbehind above
  // exempts, since "in" alone satisfies \b(?:today|soon|in)\b regardless of
  // what follows; "in \d+ ..." is already covered by that lookbehind branch.
  { code: "SOC-01", lang: "en", checkSafetyContact: true, re: /\burgent(?:ly)?\b|\bimmediately\b|\bright away\b|\basap\b|\bact now\b|\bwithin \d+\s*(?:minutes?|mins?|hours?|hrs?|h)\b|(?<!expires? )\bin \d+\s*(?:minutes?|hours?)\b|\bbefore midnight\b|\btoday only\b|\bexpires? (?:today|soon)\b|\blast chance\b|\bfinal (?:notice|warning|reminder)\b/iu },
  { code: "SOC-01", lang: "fr", checkSafetyContact: true, re: /\burgente?\b|\bimm[ée]diatement\b|\bsans d[ée]lai\b|\bdans les \d+\s*(?:heures|minutes|h)\b|\bsous \d+\s*h\b|\bavant (?:minuit|\d+\s*h)\b|\bdernier (?:avis|rappel)\b|\bau plus vite\b/iu },
  { code: "SOC-01", lang: "mfe", checkSafetyContact: true, re: /\bdeswit\b|\btouswit\b|\btousuit\b|\btoutswit\b|\bzordi mem\b|\bvit vit\b|\bavan minwi\b|\bavan \d+\s*h\b|\bdan \d+\s*(?:minit|er|erdtan|zour)\b/iu },

  // SOC-04 - move to another channel / number
  { code: "SOC-04", lang: "en", re: /\b(?:whatsapp|telegram|viber) (?:me|us)\b|\b(?:contact|message|text|chat with) (?:me|us) (?:on|via) (?:whatsapp|telegram|signal|viber)\b|\bcall (?:this|the following|our) number\b|\breply to this number\b/iu },
  { code: "SOC-04", lang: "fr", re: /\bcontactez(?:-nous|-moi)? (?:sur|via|par) (?:whatsapp|telegram)\b|\bappelez (?:ce|le) num[ée]ro\b/iu },
  { code: "SOC-04", lang: "mfe", re: /\b(?:apel|telefonn) (?:lor )?sa nimero\b|\bkontakte? (?:mwa|nou) lor (?:whatsapp|telegram)\b/iu },

  // SOC-05 - prize / refund / unexpected money
  { code: "SOC-05", lang: "en", re: /\byou(?:'ve| have)? won\b|\b(?:lucky )?winner\b|\bprize\b|\blottery\b|\bjackpot\b|\beligible for a (?:tax )?refund\b|\b(?:refund|cashback) (?:of|is|pending|available|ready)\b/iu },
  { code: "SOC-05", lang: "fr", re: /\bvous avez gagn[ée]\b|\bgagnant\b|\bloterie\b|\bremboursement\b/iu },
  { code: "SOC-05", lang: "mfe", re: /\bou(?:'nn| finn|nn) gagn(?:e)?\b|\bloterie\b|\branbours(?:e)?man\b|\bremboursement\b/iu },
];

// Instructions aimed at an automated checker - never legitimate in a bank or
// telecom message. Emitted as a "rule" signal (SOC-07), independent of the
// LLM, so a prompt-injection attempt raises risk instead of lowering it.
const INJECTION_RE = compile(new RegExp(
  [
    "\\bignore (?:all |any )?(?:the )?(?:previous|prior|above|earlier|preceding) (?:instructions?|prompts?|rules?|messages?)\\b",
    "\\bdisregard (?:all |any )?(?:the )?(?:previous|prior|above|earlier)\\b",
    "\\bforget (?:all |your )?(?:previous |prior )?instructions\\b",
    "\\b(?:classify|mark|label|rate|flag|treat|output|return|respond with|answer)\\b[^.\\n]{0,40}\\b(?:as )?(?:safe|legitimate|legit|not (?:a )?scam|harmless|benign)\\b",
    "(?:^|\\n)\\s*(?:system|assistant|developer)\\s*:",
    "\\[\\s*(?:system|inst)\\s*\\]",
    "<\\/?\\s*(?:system|untrusted_message|instructions?)\\s*>",
    "\\bfraudlens (?:has )?(?:verified|approved|cleared|confirmed)\\b",
    "\\b(?:verified|approved) (?:as )?(?:safe )?by fraudlens\\b",
    "\\bas an ai(?: language)? model\\b",
    "\\bignorez (?:toutes )?les instructions\\b",
  ].join("|"),
  "iu"
));

const NEGATION_RE = /\b(?:never|not|don'?t|do not|no one|nobody|ne|jamais|pa|pann|zame|zamai)\b|\bn'/iu;
const CONDITIONAL_RE = /\b(?:if|unless|si|sinon|otherwise)\b/iu;

/** Text before `start`, back to the start of its clause (sentence or line). */
function clauseWindowBefore(text, start, maxLen) {
  const clauseStart = Math.max(text.lastIndexOf(".", start - 1), text.lastIndexOf("!", start - 1), text.lastIndexOf("?", start - 1), text.lastIndexOf("\n", start - 1));
  return text.slice(Math.max(clauseStart + 1, start - maxLen), start);
}

/** True when a negation governs the match: same clause, just before it. */
function isNegated(text, start) {
  const window = clauseWindowBefore(text, start, 40);
  if (!NEGATION_RE.test(window)) return false;
  // "Si ou pa konfirm ou OTP, ou kont pou bloke" is a threat, not a negation.
  return !CONDITIONAL_RE.test(window);
}

// A named institution reached through a real channel, not the message
// pushing you toward its own number/link - "call this number now" stays
// flagged, "contact MCB immediately" (a genuine alert's footer) doesn't.
const SAFETY_CONTACT_RE = new RegExp(
  [
    "\\b(?:call|contact|notify|report to)\\b[^.!?\\n]{0,30}?\\b(?:us|your bank|the bank|customer service|mcb|sbm|absa|bank ?one|emtel|myt)\\b",
    "\\bcontactez\\b[^.!?\\n]{0,30}?\\b(?:mcb|sbm|absa|bank ?one|emtel|myt|la banque)\\b",
    "\\b(?:kontakte|apel)\\b[^.!?\\n]{0,30}?\\b(?:labank|mcb|sbm|absa|bank ?one|emtel|myt)\\b",
  ].join("|"),
  "iu"
);

/** True when the match sits right after a "contact <real bank>" phrase, same clause. */
function isSafetyContact(text, start) {
  return SAFETY_CONTACT_RE.test(clauseWindowBefore(text, start, 80));
}

// "A transfer of Rs 2,000 was made ..." / "... has already been processed" -
// a bank stating a transaction happened, not a request to make one.
const PASSIVE_NOTIFICATION_RE = /^[^.!?\n]{0,20}?\b(?:was|were|has been|had been|have been)\b[^.!?\n]{0,20}?\b(?:made|completed|done|processed|effected|carried out|received|credited|debited|initiated|authorised|authorized)\b/iu;

/** True when the match sits inside a passive "this already happened" clause, just after it. */
function isPassiveNotification(text, end) {
  return PASSIVE_NOTIFICATION_RE.test(text.slice(end, end + 60));
}

const COMPILED = RULES.map((rule) => ({ ...rule, re: compile(rule.re, "g") }));

function firstMatch(text, rule) {
  for (const m of text.matchAll(rule.re)) {
    if (rule.negatable && isNegated(text, m.index)) continue;
    if (rule.checkPassive && isPassiveNotification(text, m.index + m[0].length)) continue;
    if (rule.checkSafetyContact && isSafetyContact(text, m.index)) continue;
    return m;
  }
  return null;
}

/**
 * One lexicon signal per code (first non-negated match), each with the exact
 * matched text and its span in `text`.
 */
export function detectLexicon(text) {
  const byCode = new Map();
  for (const rule of COMPILED) {
    if (byCode.has(rule.code)) continue;
    const m = firstMatch(text, rule);
    if (!m) continue;
    byCode.set(
      rule.code,
      makeSignal(rule.code, {
        sourceType: "lexicon",
        evidence: m[0],
        span: [m.index, m.index + m[0].length],
        metadata: { lang: rule.lang, detector: LEXICON_VERSION },
      })
    );
  }
  return [...byCode.values()];
}

/** SOC-07: text that tries to instruct an AI / FraudLens. */
export function detectInjection(text) {
  const m = INJECTION_RE.exec(text);
  if (!m) return [];
  return [
    makeSignal("SOC-07", {
      sourceType: "rule",
      evidence: m[0].trim(),
      span: [m.index, m.index + m[0].length],
      metadata: { detector: LEXICON_VERSION },
    }),
  ];
}

// ID-05: unrendered mail-merge/template placeholder syntax ("{{.FirstName}}",
// "{% tracker %}", "%%FIRST_NAME%%"). Real one-to-one correspondence never
// contains this - it's an artifact of a templating engine (Go templates/
// GoPhish, Jinja2, Mustache, Mailchimp merge tags) that failed to
// substitute a value, and is near-conclusive evidence of a mass-produced
// phishing template or simulation regardless of how calm the rest of the
// message reads. Added as a lexicon/rule signal deliberately, not a
// semantic one: a semantic-only pass can miss it entirely when the rest of
// the message reads as calm, plausible prose (verified live against a real
// HR/parking-space phishing template whose semantic-only score was 8/100).
//
// Deliberately conservative: only matches placeholder-shaped interiors
// (identifier/dotted-path characters, optionally with a leading template
// sigil), not arbitrary bracketed prose, to keep the false-positive rate
// near zero on genuine messages.
const TEMPLATE_ARTIFACT_PATTERNS = [
  /\{\{\s*[.#/]?[\w.]+\s*\}\}/gu, // {{.FirstName}}, {{ user.email }}, {{#if x}} - Go templates/GoPhish/Mustache
  /\{%\s*[.#/]?[\w. ]+\s*%\}/gu, // {% tracker %} - Jinja2/Django
  /%%[\w.]+%%/gu, // %%FIRST_NAME%% - Mailchimp-style merge tags
];

/** ID-05: unrendered mail-merge/template placeholder syntax, see above. */
export function detectTemplateArtifacts(text) {
  for (const pattern of TEMPLATE_ARTIFACT_PATTERNS) {
    const m = pattern.exec(text);
    if (m) {
      return [
        makeSignal("ID-05", {
          sourceType: "rule",
          evidence: m[0],
          span: [m.index, m.index + m[0].length],
          metadata: { detector: LEXICON_VERSION },
        }),
      ];
    }
  }
  return [];
}

const KREOL_MARKERS = /\b(?:ou|mo|to|nou|pou|lor|finn|inn|pe|bizin|zordi|deswit|avoy|ena|pena|kav|ek|sa|bann|enn|dimounn|kont|larzan|zis|gagn)\b/giu;
const FRENCH_MARKERS = /\b(?:vous|votre|vos|est|les|des|une|pour|avec|dans|sur|nous|merci|compte|veuillez|cette)\b/giu;
const ENGLISH_MARKERS = /\b(?:the|your|you|is|are|to|and|this|will|please|account|now|with)\b/giu;

/** Coarse deterministic language guess for explanation templates: "en" | "fr" | "kreol". */
export function detectLanguage(text) {
  const count = (re) => (text.match(re) || []).length;
  const scores = { kreol: count(KREOL_MARKERS), fr: count(FRENCH_MARKERS), en: count(ENGLISH_MARKERS) };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] === 0 ? "en" : best[0];
}
