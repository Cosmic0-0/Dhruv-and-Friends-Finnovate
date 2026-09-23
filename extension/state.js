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
  if (result.error) return describeFailure(result).state;
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
  // Rate limited / scanner busy: a pause, not an outage and not a verdict.
  limited: { text: "…", color: "#5b6472" },
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
  unreachable: "Can't reach FraudLens right now",
  limited: "Too many checks — paused for a few minutes",
  inconclusive: "Scan incomplete — could not read this page",
  safe: "No known risk signals",
  suspicious: "Suspicious — review before acting",
  "high-risk": "High risk — strong scam signals found",
};

// ---- Honest error wording (findings #23, #27 and the "every failure says
// 'could not read this page'" report) ----
//
// Errors cross chrome.runtime messaging as plain { error, errorKind }, so
// this works on that shape as well as on an ApiError.

/** @typedef {"unreachable"|"rate_limited"|"busy"|"rejected"|"server"|"page_unreadable"|"no_text"|"not_web_page"} ErrorKind */

const ERROR_TEXT = {
  rate_limited: "Too many checks in a short time. FraudLens will be able to check again in a few minutes.",
  busy: "The FraudLens scanner is busy right now. Try again in a moment.",
  unreachable: "Can't reach the FraudLens service right now. Browsing isn't blocked.",
  server: "FraudLens hit a problem on its side. Try again shortly.",
  page_unreadable: "Chrome doesn't let extensions read this page (browser pages, the Chrome Web Store, some PDFs).",
  no_text: "There's no readable text on this page to scan.",
  not_web_page: "FraudLens checks websites. This is a browser page, so there's nothing to check.",
};

const ERROR_STATE = { rate_limited: "limited", busy: "limited", unreachable: "unreachable", server: "unreachable" };

/**
 * @param {{ errorKind?: string, kind?: string, error?: string, message?: string } | null | undefined} failure
 * @returns {{ state: UiState, message: string }}
 */
export function describeFailure(failure) {
  const kind = failure?.errorKind ?? failure?.kind;
  const raw = failure?.error ?? failure?.message ?? "";
  const message = ERROR_TEXT[kind] ?? (raw ? `FraudLens couldn't finish this check: ${raw}` : "FraudLens couldn't finish this check.");
  return { state: ERROR_STATE[kind] ?? "inconclusive", message };
}

/** Plain, message-safe error shape for chrome.runtime.sendMessage responses. */
export function failureOf(err, fallbackKind = "server") {
  return { error: err?.message ?? String(err), errorKind: err?.kind ?? fallbackKind };
}
