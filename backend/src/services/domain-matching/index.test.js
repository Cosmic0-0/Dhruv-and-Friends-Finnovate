import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUrls, LEGIT_DOMAINS } from "./index.js";

test("checkUrls flags a scheme-less lookalike URL", () => {
  const signals = checkUrls("Verify at mcb.nu/verify now");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "lookalike_url");
  assert.equal(signals[0].severity, "high");
});

test("checkUrls tags every signal with source: url_parser", () => {
  const signals = checkUrls("Verify at mcb.nu/verify now");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].source, "url_parser");
});

test("checkUrls flags a brand-substring lookalike domain", () => {
  const signals = checkUrls("Urgent: verify your account at https://mcb-secure.top/verify");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "lookalike_url");
  assert.match(signals[0].description, /mcb/);
});

test("checkUrls never flags a legit domain", () => {
  for (const domain of LEGIT_DOMAINS) {
    const signals = checkUrls(`Please log in at https://${domain}/login to continue`);
    assert.deepEqual(signals, []);
  }
});

test("checkUrls returns an empty array when the message has no URL", () => {
  assert.deepEqual(checkUrls("Your OTP is 4821, do not share it with anyone."), []);
});
