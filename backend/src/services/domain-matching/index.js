// Non-LLM, deterministic — must stay unit-testable independent of the LLM call path.

// Single source of truth for known-legit Mauritius bank/telecom/government
// domains, keyed by the brand token used to spot them mentioned in message
// text. Exported as a map (rather than two parallel arrays) so other
// deterministic checks — e.g. services/identity-consistency — can look up
// "what domain should this claimed identity's link point to" without
// duplicating this knowledge.
export const BRAND_DOMAIN_MAP = {
  mcb: "mcb.mu",
  sbm: "sbmgroup.mu",
  absa: "absa.mu",
  bankone: "bankone.mu",
  myt: "myt.mu",
  emtel: "emtel.com",
  mra: "mra.gov.mu",
};

export const LEGIT_DOMAINS = Object.values(BRAND_DOMAIN_MAP);

// Brand tokens checked as hostname substrings, independent of the
// Levenshtein distance check below — catches prefix/suffix phishing
// patterns like mcb-secure.top that a distance-2 threshold misses
// (see data/test-payloads/FINDINGS.md #3).
export const BRAND_TOKENS = Object.keys(BRAND_DOMAIN_MAP);

// Requires a final all-alpha "TLD-like" label of 2-10 chars so scheme-less
// matches don't fire on ordinary prose (e.g. "Rs.5000", "e.g.") while still
// catching real scheme-less links like "mcb.nu/verify" (see FINDINGS.md #2).
const URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,10}(?:\/[^\s]*)?/gi;

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Extracts hostnames from any URL-shaped substrings in the message.
// Exported so other deterministic (non-LLM) checks — e.g.
// services/identity-consistency — can reuse this exact extraction instead
// of reimplementing URL/domain parsing.
export function extractHostnames(message) {
  const urls = message.match(URL_PATTERN) || [];
  const hostnames = [];
  for (const url of urls) {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      hostnames.push(new URL(withScheme).hostname.replace(/^www\./, "").toLowerCase());
    } catch {
      continue;
    }
  }
  return hostnames;
}

export function checkUrls(message) {
  const hostnames = extractHostnames(message);
  const signals = [];
  for (const host of hostnames) {
    if (LEGIT_DOMAINS.includes(host)) continue;

    const closest = LEGIT_DOMAINS.find((d) => levenshtein(host, d) <= 2);
    const brandToken = BRAND_TOKENS.find((token) => host.includes(token));

    // Either check firing should produce exactly one signal per URL.
    if (closest) {
      signals.push({
        type: "lookalike_url",
        description: `${host} closely resembles legitimate domain ${closest}`,
        severity: "high",
        source: "url_parser",
      });
    } else if (brandToken) {
      signals.push({
        type: "lookalike_url",
        description: `${host} contains brand token "${brandToken}" but is not a recognized domain for it`,
        severity: "high",
        source: "url_parser",
      });
    }
  }
  return signals;
}
