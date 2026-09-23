import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSignal } from "../signals/registry.js";
import { planVerification } from "./index.js";
import { DEMO_ORGANISATION } from "../workplace-registry/index.js";

const sig = (code, variant) => makeSignal(code, { sourceType: "rule", metadata: variant ? { variant } : {} });

test("verification planner matches CODE and CODE:variant without contacting anyone", () => {
  const result = planVerification({ level: "high", signals: [sig("EMAIL-09", "executive"), sig("PAY-01")], profile: DEMO_ORGANISATION });
  const workflow = result.workflows.find((w) => w.id === "executive_payment_request");
  assert.ok(workflow);
  assert.equal(workflow.requiredApprovals, 2);
  assert.ok(workflow.steps.some((s) => /normal approval/i.test(s)));
  assert.equal(result.required, true);
});

test("low risk and a trigger missing requiresAny do not schedule a workflow", () => {
  assert.equal(planVerification({ level: "low", signals: [sig("EMAIL-06")] }).required, false);
  const noPayment = planVerification({ level: "elevated", signals: [sig("EMAIL-09", "executive")] });
  assert.ok(!noPayment.workflows.some((w) => w.id === "executive_payment_request"));
});
