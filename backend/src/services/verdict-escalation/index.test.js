import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileVerdict } from "./index.js";

test("reconcileVerdict escalates safe to suspicious when a deterministic high-severity signal is present", () => {
  const result = { verdict: "safe", riskScore: 20, signals: [{ type: "TEMPLATE_ARTIFACT", severity: "high", source: "template_check" }] };
  const reconciled = reconcileVerdict(result);
  assert.equal(reconciled.verdict, "suspicious");
  assert.equal(reconciled.riskScore, 50);
});

test("reconcileVerdict raises riskScore only up to the floor, never down", () => {
  const result = { verdict: "safe", riskScore: 65, signals: [{ type: "IDENTITY_MISMATCH", severity: "high", source: "identity_check" }] };
  const reconciled = reconcileVerdict(result);
  assert.equal(reconciled.verdict, "suspicious");
  assert.equal(reconciled.riskScore, 65);
});

test("reconcileVerdict leaves safe alone when the only high-severity signal came from the LLM itself", () => {
  const result = { verdict: "safe", riskScore: 10, signals: [{ type: "URGENCY", severity: "high", source: "llm_analysis" }] };
  assert.deepEqual(reconcileVerdict(result), result);
});

test("reconcileVerdict leaves safe alone when no signal is high severity", () => {
  const result = { verdict: "safe", riskScore: 10, signals: [{ type: "lookalike_url", severity: "medium", source: "url_parser" }] };
  assert.deepEqual(reconcileVerdict(result), result);
});

test("reconcileVerdict never touches an already-suspicious or scam verdict", () => {
  const suspicious = { verdict: "suspicious", riskScore: 30, signals: [] };
  const scam = { verdict: "scam", riskScore: 95, signals: [{ type: "TEMPLATE_ARTIFACT", severity: "high", source: "template_check" }] };
  assert.deepEqual(reconcileVerdict(suspicious), suspicious);
  assert.deepEqual(reconcileVerdict(scam), scam);
});

test("reconcileVerdict handles a missing signals array and missing riskScore", () => {
  const reconciled = reconcileVerdict({ verdict: "safe" });
  assert.equal(reconciled.verdict, "safe");
});
