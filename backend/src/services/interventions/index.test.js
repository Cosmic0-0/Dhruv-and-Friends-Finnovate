import { test } from "node:test";
import assert from "node:assert/strict";
import { planInterventions, buildExplanation } from "./index.js";

const ids = (plan) => plan.actions.map((a) => a.id);

test("URL impersonation -> don't open the link, go to the official site yourself", () => {
  const plan = planInterventions({ level: "high", codes: ["URL-02"] });
  assert.ok(ids(plan).includes("dont_open_link"));
  assert.ok(ids(plan).includes("open_official_directly"));
  assert.equal(plan.suggestedAction, "block_sender, report_to_bank");
});

test("OTP request -> don't share the code, use a verified channel", () => {
  const plan = planInterventions({ level: "high", codes: ["SEC-01"] });
  assert.deepEqual(ids(plan).slice(0, 2), ["dont_share_code", "contact_verified_channel"]);
});

test("payment request -> don't send money yet; bank-detail change -> verify with supplier", () => {
  assert.ok(ids(planInterventions({ level: "elevated", codes: ["PAY-01"] })).includes("dont_send_money"));
  assert.ok(ids(planInterventions({ level: "elevated", codes: ["PAY-07"] })).includes("verify_bank_change"));
});

test("elevated with no specific policy falls back to verify_first", () => {
  const plan = planInterventions({ level: "elevated", codes: ["SOC-01"] });
  assert.deepEqual(ids(plan), ["verify_first"]);
  assert.equal(plan.suggestedAction, "verify_official_channel");
});

test("low risk: no scary actions and no reduce-concern list", () => {
  const plan = planInterventions({ level: "low", codes: [] });
  assert.deepEqual(ids(plan), ["no_warning_signs"]);
  assert.deepEqual(plan.reduceConcern, []);
});

test("reduceConcern never claims a message is safe", () => {
  const plan = planInterventions({ level: "high", codes: ["URL-02", "PAY-05", "SOC-03", "PAY-04"] });
  assert.ok(plan.reduceConcern.length > 0);
  for (const line of plan.reduceConcern) assert.doesNotMatch(line, /\bsafe\b|legitimate/i);
});

test("explanation is built from the decision only and flags AI outage", () => {
  const text = buildExplanation({ level: "high", score: 46, findingCount: 3, inferredCount: 0, semanticStatus: "unavailable" }, "en");
  assert.match(text, /Risk high \(46\/100\), calculated by FraudLens rules/);
  assert.match(text, /AI language analysis was unavailable/);
  assert.match(buildExplanation({ level: "low", score: 0, findingCount: 0, inferredCount: 0, semanticStatus: "ok" }, "fr"), /Aucun signal/);
});
