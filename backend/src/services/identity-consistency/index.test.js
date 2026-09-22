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
