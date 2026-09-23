// #20 follow-up: the model reads a bank's own safety advice as scam tactics.
// These are the live model's actual outputs for bank-advice.html.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSemanticOutput } from "./index.js";

const ADVICE = [
  "Protect yourself from fraud",
  "MCB will never ask for your OTP, PIN or password. If someone asks, hang up immediately.",
  "Do not click links in unexpected messages.",
  "Always log in by typing internet.mcb.mu yourself.",
].join("\n");

const kept = (signals, message) => parseSemanticOutput({ signals }, message).signals.map((s) => s.code);

test("protective 'do not <action>' advice is not a scam signal", () => {
  assert.deepEqual(kept([{ code: "SOC-05", evidence: "Do not click links in unexpected messages.", confidence: 0.6 }], ADVICE), []);
  assert.deepEqual(kept([{ code: "SOC-01", evidence: "Never share your code with anyone", confidence: 0.6 }], "Never share your code with anyone, even staff."), []);
});

test("being sent to the institution's own official domain is not off-platform contact", () => {
  assert.deepEqual(kept([{ code: "SOC-04", evidence: "Always log in by typing internet.mcb.mu yourself.", confidence: 0.6 }], ADVICE), []);
});

test("real scam pressure phrased with a negation is still kept", () => {
  const threat = "Do not ignore this message or your account will be blocked today.";
  assert.deepEqual(kept([{ code: "SOC-02", evidence: threat, confidence: 0.8 }], threat), ["SOC-02"]);
  const secrecy = "Don't tell anyone at the bank about this transfer.";
  assert.deepEqual(kept([{ code: "SOC-03", evidence: secrecy, confidence: 0.8 }], secrecy), ["SOC-03"]);
  const urgent = "Do not delay, click here now: mcb-secure.top";
  assert.deepEqual(kept([{ code: "SOC-01", evidence: urgent, confidence: 0.8 }], urgent), ["SOC-01"]);
});

test("pushing to an unofficial site or a phone number is still off-platform contact", () => {
  const offsite = "Log in by typing mcb-verify.top yourself.";
  assert.deepEqual(kept([{ code: "SOC-04", evidence: offsite, confidence: 0.7 }], offsite), ["SOC-04"]);
  const phone = "Continue on WhatsApp at +230 5912 3456.";
  assert.deepEqual(kept([{ code: "SOC-04", evidence: phone, confidence: 0.7 }], phone), ["SOC-04"]);
});
