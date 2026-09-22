const MAX_BATCH_SIZE = 100;

/**
 * Runs analysis over a batch of messages and aggregates a summary.
 * `analyze` is injected (rather than imported from ../analysis directly)
 * so this stays testable and decoupled while that service is still in progress.
 * @param {string[]} messages
 * @param {{ analyze: (message: string) => Promise<{ verdict: "safe"|"suspicious"|"scam", signals: unknown[], suggestedAction: string, explanation: string }> }} deps
 * @returns {Promise<{ results: Array<{ message: string, verdict: string, signals: unknown[], suggestedAction: string, explanation: string }>, summary: { total: number, scamCount: number, suspiciousCount: number, safeCount: number } }>}
 */
export async function summarizeBatch(messages, { analyze }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("summarizeBatch: messages must be a non-empty array");
  }
  if (messages.length > MAX_BATCH_SIZE) {
    throw new Error(`summarizeBatch: batch of ${messages.length} exceeds max size of ${MAX_BATCH_SIZE}`);
  }
  if (typeof analyze !== "function") {
    throw new Error("summarizeBatch: analyze must be a function");
  }

  const results = await Promise.all(
    messages.map(async (message) => {
      if (typeof message !== "string" || message.trim().length === 0) {
        throw new Error("summarizeBatch: each message must be a non-empty string");
      }
      const { verdict, signals, suggestedAction, explanation } = await analyze(message);
      return { message, verdict, signals, suggestedAction, explanation };
    })
  );

  return {
    results,
    summary: buildSummary(results),
  };
}

/**
 * @param {Array<{ verdict: string }>} results
 */
function buildSummary(results) {
  return results.reduce(
    (summary, { verdict }) => ({
      ...summary,
      scamCount: summary.scamCount + (verdict === "scam" ? 1 : 0),
      suspiciousCount: summary.suspiciousCount + (verdict === "suspicious" ? 1 : 0),
      safeCount: summary.safeCount + (verdict === "safe" ? 1 : 0),
    }),
    { total: results.length, scamCount: 0, suspiciousCount: 0, safeCount: 0 }
  );
}
