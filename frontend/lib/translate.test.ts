// Run: npm test  (Node's built-in test runner; Node strips the TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "./redact.ts";
import { restoreTokens, tokenizeRedactions } from "./translate.ts";

test("no redactions: the text is sent unchanged", () => {
  const { text, tokens } = tokenizeRedactions("Your account will be blocked today.", []);
  assert.equal(text, "Your account will be blocked today.");
  assert.deepEqual(tokens, []);
});

test("placeholders become opaque tokens and no value or placeholder wording is left to translate", () => {
  const r = redact("Call 52581234 about account 000123454417 or mail help@bank.example now.");
  const { text } = tokenizeRedactions(r.redacted, r.redactions);
  assert.doesNotMatch(text, /\[(?:phone|account|email)/);
  assert.doesNotMatch(text, /52581234|000123454417/);
  assert.equal((text.match(/<PRIV_\d+>/g) ?? []).length, 3);
});

test("a translation that keeps the tokens gets the user's own values back", () => {
  const original = "Call 52581234 about account 000123454417 now.";
  const r = redact(original);
  const { text, tokens } = tokenizeRedactions(r.redacted, r.redactions);
  // Stand-in for a translation: words change, tokens stay.
  const translated = text.replace("Call", "Apel").replace("about account", "pou kont").replace("now", "aster");
  assert.equal(restoreTokens(translated, tokens), "Apel 52581234 pou kont 000123454417 aster.");
});

test("the same number mentioned twice keeps mapping to the same value", () => {
  const r = redact("Call 52581234 now. I repeat: call 52581234 now.");
  const { text, tokens } = tokenizeRedactions(r.redacted, r.redactions);
  assert.equal(restoreTokens(text, tokens), "Call 52581234 now. I repeat: call 52581234 now.");
});

test("tokenising and restoring an untouched message is a lossless round trip", () => {
  const original = "Send Rs 5,000 to 000123454417, then call +230 5258 1234 or email a.b@example.test";
  const r = redact(original);
  const { text, tokens } = tokenizeRedactions(r.redacted, r.redactions);
  assert.equal(restoreTokens(text, tokens), original);
});
