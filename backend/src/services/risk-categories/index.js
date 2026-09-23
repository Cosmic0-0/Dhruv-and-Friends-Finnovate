// Non-LLM, deterministic — derives a structured risk-category breakdown
// from the evidence/signal items already present on an analysis result. It
// never talks to the LLM or a store itself; it's a pure function over the
// `signals` array assembled by the analysis + domain-matching +
// identity-consistency checks (see backend/src/routes/index.js).
//
// This is additive alongside the existing single `riskScore` field
// (backend/src/services/analysis/index.js) — see docs/API-CONTRACT.md for
// why riskScore is kept as-is.

export const RISK_CATEGORIES = ["identity_risk", "behavioral_risk", "payment_risk", "technical_risk", "verification_risk"];

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };

// Ordered keyword rules over the signal `type` string. First match wins, so
// more specific categories (identity, technical, payment, verification) are
// checked before the behavioral default. Signal types are free-form
// (LLM-supplied, or one of our own fixed non-LLM types like
// "lookalike_url"/"IDENTITY_MISMATCH"), so this matches on substrings rather
// than an exact enum.
const CATEGORY_RULES = [
  { category: "identity_risk", pattern: /identity|spoof|impersonat|sender.?mismatch|fake.?(identity|sender)|template.?artifact/i },
  { category: "technical_risk", pattern: /url|domain|link|lookalike|phishing.?(site|page)|website/i },
  { category: "payment_risk", pattern: /payment|money|transfer|beneficiary|account.?(number|detail)|bank.?detail|mobile.?money|otp|credential|\bpin\b|password/i },
  { category: "verification_risk", pattern: /verif|unofficial|official.?channel|unconfirmed|cannot.?confirm/i },
  { category: "behavioral_risk", pattern: /urgen|secrecy|secret|pressure|threat|deadline|rush|fear/i },
];

// Anything that matches none of the above is still an LLM scam-pattern
// judgment call rather than a hard technical/payment fact, so it defaults
// into behavioral_risk rather than being silently dropped from every
// category.
function classifyCategory(type) {
  const rule = CATEGORY_RULES.find(({ pattern }) => pattern.test(type));
  return rule ? rule.category : "behavioral_risk";
}

// Registry signals (services/signals/registry.js) carry a fixed `category`,
// so they map exactly instead of by regex over a type string.
const REGISTRY_CATEGORY_MAP = {
  identity: "identity_risk",
  technical: "technical_risk",
  payment: "payment_risk",
  credential: "payment_risk",
  social: "behavioral_risk",
  reputation: "verification_risk",
  email_identity: "identity_risk",
  email_auth: "technical_risk",
  email_attachment: "technical_risk",
  email_payment: "payment_risk",
};

function categoryOf(signal) {
  return REGISTRY_CATEGORY_MAP[signal.category] ?? classifyCategory(signal.type || "");
}

// A category with no matching evidence is LOW, not "unknown" — absence of
// evidence in that category is itself the (low-risk) signal.
export function computeRiskCategories(signals) {
  const categories = Object.fromEntries(RISK_CATEGORIES.map((c) => [c, "LOW"]));
  for (const signal of signals || []) {
    const category = categoryOf(signal);
    const rank = SEVERITY_RANK[signal.severity] || 0;
    const currentRank = SEVERITY_RANK[categories[category].toLowerCase()] || 0;
    if (rank > currentRank) {
      categories[category] = signal.severity.toUpperCase();
    }
  }
  return categories;
}
