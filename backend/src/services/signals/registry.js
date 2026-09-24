// Non-LLM, deterministic - the closed set of signal (reason) codes FraudLens
// can emit. Every detector (rule, lexicon, intel, community, semantic model)
// must produce signals through makeSignal(); an unknown code throws, so no
// free-form signal name can reach the risk engine or the response.

export const SOURCE_TYPES = Object.freeze(["rule", "lexicon", "intel", "semantic_model", "community"]);

// Reliability tier per source type: V verified fact, D deterministic
// heuristic, L lexicon, S semantic model. A detector may override to "V"
// only for exact matches against curated intelligence.
const TIER_BY_SOURCE = Object.freeze({ rule: "D", lexicon: "L", intel: "V", semantic_model: "S", community: "D" });

// `legacyType` keeps the pre-registry `type` strings the frontend already
// understands (lib/result.ts signalKind()); `code` is the authoritative field.
export const SIGNAL_DEFS = Object.freeze({
  "URL-01": { category: "technical", severity: "high", legacyType: "lookalike_url", label: "Lookalike of an official domain" },
  "URL-02": { category: "technical", severity: "high", legacyType: "lookalike_url", label: "Brand name inside an unofficial domain" },
  "URL-03": { category: "technical", severity: "high", legacyType: "lookalike_url", label: "Brand name in the subdomain or path of an unrelated site" },
  "URL-04": { category: "technical", severity: "high", legacyType: "lookalike_url", label: "Look-alike characters (punycode/homoglyph) in a link" },
  "URL-05": { category: "technical", severity: "low", legacyType: "shortened_url", label: "Shortened link hides the real destination" },
  "URL-06": { category: "technical", severity: "medium", legacyType: "suspicious_link", label: "Link points to a raw IP address" },
  "URL-07": { category: "technical", severity: "high", legacyType: "suspicious_link", label: "Link disguises its real host with an @ sign" },
  "URL-08": { category: "technical", severity: "medium", legacyType: "suspicious_link", label: "Asks you to verify, log in or pay through an unofficial link" },
  // Emitted only by /api/check-url (services/url-reputation) for the page
  // being visited. Deliberately has no risk-engine weight: message analysis
  // never emits it, so no published ruleset changes.
  "URL-09": { category: "technical", severity: "medium", legacyType: "new_domain", label: "Website domain was registered very recently" },
  // Scan This Page only (services/page-forms): the extension reports each
  // password/card form's destination host; never emitted for pasted text.
  "URL-10": { category: "technical", severity: "high", legacyType: "suspicious_link", label: "Login or card form sends your details to another site" },
  // /api/check-url only (services/url-reputation), like URL-09: no risk-engine
  // weight, so no published ruleset changes.
  "URL-11": { category: "technical", severity: "medium", legacyType: "suspicious_link", label: "Site runs on a tunnel or dynamic-DNS host" },
  "CERT-01": { category: "technical", severity: "high", legacyType: "suspicious_link", label: "Website's security certificate is invalid" },
  "CERT-02": { category: "technical", severity: "medium", legacyType: "new_domain", label: "Look-alike site with a brand-new certificate" },

  "ID-01": { category: "identity", severity: "high", legacyType: "IDENTITY_MISMATCH", label: "Claims to be an institution but links to a different domain" },
  "ID-02": { category: "identity", severity: "high", legacyType: "IDENTITY_MISMATCH", label: "Claims to be an institution but payment goes to someone else" },
  "ID-03": { category: "identity", severity: "medium", legacyType: "sender_mismatch", label: "Sender identity does not fit the claimed institution" },
  "ID-04": { category: "identity", severity: "medium", legacyType: "spoofed_identity", label: "Language impersonates an authority" },
  "ID-05": { category: "identity", severity: "high", legacyType: "TEMPLATE_ARTIFACT", label: "Unrendered mail-merge/template placeholder syntax" },

  "SOC-01": { category: "social", severity: "low", legacyType: "urgency_language", label: "Artificial urgency" },
  "SOC-02": { category: "social", severity: "medium", legacyType: "threat_language", label: "Threat of suspension, penalty or legal action" },
  "SOC-03": { category: "social", severity: "medium", legacyType: "secrecy", label: "Asks you to keep it secret" },
  "SOC-04": { category: "social", severity: "low", legacyType: "off_platform_contact", label: "Pushes you to another channel or number" },
  "SOC-05": { category: "social", severity: "low", legacyType: "prize_offer", label: "Unexpected prize, refund or money" },
  "SOC-06": { category: "social", severity: "medium", legacyType: "manipulation", label: "Relationship or investment manipulation" },
  "SOC-07": { category: "social", severity: "high", legacyType: "prompt_injection", label: "Contains instructions aimed at automated checkers" },
  "SOC-08": { category: "social", severity: "medium", legacyType: "control_bypass", label: "Asks you to bypass normal approval or verification" },
  // Deterministic, brand-agnostic: the phrasing pirated-software distribution
  // bait almost universally uses ("no survey", "direct download link",
  // "crack"/"keygen"/"serial key"), never which real company is being
  // impersonated - that judgement stays with the semantic model's ID-04 read
  // (see services/analysis's broadened ID-04 guidance). Combines with ID-04
  // via risk-engine's IX-6 interaction.
  "SOC-09": { category: "social", severity: "low", legacyType: "piracy_bait", label: "Offers a free/cracked copy of normally paid or restricted software" },
  // The "wrong transfer, refund me" mobile-money scam: the message claims
  // the sender already paid the recipient by mistake and pressures them to
  // send real money back, usually to a different number. No URL, no claimed
  // institution and only generic urgency wording to anchor on otherwise, so
  // this had no deterministic signal at all before - a live consistency
  // check found the verdict then rode entirely on the semantic model, which
  // did not reliably catch it. Floored to "high" in risk-engine (rs-1.6):
  // there is no legitimate equivalent of a stranger demanding an urgent
  // repayment for a transfer the recipient never actually received.
  "SOC-10": { category: "social", severity: "high", legacyType: "mistaken_payment_reversal", label: "Claims money was sent by mistake and asks for it back" },

  "PAY-01": { category: "payment", severity: "low", legacyType: "payment_request", label: "Asks you to send money" },
  "PAY-02": { category: "payment", severity: "high", legacyType: "payment_request", label: "Unusual payment method (gift card, crypto, courier)" },
  "PAY-03": { category: "payment", severity: "high", legacyType: "payment_request", label: "Asks you to move money to a 'safe account'" },
  "PAY-04": { category: "payment", severity: "medium", legacyType: "payment_request", label: "Fee demanded before you can receive something" },
  "PAY-05": { category: "payment", severity: "high", legacyType: "payment_request", label: "Recipient does not match who is asking" },
  "PAY-06": { category: "payment", severity: "high", legacyType: "payment_request", label: "Someone is directing you while you pay" },
  "PAY-07": { category: "payment", severity: "medium", legacyType: "payment_request", label: "Payment details changed" },

  "SEC-01": { category: "credential", severity: "high", legacyType: "credential_request", label: "Asks you to share an OTP, PIN, password or CVV" },
  "SEC-02": { category: "credential", severity: "high", legacyType: "credential_request", label: "Asks you to install remote-access software" },
  "SEC-03": { category: "credential", severity: "high", legacyType: "credential_request", label: "Asks you to log in and enter your password via a link" },

  "REP-01": { category: "reputation", severity: "medium", legacyType: "community_cluster", label: "Matches a pattern several people reported" },
  "REP-02": { category: "reputation", severity: "high", legacyType: "community_wave", label: "Matches a pattern being reported right now" },
  "REP-03": { category: "reputation", severity: "medium", legacyType: "sender_reported", label: "Sender reported by other users" },
  "REP-04": { category: "reputation", severity: "high", legacyType: "known_scam_template", label: "Matches a confirmed scam template" },
  "REP-05": { category: "reputation", severity: "high", legacyType: "known_malicious_url", label: "Link is on a known-malicious list" },

  // Workplace email (services/email-signals). Produced ONLY by deterministic
  // code from validated emailContext metadata plus the demo supplier registry
  // / organisation directory - never by the semantic model. Each one is only
  // emitted when the evidence it needs was actually supplied.
  "EMAIL-01": { category: "email_identity", severity: "low", legacyType: "sender_mismatch", label: "Replies would go to a different domain than the sender's" },
  "EMAIL-02": { category: "email_identity", severity: "medium", legacyType: "IDENTITY_MISMATCH", label: "Sender domain differs from the known supplier's domain" },
  "EMAIL-03": { category: "email_auth", severity: "low", legacyType: "email_authentication", label: "Email authentication anomaly" },
  "EMAIL-04": { category: "email_identity", severity: "medium", legacyType: "sender_mismatch", label: "Sender changed partway through the conversation" },
  "EMAIL-05": { category: "email_attachment", severity: "low", legacyType: "suspicious_attachment", label: "Risky attachment type" },
  "EMAIL-06": { category: "email_payment", severity: "high", legacyType: "payment_request", label: "Bank details differ from the supplier's details on record" },
  "EMAIL-07": { category: "email_payment", severity: "high", legacyType: "payment_request", label: "Beneficiary differs from the supplier's known payee" },
  "EMAIL-08": { category: "email_identity", severity: "medium", legacyType: "spoofed_identity", label: "Display name does not fit the sending address" },
  "EMAIL-09": { category: "email_identity", severity: "high", legacyType: "spoofed_identity", label: "External sender using a colleague's or executive's identity" },
  "EMAIL-10": { category: "email_identity", severity: "low", legacyType: "sender_mismatch", label: "Financial request from an address not on record for this supplier" },

  // Organisation identity & intelligence (services/org-identity, services/org-intel).
  // Deterministic only: organisation profile, analyst outcomes and the
  // organisation's own observation store - never the semantic model.
  "ORG-01": { category: "email_identity", severity: "high", legacyType: "spoofed_identity", label: "Sender domain imitates your organisation's domain" },
  "ORG-02": { category: "technical", severity: "high", legacyType: "lookalike_url", label: "Link or reply address imitates your organisation's domain" },
  "ORG-03": { category: "email_identity", severity: "medium", legacyType: "spoofed_identity", label: "Outsider posing as your finance, payroll or IT team" },
  "ORG-04": { category: "email_identity", severity: "low", legacyType: "sender_mismatch", label: "First message from this sender" },
  "ORG-05": { category: "reputation", severity: "high", legacyType: "known_scam_template", label: "Previously confirmed as fraud by your organisation" },
  "ORG-06": { category: "reputation", severity: "medium", legacyType: "community_cluster", label: "Part of a campaign targeting your organisation" },

  // Document forensics (services/document-forensics). Deterministic facts
  // about an uploaded PDF/DOCX file's structure - never the semantic model,
  // which only ever sees the document's extracted text. Each one is a
  // warning sign, not proof: legitimate tools can leave some of them too.
  "DOC-01": { category: "document_integrity", severity: "low", legacyType: "document_editing_tool", label: "Document was produced or saved with a consumer editing tool" },
  "DOC-02": { category: "document_integrity", severity: "medium", legacyType: "document_edited", label: "Document was changed after it was created" },
  "DOC-03": { category: "document_integrity", severity: "low", legacyType: "document_metadata_inconsistent", label: "Document metadata is inconsistent" },
  "DOC-04": { category: "document_integrity", severity: "medium", legacyType: "document_pasted_image", label: "An image was pasted on top of a scanned page" },
  "DOC-05": { category: "document_integrity", severity: "high", legacyType: "document_inserted_text", label: "Text was typed on top of a scanned page" },
  "DOC-06": { category: "document_integrity", severity: "medium", legacyType: "document_hidden_text", label: "Document contains hidden text" },
  "DOC-07": { category: "document_integrity", severity: "high", legacyType: "document_active_content", label: "Document contains active content" },
  "DOC-08": { category: "document_integrity", severity: "medium", legacyType: "document_font_outlier", label: "An amount, account number or date uses a different font from the rest of the page" },

  // Image forensics (services/document-forensics-client -> the local Python
  // document-forensics/ service: TruFor, Error Level Analysis, Donut layout
  // comparison, EXIF/metadata, signature consistency). Applies to screenshots
  // and photographed documents - pixel/metadata facts about the image itself,
  // never the semantic model, which only ever sees OCR'd text. Severity is
  // taken from the service's own per-finding confidence (high/medium/low),
  // not fixed per code, since that confidence is already the most specific
  // signal the model produces.
  "DOC-09": { category: "document_integrity", severity: "high", legacyType: "image_forgery_localization", label: "Forgery-localization model found a tampered region" },
  "DOC-10": { category: "document_integrity", severity: "medium", legacyType: "image_error_level_anomaly", label: "Error Level Analysis found an inconsistent region" },
  "DOC-11": { category: "document_integrity", severity: "medium", legacyType: "image_template_mismatch", label: "Image doesn't match the expected layout for its claimed document type" },
  "DOC-12": { category: "document_integrity", severity: "low", legacyType: "image_metadata_anomaly", label: "Image metadata is inconsistent" },
  "DOC-13": { category: "document_integrity", severity: "medium", legacyType: "image_signature_inconsistency", label: "A signature region shows internal inconsistency" },
});

