// Non-LLM, deterministic — must stay unit-testable independent of the LLM call path.

export const LEGIT_DOMAINS = ["mcb.mu", "sbmgroup.mu", "absa.mu", "bankone.mu", "myt.mu", "emtel.com"];

// Brand tokens checked as hostname substrings, independent of the
// Levenshtein distance check below — catches prefix/suffix phishing
// patterns like mcb-secure.top that a distance-2 threshold misses
// (see data/test-payloads/FINDINGS.md #3).
const BRAND_TOKENS = ["mcb", "sbm", "absa", "bankone", "myt", "emtel"];

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

export function checkUrls(message) {
  const urls = message.match(URL_PATTERN) || [];
  const signals = [];
  for (const url of urls) {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let host;
    try {
      host = new URL(withScheme).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }
    if (LEGIT_DOMAINS.includes(host)) continue;

    const closest = LEGIT_DOMAINS.find((d) => levenshtein(host, d) <= 2);
    const brandToken = BRAND_TOKENS.find((token) => host.includes(token));

    // Either check firing should produce exactly one signal per URL.
    if (closest) {
      signals.push({
        type: "lookalike_url",
        description: `${host} closely resembles legitimate domain ${closest}`,
        severity: "high",
      });
    } else if (brandToken) {
      signals.push({
        type: "lookalike_url",
        description: `${host} contains brand token "${brandToken}" but is not a recognized domain for it`,
        severity: "high",
      });
    }
  }
  return signals;
}
