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

  "ID-01": { category: "identity", severity: "high", legacyType: "IDENTITY_MISMATCH", label: "Claims to be an institution but links to a different domain" },
  "ID-02": { category: "identity", severity: "high", legacyType: "IDENTITY_MISMATCH", label: "Claims to be an institution but payment goes to someone else" },
  "ID-03": { category: "identity", severity: "medium", legacyType: "sender_mismatch", label: "Sender identity does not fit the claimed institution" },
  "ID-04": { category: "identity", severity: "medium", legacyType: "spoofed_identity", label: "Language impersonates an authority" },

  "SOC-01": { category: "social", severity: "low", legacyType: "urgency_language", label: "Artificial urgency" },
  "SOC-02": { category: "social", severity: "medium", legacyType: "threat_language", label: "Threat of suspension, penalty or legal action" },
  "SOC-03": { category: "social", severity: "medium", legacyType: "secrecy", label: "Asks you to keep it secret" },
  "SOC-04": { category: "social", severity: "low", legacyType: "off_platform_contact", label: "Pushes you to another channel or number" },
  "SOC-05": { category: "social", severity: "low", legacyType: "prize_offer", label: "Unexpected prize, refund or money" },
  "SOC-06": { category: "social", severity: "medium", legacyType: "manipulation", label: "Relationship or investment manipulation" },
  "SOC-07": { category: "social", severity: "high", legacyType: "prompt_injection", label: "Contains instructions aimed at automated checkers" },

  "PAY-01": { category: "payment", severity: "low", legacyType: "payment_request", label: "Asks you to send money" },
  "PAY-02": { category: "payment", severity: "high", legacyType: "payment_request", label: "Unusual payment method (gift card, crypto, courier)" },
  "PAY-03": { category: "payment", severity: "high", legacyType: "payment_request", label: "Asks you to move money to a 'safe account'" },
  "PAY-04": { category: "payment", severity: "medium", legacyType: "payment_request", label: "Fee demanded before you can receive something" },
  "PAY-05": { category: "payment", severity: "high", legacyType: "payment_request", label: "Recipient does not match who is asking" },
  "PAY-06": { category: "payment", severity: "high", legacyType: "payment_request", label: "Someone is directing you while you pay" },
  "PAY-07": { category: "payment", severity: "medium", legacyType: "payment_request", label: "Payment details changed" },

  "SEC-01": { category: "credential", severity: "high", legacyType: "credential_request", label: "Asks you to share an OTP, PIN, password or CVV" },
  "SEC-02": { category: "credential", severity: "high", legacyType: "credential_request", label: "Asks you to install remote-access software" },

  "REP-01": { category: "reputation", severity: "medium", legacyType: "community_cluster", label: "Matches a pattern several people reported" },
  "REP-02": { category: "reputation", severity: "high", legacyType: "community_wave", label: "Matches a pattern being reported right now" },
  "REP-03": { category: "reputation", severity: "medium", legacyType: "sender_reported", label: "Sender reported by other users" },
  "REP-04": { category: "reputation", severity: "high", legacyType: "known_scam_template", label: "Matches a confirmed scam template" },
  "REP-05": { category: "reputation", severity: "high", legacyType: "known_malicious_url", label: "Link is on a known-malicious list" },
});

export const SIGNAL_CODES = Object.freeze(Object.keys(SIGNAL_DEFS));

// Codes the semantic model is allowed to emit - language interpretation only.
// No URL, identity-vs-domain, reputation or payment-context codes: those are
// facts code verifies.
export const SEMANTIC_CODES = Object.freeze([
  "ID-04", "SOC-01", "SOC-02", "SOC-03", "SOC-04", "SOC-05", "SOC-06", "SOC-07",
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
