import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRiskCategories, RISK_CATEGORIES } from "./index.js";

test("computeRiskCategories defaults every category to LOW when there are no signals", () => {
  const categories = computeRiskCategories([]);
  for (const category of RISK_CATEGORIES) {
    assert.equal(categories[category], "LOW");
  }
});

test("computeRiskCategories maps DOMAIN/lookalike-URL signals to technical_risk", () => {
  const categories = computeRiskCategories([{ type: "lookalike_url", severity: "high" }]);
  assert.equal(categories.technical_risk, "HIGH");
  assert.equal(categories.identity_risk, "LOW");
});

test("computeRiskCategories maps IDENTITY_MISMATCH to identity_risk", () => {
  const categories = computeRiskCategories([{ type: "IDENTITY_MISMATCH", severity: "high" }]);
  assert.equal(categories.identity_risk, "HIGH");
  assert.equal(categories.technical_risk, "LOW");
});

test("computeRiskCategories maps urgency/secrecy signals to behavioral_risk", () => {
  const categories = computeRiskCategories([
    { type: "urgency_language", severity: "medium" },
    { type: "secrecy_instruction", severity: "low" },
  ]);
  assert.equal(categories.behavioral_risk, "MEDIUM");
});

test("computeRiskCategories takes the highest severity within a category", () => {
  const categories = computeRiskCategories([
    { type: "urgency_language", severity: "low" },
    { type: "threat_language", severity: "high" },
  ]);
  assert.equal(categories.behavioral_risk, "HIGH");
});

test("computeRiskCategories maps OTP/credential signals to payment_risk", () => {
  const categories = computeRiskCategories([{ type: "otp_request", severity: "medium" }]);
  assert.equal(categories.payment_risk, "MEDIUM");
});

test("computeRiskCategories maps TEMPLATE_ARTIFACT to identity_risk", () => {
  const categories = computeRiskCategories([{ type: "TEMPLATE_ARTIFACT", severity: "high" }]);
  assert.equal(categories.identity_risk, "HIGH");
});
