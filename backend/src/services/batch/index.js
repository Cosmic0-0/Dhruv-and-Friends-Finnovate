// Single source of truth for the max batch size (see
// data/test-payloads/FINDINGS.md #9 — this used to drift out of sync with a
// separate MAX_BATCH_MESSAGES constant in routes/index.js). Exported so the
// route imports this instead of duplicating it.
export const MAX_BATCH_SIZE = 50;

/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once, in
 * place of Promise.all's unbounded concurrency (see
 * data/test-payloads/FINDINGS.md #8 — firing a whole batch at once against
 * a single self-hosted LLM over Tailscale risks mass timeouts). Results are
 * returned in the original input order regardless of completion order.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Runs analysis over a batch of messages and aggregates a summary.
 * `analyze` is injected (rather than imported from ../analysis directly)
 * so this stays testable and decoupled while that service is still in progress.
 * @param {string[]} messages
 * @param {{ analyze: (message: string) => Promise<{ verdict: "safe"|"suspicious"|"scam"|"unknown", signals: unknown[], suggestedAction: string, explanation: string, analysisFailed?: boolean }> }} deps
 * @param {number} [concurrency] max number of analyze() calls in flight at once (default 4)
 * @returns {Promise<{ results: Array<{ message: string, verdict: string, signals: unknown[], suggestedAction: string, explanation: string, analysisFailed: boolean }>, summary: { total: number, scamCount: number, suspiciousCount: number, safeCount: number, unanalyzedCount: number } }>}
 */
export async function summarizeBatch(messages, { analyze }, concurrency = 4) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("summarizeBatch: messages must be a non-empty array");
  }
  if (messages.length > MAX_BATCH_SIZE) {
    throw new Error(`summarizeBatch: batch of ${messages.length} exceeds max size of ${MAX_BATCH_SIZE}`);
  }
  if (typeof analyze !== "function") {
    throw new Error("summarizeBatch: analyze must be a function");
  }

  const results = await mapWithConcurrency(messages, concurrency, async (message) => {
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new Error("summarizeBatch: each message must be a non-empty string");
    }
    const { verdict, signals, suggestedAction, explanation, analysisFailed } = await analyze(message);
    return { message, verdict, signals, suggestedAction, explanation, analysisFailed: Boolean(analysisFailed) };
  });

  return {
    results,
    summary: buildSummary(results),
  };
}

/**
 * @param {Array<{ verdict: string, analysisFailed: boolean }>} results
 */
function buildSummary(results) {
  return results.reduce(
    (summary, { verdict, analysisFailed }) => ({
      ...summary,
      scamCount: summary.scamCount + (verdict === "scam" ? 1 : 0),
      suspiciousCount: summary.suspiciousCount + (verdict === "suspicious" ? 1 : 0),
      safeCount: summary.safeCount + (verdict === "safe" ? 1 : 0),
      unanalyzedCount: summary.unanalyzedCount + (analysisFailed ? 1 : 0),
    }),
    { total: results.length, scamCount: 0, suspiciousCount: 0, safeCount: 0, unanalyzedCount: 0 }
  );
}
