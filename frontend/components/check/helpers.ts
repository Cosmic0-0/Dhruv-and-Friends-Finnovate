import type { Copy, UiLanguage } from "@/lib/i18n";
import { actionPlan, sortSignals } from "@/lib/result";
import type { AnalyzeResponse, ScamStage, Verdict } from "@/lib/types";
import type { CheckCopy } from "./content";
import { fill } from "./content";
import type { Tone } from "../dc";

/** Verdict → the dc red/amber/green tone used for the dot, the huge word and highlights. */
export function verdictTone(v: Verdict): Tone {
  return v === "scam" ? "red" : v === "suspicious" ? "amber" : "green";
}

/** The five playbook stages the design's summary sentence names as "the goal" (see content/en.json result.summary.goals). */
const GOAL_STAGES = ["OTP_REQUEST", "CREDENTIAL_REQUEST", "PAYMENT_REQUEST", "PAYMENT_PRESSURE", "ACCOUNT_TAKEOVER"] as const;
type GoalStage = (typeof GOAL_STAGES)[number];
function isGoalStage(s: ScamStage | undefined): s is GoalStage {
  return !!s && (GOAL_STAGES as readonly string[]).includes(s);
}

/**
 * "This message pretends to be MCB, to get your one-time code." — built only
 * from fields this exact response actually has: the claimed identity (an
 * IDENTITY_MISMATCH-style signal, else the extracted sender) and the goal
 * (the scam-journey stage, when it's one of the five listed above).
 */
export function summaryLine(
  response: Pick<AnalyzeResponse, "verdict" | "signals" | "scamProfile" | "journey" | "sender">,
  t: CheckCopy,
  show: (s: string) => string,
): string {
  const stage = response.scamProfile?.stage ?? response.journey?.currentStage;
  const goal = isGoalStage(stage) ? t.result.summary.goals[stage] : "";
  const idSignal = response.signals.find((s) => typeof s.claimedIdentity === "string" && s.claimedIdentity);
  const who = idSignal?.claimedIdentity ? show(idSignal.claimedIdentity) : response.sender ? show(response.sender) : undefined;
  if (response.verdict === "scam") return who ? fill(t.result.summary.scamWho, { who, goal }) : fill(t.result.summary.scam, { goal });
  if (response.verdict === "suspicious") return who ? fill(t.result.summary.suspiciousWho, { who, goal }) : fill(t.result.summary.suspicious, { goal });
  return t.result.summary.safe;
}

/** "High confidence · 4 signals" — confidence only when the deterministic risk engine actually returned one. */
export function confidenceAndSignalsLine(response: Pick<AnalyzeResponse, "risk" | "signals">, t: CheckCopy): string {
  const n = response.signals.length;
  const signalsText = n === 0 ? t.result.signals.zero : n === 1 ? t.result.signals.one : fill(t.result.signals.other, { n });
  const conf = response.risk?.confidence;
  return conf ? `${t.result.confidence[conf]} · ${signalsText}` : signalsText;
}

/** "block_sender, report_to_bank" (localized) or, failing that, the backend's own action texts. */
export function whatToDoSteps(response: Pick<AnalyzeResponse, "verdict" | "suggestedAction" | "actions">, oldCopy: Copy): { prose?: string; steps: string[] } {
  const { steps, prose } = actionPlan(response.verdict, response.suggestedAction);
  const localized = steps.map((k) => oldCopy.result.steps[k]);
  return { prose, steps: localized.length > 0 ? localized : (response.actions ?? []).map((a) => a.text) };
}

/** Signals sorted by severity, each tagged with a stable 1-based number matching the "Why" list and the message's superscripts. */
export function numberedSignals(signals: AnalyzeResponse["signals"]) {
  const indexed = signals.map((s, i) => ({ ...s, _idx: i }));
  return sortSignals(indexed).map((s, i) => ({ ...s, n: i + 1 }));
}

export { signalDescription, signalTitle } from "../result/sections";
export type { UiLanguage };
