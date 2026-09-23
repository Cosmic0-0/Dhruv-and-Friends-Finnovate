import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIdentityConsistency } from "./index.js";

test("checkIdentityConsistency flags a claimed identity whose link points to a different domain", () => {
  const signals = checkIdentityConsistency("This is MCB. Verify your account now at https://mcb-secure.top/verify");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "IDENTITY_MISMATCH");
  assert.equal(signals[0].severity, "high");
  assert.equal(signals[0].source, "identity_check");
  assert.match(signals[0].description, /MCB/);
});

test("checkIdentityConsistency flags a beneficiary unrelated to the claimed identity", () => {
  const signals = checkIdentityConsistency("MRA: your tax refund is ready. Please transfer to John Peter to receive it.");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "IDENTITY_MISMATCH");
  assert.equal(signals[0].source, "identity_check");
  assert.match(signals[0].description, /MRA/);
});

test("checkIdentityConsistency does not flag when the link domain matches the claimed identity", () => {
  const signals = checkIdentityConsistency("This is MCB, log in at https://mcb.mu/login to verify your account");
  assert.deepEqual(signals, []);
});

test("checkIdentityConsistency does not flag when no known identity is claimed", () => {
  assert.deepEqual(checkIdentityConsistency("Your OTP is 4821, do not share it with anyone."), []);
});

test("checkIdentityConsistency does not flag when the beneficiary references the claimed identity", () => {
  const signals = checkIdentityConsistency("Emtel: please pay to Emtel Ltd to renew your plan.");
  assert.deepEqual(signals, []);
});

// ---- Regression (docs/ARCHITECTURE-REVIEW.md C1/C2) ----
test("an official subdomain is not an identity mismatch", () => {
  assert.deepEqual(checkIdentityConsistency("MCB: log in at https://internet.mcb.mu to view your statement"), []);
});

test("a URL shortener is not an identity mismatch", () => {
  assert.deepEqual(checkIdentityConsistency("MCB: see https://mcb.mu/help and bit.ly/mcbhelp"), []);
});

test("MRA linking either of its registered official domains is not a mismatch", () => {
  assert.deepEqual(checkIdentityConsistency("MRA: file your return at mra.mu before 30 September"), []);
  assert.deepEqual(checkIdentityConsistency("MRA: file your return at https://mra.gov.mu"), []);
});

test("domain and beneficiary mismatches are separate coded signals with evidence", () => {
  const signals = checkIdentityConsistency("This is MCB. Pay to John Peter at https://mcb-pay.top/now");
  assert.deepEqual(signals.map((s) => s.code).sort(), ["ID-01", "ID-02"]);
  const id01 = signals.find((s) => s.code === "ID-01");
  assert.equal(id01.actualDomain, "mcb-pay.top");
  assert.equal(id01.sourceType, "rule");
});
