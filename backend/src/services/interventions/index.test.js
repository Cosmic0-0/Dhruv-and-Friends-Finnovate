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

test("email: verified supplier bank change -> use stored contacts, verify verbally; no duplicate generic advice", () => {
  const plan = planInterventions({ level: "high", codes: ["EMAIL-06", "PAY-07"], source: "email" });
  assert.deepEqual(ids(plan).slice(0, 3), ["supplier_dont_use_details", "supplier_contact_known", "supplier_verify_verbally"]);
  assert.ok(!ids(plan).includes("verify_bank_change"));
});

test("email: executive impersonation -> hold the transfer, normal approval process", () => {
  const plan = planInterventions({ level: "critical", codes: ["EMAIL-09", "PAY-01"], source: "email" });
  for (const id of ["exec_hold_transfer", "exec_normal_approval", "exec_no_email_contacts"]) assert.ok(ids(plan).includes(id), id);
});

test("email: credential phishing gets email wording; the same codes on SMS keep the SMS wording", () => {
  const email = planInterventions({ level: "high", codes: ["URL-08", "SEC-01"], source: "email" });
  assert.ok(ids(email).includes("phish_no_password"));
  assert.ok(!ids(email).includes("dont_open_link"));
  const sms = planInterventions({ level: "high", codes: ["URL-08", "SEC-01"], source: "pasted_text" });
  assert.ok(ids(sms).includes("dont_open_link"));
  assert.ok(!ids(sms).includes("phish_no_password"));
});

test("email: low level never gets warnings, even with weak email findings", () => {
  const plan = planInterventions({ level: "low", codes: ["EMAIL-01"], source: "email" });
  assert.deepEqual(ids(plan), ["no_warning_signs"]);
});

test("documents: forgery artefacts -> confirm with the issuer; active content -> don't enable it", () => {
  assert.ok(ids(planInterventions({ level: "elevated", codes: ["DOC-05"] })).includes("doc_verify_with_issuer"));
  assert.ok(ids(planInterventions({ level: "elevated", codes: ["DOC-07"] })).includes("doc_dont_enable_content"));
  // A plain re-save is not a reason to chase the issuer; a change after signing is.
  assert.ok(!ids(planInterventions({ level: "elevated", codes: ["DOC-02"], variants: ["DOC-02:incremental_update"] })).includes("doc_verify_with_issuer"));
  assert.ok(ids(planInterventions({ level: "elevated", codes: ["DOC-02"], variants: ["DOC-02:after_signature"] })).includes("doc_verify_with_issuer"));
  assert.deepEqual(ids(planInterventions({ level: "low", codes: ["DOC-04"] })), ["no_warning_signs"]);
});
