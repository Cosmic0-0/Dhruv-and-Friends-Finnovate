// Non-LLM, deterministic — must stay unit-testable independent of the LLM call path.

export const LEGIT_DOMAINS = ["mcb.mu", "sbmgroup.mu", "absa.mu", "bankone.mu", "myt.mu", "emtel.com"];

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
  const urls = message.match(/https?:\/\/[^\s]+/g) || [];
  const signals = [];
  for (const url of urls) {
    let host;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (LEGIT_DOMAINS.includes(host)) continue;
    const closest = LEGIT_DOMAINS.find((d) => levenshtein(host, d) <= 2);
    if (closest) {
      signals.push({
        type: "lookalike_url",
        description: `${host} closely resembles legitimate domain ${closest}`,
        severity: "high",
      });
    }
  }
  return signals;
}
