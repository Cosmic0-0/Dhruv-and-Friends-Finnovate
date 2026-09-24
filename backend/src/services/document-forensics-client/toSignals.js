// Converts the Python document-forensics service's indicators (pixel/
// metadata facts about an image) into risk-engine signals, the same
// "extraSignals feed runPipeline()" pattern services/document-forensics
// (Node, PDF/DOCX) already uses for DOC-01..08. See that module's own
// comment in routes/index.js for why this lives outside the semantic model.

import { makeSignal } from "../signals/registry.js";

export const IMAGE_FORENSICS_DETECTOR_VERSION = "image-forensics-1.0";

const CHECK_TO_CODE = Object.freeze({
  trufor: "DOC-09",
  error_level_analysis: "DOC-10",
  layout_comparison: "DOC-11",
  metadata_pdf: "DOC-12",
  signature_consistency: "DOC-13",
});

function indicatorToSignal(indicator) {
  const code = CHECK_TO_CODE[indicator.check];
  if (!code) return null; // unknown check name - never reach the risk engine with a guessed code
  return makeSignal(code, {
    sourceType: "rule",
    description: indicator.description || indicator.title,
    severity: indicator.confidence || undefined, // "high"|"medium"|"low" from the service; makeSignal falls back to the code's default when absent
    evidence: indicator.evidence,
    // `variant` drives risk-engine/index.js's per-confidence weight lookup
    // (the same mechanism DOC-04/DOC-02/DOC-07 already use for their own
    // variants) - the service's own confidence is the most specific signal
    // available, so scoring keys off it directly rather than a flat weight.
    metadata: { check: indicator.check, title: indicator.title, variant: indicator.confidence },
  });
}

/**
 * @param {{ status: "ok"|"unavailable", report?: { indicators: object[], signature: { indicators: object[] } | null } }} forensicsResult
 * @returns {object[]} risk-engine signals, ready for runPipeline()'s extraSignals
 */
export function forensicsToSignals(forensicsResult) {
  if (forensicsResult?.status !== "ok") return [];
  const { indicators = [], signature } = forensicsResult.report;
  const all = [...indicators, ...(signature?.indicators ?? [])];
  return all.map(indicatorToSignal).filter(Boolean);
}
