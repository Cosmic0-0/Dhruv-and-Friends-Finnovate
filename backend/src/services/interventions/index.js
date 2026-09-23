// Non-LLM, deterministic intervention policy: which concrete actions to
// recommend, from (risk level, signal codes, scam type, stage). The
// underlying action always comes from this table - an LLM may only reword
// it later, never invent it.
//
// "reduceConcern" lists checks that would LOWER concern. It never says a
// message is safe: one reassuring fact does not prove legitimacy.

export const POLICY_VERSION = "interventions-1.2";

const ACTIONS = Object.freeze({
  dont_open_link: "Do not open the link in this message.",
  open_official_directly: "Open the organisation's website yourself, or use its official app - never through this link.",
  dont_share_code: "Do not share any code, PIN, password or card details.",
  contact_verified_channel: "Contact the institution using a number you already trust, such as the one on the back of your card.",
  dont_install: "Do not install any app or give anyone remote access to your phone or computer.",
  dont_move_funds: "Do not move money to any 'safe account'. Real banks never ask you to do this.",
  verify_bank_change: "Do not use the contact details in this message. Confirm any change of bank details with the supplier using details your organisation already holds.",
  stop_and_verify_recipient: "Pause the conversation and check independently who will actually receive the money.",
  dont_send_money: "Do not send money yet. Verify the request independently first.",
  call_person_known_number: "Call the person on the number you already had for them - not the number in this message.",
  talk_to_someone: "Talk to someone you trust before acting. Scammers ask for secrecy so no one can warn you.",
  dont_pay_fee: "Do not pay a fee to receive a prize, refund, parcel or job.",
  hostile_instructions: "This message contains hidden instructions aimed at scam checkers - treat it as hostile.",
  block_and_report: "Block the sender and report the message to your bank or the organisation it claims to be from.",
  verify_first: "Verify the request through an official channel before you act on it.",
  // Workplace email (source "email").
  supplier_dont_use_details: "Do not use the bank details contained in this email.",
  supplier_contact_known: "Contact the supplier using contact information already stored by your organisation.",
  supplier_verify_verbally: "Verify the account change verbally before making payment.",
  exec_hold_transfer: "Do not make the transfer yet.",
  exec_normal_approval: "Confirm the request using your organisation's normal approval process.",
  exec_no_email_contacts: "Do not use contact details contained only in this email.",
  phish_no_password: "Do not open the link or enter your password.",
  phish_open_independently: "Open the organisation's service independently.",
  dont_open_attachment: "Do not open this attachment. Ask your IT or security team to check it first.",
  dont_reply_to_address: "Do not reply to this email directly - replies would go to a different address than the sender's.",
  // Uploaded documents (services/document-forensics).
  doc_verify_with_issuer: "Do not rely on this document. Ask the organisation that supposedly issued it to confirm it, using contact details you find yourself - not the ones in the document.",
  doc_dont_enable_content: "Do not enable editing, macros or content in this file, and do not open files attached inside it.",
  no_warning_signs: "No warning signs were found. Only act on requests you were expecting.",
});

const URL_CODES = ["URL-01", "URL-02", "URL-03", "URL-04", "URL-06", "URL-07", "URL-08", "ID-01", "REP-05"];
const PAY_CODES = ["PAY-01", "PAY-02", "PAY-03", "PAY-04", "PAY-05", "PAY-06", "PAY-07", "EMAIL-06", "EMAIL-07"];
const SUPPLIER_IDENTITY_CODES = ["EMAIL-02", "EMAIL-04", "EMAIL-10"];
const SUPPLIER_PAYMENT_ACTIONS = ["supplier_dont_use_details", "supplier_contact_known", "supplier_verify_verbally"];
// Document forgery artefacts. DOC-02 only counts when the change came after a
// digital signature (a plain incremental save is too common to act on).
const DOC_FORGERY_CODES = ["DOC-04", "DOC-05", "DOC-08"];

