// Non-LLM, deterministic verification-workflow metadata: which of the
// ORGANISATION'S OWN procedures (organisation profile `verificationWorkflows`)
// an email triggers, with owner, steps and required approvals - so the
// result says "run the supplier bank-change callback, 2 approvers" rather
// than generic advice. Triggers are reason codes, optionally narrowed to a
// variant ("EMAIL-09:executive", "PAY-07:payroll"); `requiresAny` adds a
// second condition (e.g. an executive request only matters with a payment).
// Only runs when the risk level is above "low".

import { DEMO_ORGANISATION } from "../workplace-registry/index.js";

export const VERIFICATION_POLICY_VERSION = "verification-1.0";

function matches(trigger, present) {
  const [code, variant] = trigger.split(":");
  return present.some((s) => s.code === code && (!variant || s.variant === variant));
}

/**
 * @param {{ level: string, signals: {code: string, metadata?: object}[], profile?: object }} input
 *   `signals` should include merged (scored:false) members so absorbed facts still trigger.
 * @returns {{ policyVersion: string, required: boolean, workflows: object[], reportTo: string|null }}
 */
export function planVerification({ level, signals, profile = DEMO_ORGANISATION }) {
  const present = signals.map((s) => ({ code: s.code, variant: s.metadata?.variant ?? null }));
  const workflows =
    level === "low"
      ? []
      : profile.verificationWorkflows
          .map((wf) => {
            const triggeredBy = [...new Set(wf.triggers.filter((t) => matches(t, present)))];
            if (triggeredBy.length === 0) return null;
            if (wf.requiresAny && !wf.requiresAny.some((t) => matches(t, present))) return null;
            return {
              id: wf.id,
              title: wf.title,
              owner: wf.owner ?? null,
              steps: wf.steps ?? [],
              requiredApprovals: wf.requiredApprovals ?? 0,
              triggeredBy,
            };
          })
          .filter(Boolean);
  return {
    policyVersion: VERIFICATION_POLICY_VERSION,
    required: workflows.length > 0,
    workflows,
    reportTo: level === "high" || level === "critical" || workflows.length > 0 ? profile.reportPhishingTo : null,
  };
}
