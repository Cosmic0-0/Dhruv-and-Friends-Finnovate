import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEmailContext, normalizeAddress, availableEvidence } from "./index.js";

test("absent emailContext is simply null", () => {
  assert.deepEqual(validateEmailContext(undefined), { value: null });
  assert.deepEqual(validateEmailContext(null), { value: null });
});

test("empty object is valid: every field optional, nothing supplied", () => {
  const { value } = validateEmailContext({});
  assert.equal(value.from, null);
  assert.deepEqual(value.replyTo, []);
  assert.deepEqual(value.authentication, { spf: "unknown", dkim: "unknown", dmarc: "unknown" });
  assert.equal(value.authenticationSupplied, false);
  assert.equal(value.threadContext, null);
  assert.deepEqual(availableEvidence(value), []);
});

test("addresses are normalised: case, angle brackets, punycode domain decoded", () => {
  assert.deepEqual(normalizeAddress(" <Finance@ABC-Supplies.Example> "), {
    address: "finance@abc-supplies.example", local: "finance", domain: "abc-supplies.example", asciiDomain: "abc-supplies.example",
  });
  const puny = normalizeAddress("pay@xn--bc-supplies-wrg.example");
  assert.equal(puny.asciiDomain, "xn--bc-supplies-wrg.example");
  assert.notEqual(puny.domain, puny.asciiDomain, "Unicode form kept for homoglyph comparison");
  assert.equal(normalizeAddress("not an address"), null);
  assert.equal(normalizeAddress("a@b"), null);
});

test("unrecognised authentication values become 'unknown', never 'fail'", () => {
  const { value } = validateEmailContext({ authentication: { spf: "PASS", dkim: "bestguesspass", dmarc: null } });
  assert.deepEqual(value.authentication, { spf: "pass", dkim: "unknown", dmarc: "unknown" });
  assert.equal(value.authenticationSupplied, true);
});

test("single replyTo object and bare address strings are accepted", () => {
  const { value } = validateEmailContext({ from: "Finance@abc-supplies.example", replyTo: { address: "x@gmail.com" } });
  assert.equal(value.from.address, "finance@abc-supplies.example");
  assert.equal(value.from.name, null);
  assert.equal(value.replyTo[0].domain, "gmail.com");
});

test("an empty thread history is 'no history', not an empty comparison", () => {
  assert.equal(validateEmailContext({ threadContext: { previousSenders: [] } }).value.threadContext, null);
});

test("malformed input is a 400-style error", () => {
  assert.match(validateEmailContext("x").error, /must be an object/);
  assert.match(validateEmailContext({ from: 5 }).error, /emailContext.from/);
  assert.match(validateEmailContext({ from: { address: "nope" } }).error, /valid email address/);
  assert.match(validateEmailContext({ attachments: [{ name: "" }] }).error, /attachments\[0\].name/);
  assert.match(validateEmailContext({ attachments: [{ name: "a.pdf", size: -1 }] }).error, /size/);
  assert.match(validateEmailContext({ threadContext: { previousSenders: ["bad"] } }).error, /previousSenders/);
  assert.match(validateEmailContext({ authentication: { spf: 1 } }).error, /authentication.spf/);
  assert.match(validateEmailContext({ urls: "x" }).error, /urls/);
});

test("availableEvidence lists only what was supplied", () => {
  const { value } = validateEmailContext({
    from: { name: "A", address: "a@x.example" },
    authentication: { dmarc: "pass" },
    attachments: [{ name: "a.pdf" }],
  });
  assert.deepEqual(availableEvidence(value), ["from", "displayName", "authentication", "attachments"]);
});