// Ordered rules: [condition, action ids]. Every matching rule contributes.
const RULES = [
  // Workplace email first: the most specific instruction leads.
  [(c) => c.hasAny(["EMAIL-06", "EMAIL-07"]) || (c.hasAny(SUPPLIER_IDENTITY_CODES) && c.hasAny(PAY_CODES)), SUPPLIER_PAYMENT_ACTIONS],
  [(c) => c.has("EMAIL-09") || (c.has("EMAIL-08") && c.hasAny(PAY_CODES)), ["exec_hold_transfer", "exec_normal_approval", "exec_no_email_contacts"]],
  [(c) => c.isEmail && c.hasAny([...URL_CODES, "SEC-01"]), ["phish_no_password", "phish_open_independently"]],
  [(c) => c.has("EMAIL-05"), ["dont_open_attachment"]],
  [(c) => c.has("EMAIL-01"), ["dont_reply_to_address"]],
  [(c) => c.hasAny(DOC_FORGERY_CODES) || c.hasVariant("DOC-02", "after_signature"), ["doc_verify_with_issuer"]],
  [(c) => c.has("DOC-07"), ["doc_dont_enable_content"]],
  [(c) => !c.isEmail && c.hasAny(URL_CODES), ["dont_open_link", "open_official_directly"]],
  [(c) => c.has("SEC-01"), ["dont_share_code", "contact_verified_channel"]],
  [(c) => c.has("SEC-02"), ["dont_install", "contact_verified_channel"]],
  [(c) => c.has("PAY-03"), ["dont_move_funds", "contact_verified_channel"]],
  [(c) => c.has("PAY-07") && !c.hasAny(["EMAIL-06", "EMAIL-07"]), ["verify_bank_change"]],
  [(c) => c.hasAny(["PAY-05", "PAY-06"]), ["stop_and_verify_recipient"]],
  [(c) => c.has("SOC-03") && c.hasAny(PAY_CODES), ["call_person_known_number", "talk_to_someone"]],
  [(c) => c.has("PAY-04") || (c.has("SOC-05") && c.hasAny(PAY_CODES)), ["dont_pay_fee"]],
  [(c) => c.has("SOC-07"), ["hostile_instructions"]],
  [(c) => c.level !== "low" && c.hasAny(PAY_CODES), ["dont_send_money"]],
  [(c) => c.level === "high" || c.level === "critical", ["block_and_report"]],
];

const REDUCE_CONCERN = [
  [(c) => c.hasAny(URL_CODES), "The same request appears when you open the organisation's official website or app yourself."],
  [(c) => c.hasAny(["EMAIL-06", "EMAIL-07"]), "The supplier confirms the new account by phone, on a number already held in your supplier records."],
  [(c) => c.hasAny(["PAY-05", "PAY-06", "PAY-07"]), "You confirm the recipient's details through a channel you already trusted before this message arrived."],
  [(c) => c.has("EMAIL-09"), "The person confirms the request in person or through your organisation's normal approval process."],
  [(c) => c.has("SOC-03") || c.has("SOC-06"), "You reach the person on a number you already had for them, and they confirm the request."],
  [(c) => c.has("SOC-05") || c.has("PAY-04"), "You can confirm the prize, refund or parcel directly with the organisation, without paying anything first."],
];

// Legacy `suggestedAction` keys the frontend already maps to UI steps
// (frontend/lib/result.ts ACTION_KEYS).
function legacySuggestedAction(level) {
  if (level === "high" || level === "critical") return "block_sender, report_to_bank";
  if (level === "elevated") return "verify_official_channel";
  return "none";
}

/**
 * @param {{ level: string, codes: Iterable<string>, variants?: Iterable<string>, scamType?: string|null, stage?: string|null, source?: string }} input
 *   variants: "CODE:variant" keys of signals that carry metadata.variant (optional)
 * @returns {{ policyVersion: string, actions: {id: string, text: string}[], reduceConcern: string[], suggestedAction: string }}
 */
