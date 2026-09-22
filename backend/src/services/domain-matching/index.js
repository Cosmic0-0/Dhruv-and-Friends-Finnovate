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

// Brand tokens checked against whole hostname labels (split on "." and
// "-"), independent of the Levenshtein distance check below — catches
// prefix/suffix phishing patterns like mcb-secure.top that a distance-2
// threshold misses (see data/test-payloads/FINDINGS.md #3). Matching must
// be label-exact, not `host.includes(token)`: a raw substring check flags
// unrelated domains that merely contain a token's letters in sequence,
// e.g. mythology-store.com ("myt"), absalom-books.com ("absa"), and
// sbmarketing.co.uk ("sbm") (see FINDINGS.md #10).
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

// Extracts hostnames from any URL-shaped substrings in the message — legit
// or not, unfiltered. Exported so other deterministic (non-LLM) checks —
// e.g. services/identity-consistency, which needs to compare a claimed
// identity's expected domain against ANY linked host, not just lookalikes —
// can reuse this exact extraction instead of reimplementing URL parsing.
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

// Shared by checkUrls() and extractLookalikeHosts() so the host used for the
// (optional, separately-enriched) domainAgeDays lookup can never drift out
// of sync with which URLs actually got flagged.
function findLookalikes(message) {
  const found = [];
  for (const host of extractHostnames(message)) {
    if (LEGIT_DOMAINS.includes(host)) continue;

    const closest = LEGIT_DOMAINS.find((d) => levenshtein(host, d) <= 2);
    const labels = host.split(/[.-]/);
    const brandToken = BRAND_TOKENS.find((token) => labels.includes(token));

    // Either check firing should produce exactly one signal per URL.
    if (closest) {
      found.push({
        host,
        type: "lookalike_url",
        description: `${host} closely resembles legitimate domain ${closest}`,
        severity: "high",
        source: "url_parser",
        // officialDomain: the specific legit domain this host was matched
        // against, so the frontend can render a direct "claims X / actually
        // points to Y" comparison instead of re-parsing `description`.
        officialDomain: closest,
      });
    } else if (brandToken) {
      found.push({
        host,
        type: "lookalike_url",
        description: `${host} contains brand token "${brandToken}" but is not a recognized domain for it`,
        severity: "high",
        source: "url_parser",
        officialDomain: BRAND_DOMAIN_MAP[brandToken],
      });
    }
  }
  return found;
}

export function checkUrls(message) {
  // `domain` (the actual, potentially malicious host) is kept on the
  // signal — additive alongside `officialDomain` above — for the same
  // "claimed vs actual" comparison; only the internal `host` key itself is
  // renamed away, nothing is dropped.
  return findLookalikes(message).map(({ host, ...signal }) => ({ domain: host, ...signal }));
}

// Same hosts, same order, as the signals checkUrls() returns for this
// message - used to zip a best-effort domainAgeDays onto each signal
// without checkUrls() itself gaining an LLM-adjacent async dependency.
export function extractLookalikeHosts(message) {
  return findLookalikes(message).map((f) => f.host);
}
