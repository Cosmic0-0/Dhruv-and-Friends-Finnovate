import { RISK_LEVELS, type AnalyzeResponse, type AnalyzeScreenshotResponse } from "./types";

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const isStr = (value: unknown): value is string => typeof value === "string";
const isStrArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isStr);
const optional = (value: unknown, check: (v: unknown) => boolean): boolean => value === undefined || value === null || check(value);

function validSignal(value: unknown): boolean {
  return isObj(value) && isStr(value.code) && isStr(value.description) && isStr(value.severity) && isStr(value.sourceType) &&
    optional(value.evidence, isStr) && optional(value.corroboratedBy, isStrArray) && optional(value.metadata, isObj) &&
    optional(value.scored, (v) => typeof v === "boolean");
}

function validWorkflow(value: unknown): boolean {
  return isObj(value) && isStr(value.title) && isStrArray(value.steps) && optional(value.owner, isStr) &&
    typeof value.requiredApprovals === "number" && Number.isFinite(value.requiredApprovals);
}

function validAnalysis(value: unknown): boolean {
  if (!isObj(value) || !isStr(value.rulesetVersion) || !isObj(value.semantic) || !isStr(value.semantic.status)) return false;
  const email = value.email;
  const organisation = value.organisation;
  return optional(email, (v) => isObj(v) && optional(v.checks, isObj) && optional(v.availableEvidence, isStrArray)) &&
    optional(organisation, (v) => isObj(v) && optional(v.campaigns, (c) => Array.isArray(c) && c.every(isObj)) && optional(v.senderRelation, isStr));
}

/**
 * Structural check of everything the task pane reads from the API. This is
 * not a second copy of the backend schema: it only guarantees that rendering
 * cannot throw or display invented values when the response is malformed.
 */
export function validResponse(value: unknown): value is AnalyzeResponse {
  if (!isObj(value)) return false;
  const { risk, signals, trace, actions, analysis, verification } = value;
  if (!isObj(risk) || typeof risk.score !== "number" || !Number.isFinite(risk.score) || !isStr(risk.confidence)) return false;
  if (!(RISK_LEVELS as readonly string[]).includes(risk.level as string)) return false;
  if (!isStr(value.decision)) return false;
  if (!Array.isArray(signals) || !signals.every(validSignal)) return false;
  if (!Array.isArray(trace) || !trace.every((t) => isObj(t) && isStr(t.id) && isStr(t.reason))) return false;
  if (!Array.isArray(actions) || !actions.every((a) => isObj(a) && isStr(a.id))) return false;
  if (!validAnalysis(analysis)) return false;
  return optional(verification, (v) => isObj(v) && optional(v.workflows, (w) => Array.isArray(w) && w.every(validWorkflow)));
}

function validImageForensics(value: unknown): boolean {
  return isObj(value) && isStr(value.status) && optional(value.checksRun, isStrArray) &&
    optional(value.checksSkipped, (v) => Array.isArray(v) && v.every((s) => isObj(s) && isStr(s.check) && isStr(s.reason)));
}

/** `/api/analyze/screenshot`'s response: everything `validResponse` checks, plus the OCR/forensics fields it adds. */
export function validScreenshotResponse(value: unknown): value is AnalyzeScreenshotResponse {
  if (!validResponse(value)) return false;
  const extra = value as unknown as Obj;
  return isStr(extra.extractedText) && optional(extra.imageForensics, validImageForensics);
}
