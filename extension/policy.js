// Small UI policy decisions, kept pure so they're unit-tested
// (policy.test.js) rather than buried in background.js/popup.js.

// Deterministic evidence only: code-verified facts ("rule") and curated
// threat lists ("intel"). Word-list matches ("lexicon") and the AI's reading
// ("semantic_model") never raise the on-page banner - that was #21, where a
// SAFE page got a banner because the old check looked at the legacy
// `source` field, which also covers lexicon matches.
const BANNER_SOURCE_TYPES = new Set(["rule", "intel"]);
const BANNER_SEVERITIES = new Set(["high", "medium"]);

/**
 * The signal worth an on-page banner, or null. Never for a page the
 * analysis called safe, whatever its individual signals say.
 * @param {{ signals?: object[] }} analysis
 * @param {string} state UI state from stateFromAnalyze()
 */
export function strongDeterministicSignal(analysis, state) {
  if (state !== "high-risk" && state !== "suspicious") return null;
  const signals = (analysis?.signals ?? []).filter((s) => s.scored !== false);
  const rank = { high: 2, medium: 1 };
  return (
    signals
      .filter((s) => BANNER_SOURCE_TYPES.has(s.sourceType) && BANNER_SEVERITIES.has(s.severity))
      .sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0))[0] ?? null
  );
}

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i;

/**
 * "Report this site" is only for real website hostnames - never a browser
 * page ("newtab", "extensions"), a file:// path or an empty string (#26).
 */
export function isReportableHost(host) {
  return typeof host === "string" && HOSTNAME_RE.test(host) && host.toLowerCase() !== "localhost";
}

/**
 * The popup's "Claims to be" line (#30). Only an institution the backend
 * matched from the registry - never a free-text sender guess like a page
 * heading - and a report count only when there actually are reports.
 * @returns {string|null}
 */
export function claimedIdentityLine(analysis) {
  const identity = analysis?.scamProfile?.claimedIdentity ?? (analysis?.signals ?? []).find((s) => typeof s.claimedIdentity === "string")?.claimedIdentity;
  const reports = typeof analysis?.senderReports === "number" ? analysis.senderReports : 0;
  if (!identity) return reports > 0 && analysis?.sender ? `Sender reported ${reports} time${reports === 1 ? "" : "s"} by FraudLens users.` : null;
  return `Claims to be: ${identity}${reports > 0 ? ` (sender reported ${reports} time${reports === 1 ? "" : "s"})` : ""}`;
}