export function planInterventions({ level, codes, variants = [], scamType = null, stage = null, source = null }) {
  const codeSet = new Set(codes);
  const variantSet = new Set(variants);
  const ctx = {
    level,
    isEmail: source === "email",
    scamType,
    stage,
    has: (code) => codeSet.has(code),
    hasAny: (list) => list.some((code) => codeSet.has(code)),
    hasVariant: (code, variant) => variantSet.has(`${code}:${variant}`),
  };

  const ids = [];
  if (level !== "low") {
    for (const [when, actionIds] of RULES) if (when(ctx)) ids.push(...actionIds);
    if (ids.length === 0) ids.push("verify_first");
  } else {
    ids.push("no_warning_signs");
  }
  const unique = [...new Set(ids)];

  return {
    policyVersion: POLICY_VERSION,
    actions: unique.map((id) => ({ id, text: ACTIONS[id] })),
    reduceConcern: level === "low" ? [] : REDUCE_CONCERN.filter(([when]) => when(ctx)).map(([, text]) => text),
    suggestedAction: legacySuggestedAction(level),
  };
}

// Deterministic explanation templates. The Kreol wording is a first draft
// and needs sign-off from the Kreol-language owner before the demo.
const LEVEL_WORDS = {
  en: { low: "low", elevated: "elevated", high: "high", critical: "critical" },
  fr: { low: "faible", elevated: "modéré", high: "élevé", critical: "critique" },
  kreol: { low: "feb", elevated: "modere", high: "ot", critical: "kritik" },
};

/**
 * Plain-language summary built from the decided result only - never from
 * model free text.
 * @param {{ level: string, score: number, findingCount: number, inferredCount: number, semanticStatus: string }} d
 * @param {"en"|"fr"|"kreol"} lang
 */
export function buildExplanation({ level, score, findingCount, inferredCount, semanticStatus }, lang = "en") {
  const words = LEVEL_WORDS[lang] ?? LEVEL_WORDS.en;
  const lvl = words[level];
  if (lang === "fr") {
    const base = findingCount === 0
      ? `Aucun signal d'alerte trouvé. Risque ${lvl} (${score}/100), calculé par les règles de FraudLens.`
      : `Risque ${lvl} (${score}/100), calculé par les règles de FraudLens à partir de ${findingCount} signal(s) d'alerte.`;
    const ai = inferredCount > 0 ? ` ${inferredCount} signal(s) sont déduits par l'IA et marqués comme tels.` : "";
    const down = semanticStatus !== "ok" ? " L'analyse du langage par l'IA n'était pas disponible ; seules les vérifications automatiques ont été utilisées." : "";
    return base + ai + down;
  }
  if (lang === "kreol") {
    const base = findingCount === 0
      ? `Pena okenn siny danze. Risk ${lvl} (${score}/100), kalkile par bann reg FraudLens.`
      : `Risk ${lvl} (${score}/100), kalkile par bann reg FraudLens lor ${findingCount} siny danze.`;
    const ai = inferredCount > 0 ? ` ${inferredCount} siny sorti dan lanaliz IA e zot marke kouma sa.` : "";
    const down = semanticStatus !== "ok" ? " Lanaliz langaz par IA pa ti disponib; zis bann verifikasion otomatik inn servi." : "";
    return base + ai + down;
  }
  const base = findingCount === 0
    ? `No warning signs found. Risk ${lvl} (${score}/100), calculated by FraudLens rules.`
    : `Risk ${lvl} (${score}/100), calculated by FraudLens rules from ${findingCount} warning sign${findingCount === 1 ? "" : "s"}.`;
  const ai = inferredCount > 0 ? ` ${inferredCount} ${inferredCount === 1 ? "sign is" : "signs are"} AI-inferred and labelled as such.` : "";
  const down = semanticStatus !== "ok" ? " AI language analysis was unavailable, so only automated checks were used." : "";
  return base + ai + down;
}