export const SIGNAL_CODES = Object.freeze(Object.keys(SIGNAL_DEFS));

// Codes the semantic model is allowed to emit - language interpretation only.
// No URL, identity-vs-domain, reputation or payment-context codes: those are
// facts code verifies.
export const SEMANTIC_CODES = Object.freeze([
  "ID-04", "SOC-01", "SOC-02", "SOC-03", "SOC-04", "SOC-05", "SOC-06", "SOC-07", "SOC-08", "SOC-10",
  "PAY-01", "PAY-02", "PAY-03", "PAY-04", "PAY-07", "SEC-01", "SEC-02",
]);

// The frontend groups signals by the legacy `source` field (deterministic:
// url_parser/identity_check; AI: llm_analysis/message_text). Mapping keeps
// every non-AI signal in the deterministic bucket; `sourceType` is the
// authoritative provenance going forward.
function legacySource(code, sourceType) {
  if (sourceType === "semantic_model") return "llm_analysis";
  if (sourceType === "community") return "community_reports";
  return code.startsWith("URL-") ? "url_parser" : "identity_check";
}

/**
 * @param {string} code one of SIGNAL_CODES
 * @param {{ sourceType: string, evidence?: string|null, span?: [number, number]|null,
 *   description?: string, severity?: string, tier?: string, metadata?: object, extra?: object }} opts
 */
export function makeSignal(code, { sourceType, evidence = null, span = null, description, severity, tier, metadata = {}, extra = {} }) {
  const def = SIGNAL_DEFS[code];
  if (!def) throw new Error(`unknown signal code: ${code}`);
  if (!SOURCE_TYPES.includes(sourceType)) throw new Error(`unknown sourceType: ${sourceType}`);
  const signal = {
    ...extra,
    code,
    type: def.legacyType,
    category: def.category,
    sourceType,
    source: legacySource(code, sourceType),
    tier: tier ?? TIER_BY_SOURCE[sourceType],
    severity: severity ?? def.severity,
    description: description ?? def.label,
    metadata,
  };
  if (typeof evidence === "string" && evidence !== "") signal.evidence = evidence;
  if (Array.isArray(span)) signal.span = span;
  return signal;
}
