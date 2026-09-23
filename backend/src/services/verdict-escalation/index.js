// Non-LLM, deterministic — must stay unit-testable independent of the LLM call path
// (mirrors services/domain-matching, services/identity-consistency, services/template-artifacts).
//
// The LLM's own `verdict`/`riskScore` are decided before any of the
// additive, deterministic checks run (domain-matching, identity-consistency,
// template-artifacts — see backend/src/routes/index.js), so a high-severity
// deterministic finding never actually reaches the LLM's judgment call.
// Without this reconciliation step, a message can carry a proven,
// high-severity forgery signal (e.g. TEMPLATE_ARTIFACT, IDENTITY_MISMATCH)
// while the top-line `verdict` still reads "safe", because nothing ever
// revisits it against evidence gathered after the LLM call returned (see
// the HR/parking-space phishing example this was built from: verdict stayed
// "safe" even with a high-severity TEMPLATE_ARTIFACT signal present).
//
// Deliberately one-directional: this only raises a "safe" floor to
// "suspicious" when hard, deterministic evidence contradicts it. It never
// downgrades a verdict the LLM already flagged as risky, and never claims
// "scam" on the LLM's behalf - "suspicious" is the correct, conservative
// escalation for "the deterministic checks found something the LLM's own
// call missed," not a certainty claim.
const ESCALATED_RISK_SCORE_FLOOR = 50;

function isDeterministicHighSeveritySignal(signal) {
  return signal.severity === "high" && signal.source !== "llm_analysis" && signal.source !== "message_text";
}

export function reconcileVerdict(result) {
  if (result.verdict !== "safe") return result;
  if (!(result.signals || []).some(isDeterministicHighSeveritySignal)) return result;

  return {
    ...result,
    verdict: "suspicious",
    riskScore: Math.max(result.riskScore ?? 0, ESCALATED_RISK_SCORE_FLOOR),
  };
}
