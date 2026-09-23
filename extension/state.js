// Shared classification helpers so background.js, popup.js, and result.js
// all agree on what counts as "safe" / "suspicious" / "high-risk". This is
// only about *labelling an already-received backend result* — it never
// re-derives a verdict from raw text; that stays entirely server-side.

/** @typedef {"neutral"|"safe"|"suspicious"|"high-risk"|"unreachable"|"inconclusive"} UiState */

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

/** Highest severity among a signals[] array, or null if empty. */
export function maxSeverity(signals) {
  if (!Array.isArray(signals) || signals.length === 0) return null;
  return signals.reduce(
    (max, s) => (SEVERITY_RANK[s.severity] > SEVERITY_RANK[max] ? s.severity : max),
    signals[0].severity,
  );
}

/** For a /api/check-url response: { flagged, signals }. */
export function stateFromCheckUrl(result) {
  if (!result) return "neutral";
  if (result.error) return "unreachable";
  if (!result.flagged) return "safe";
  const sev = maxSeverity(result.signals) ?? "medium";
  return sev === "high" ? "high-risk" : "suspicious";
}

/** For a /api/analyze response: { verdict, signals }. */
export function stateFromAnalyze(result) {
  if (!result) return "neutral";
  if (result.verdict === "scam") return "high-risk";
  if (result.verdict === "suspicious") return "suspicious";
  if (result.verdict === "safe") return "safe";
  return "neutral"; // "unknown" (batch-only) shouldn't reach here, but fail neutral not safe
}

/** Badge glyph + colour for each state. Text is never the only signal — callers must also render a text explanation. */
export const BADGE_STYLE = {
  neutral: { text: "", color: "#5b6472" },
  unreachable: { text: "×", color: "#5b6472" },
  // A failed/empty page-scan extraction (see content.js/background.js
  // scanActiveTab) MUST resolve to this, never to "safe" — a scan that never
  // actually ran is not the same fact as a scan that ran and found nothing.
  inconclusive: { text: "…", color: "#5b6472" },
  safe: { text: "✓", color: "#5980a6" }, // check mark, accent steel blue
  suspicious: { text: "?", color: "#96772f" }, // brass/amber
  "high-risk": { text: "!", color: "#a14a3a" }, // brick red
};

/** Human-readable label shown in the popup text, never relying on the badge glyph alone. */
export const STATE_LABEL = {
  neutral: "Not checked yet",
  unreachable: "Backend unreachable",
  inconclusive: "Scan incomplete — could not read this page",
  safe: "No known risk signals",
  suspicious: "Suspicious — review before acting",
  "high-risk": "High risk — strong scam signals found",
};
