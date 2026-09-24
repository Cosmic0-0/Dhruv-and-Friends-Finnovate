// Opt-out from contributing scam samples (Settings > "Share anonymous scam
// samples"). By default every analysis may feed FraudLens's shared evidence:
// a community evidence event (message fingerprint hashes, normalised sender,
// claimed brand, lookalike hosts - never the text), a ScamDNA observation,
// a batch's summary counts, and the original bytes of an uploaded document.
// `shareSamples: false` on a request skips all of those writes for that
// request; the analysis itself is unchanged and read-only lookups (community
// evidence, known ScamDNA campaigns) still inform the result.
//
// The one write that still happens is risk_audit_log, and only when
// existing community evidence changed this verdict: it records which rule
// and which OTHER people's evidence rows moved the score, so any adjusted
// verdict stays explainable. It holds nothing from this message.

/**
 * @param {unknown} value request body `shareSamples`
 * @returns {{ record: boolean, error?: string }}
 */
export function parseShareSamples(value) {
  if (value === undefined || value === null) return { record: true };
  if (typeof value !== "boolean") return { record: true, error: "shareSamples must be a boolean" };
  return { record: value };
}
