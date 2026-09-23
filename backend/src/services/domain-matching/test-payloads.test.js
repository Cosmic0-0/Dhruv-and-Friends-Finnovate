import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkUrls } from "./index.js";

// Cross-references the QA owner's fixtures (data/test-payloads/) against this
// module directly - not the full LLM pipeline. Per data/test-payloads/
// README.md "Matching semantics": lookalike_url is the one expected signal
// type that's deterministic (not LLM-driven), so it's the only one this
// module can be held to; everything else in a payload's expected.signals is
// LLM-driven and out of scope here.
const PAYLOAD_FILES = ["../../../../data/test-payloads/en.json", "../../../../data/test-payloads/fr.json"];

for (const file of PAYLOAD_FILES) {
  const payloads = JSON.parse(readFileSync(new URL(file, import.meta.url)));
  const lang = file.includes("/en.json") ? "en" : "fr";

  test(`checkUrls() flags lookalike_url for every ${lang} payload that expects it`, () => {
    const expectLookalike = payloads.filter((p) => p.expected.signals.includes("lookalike_url"));
    assert.ok(expectLookalike.length > 0, `expected at least one ${lang} payload asserting lookalike_url`);
    for (const p of expectLookalike) {
      const signals = checkUrls(p.message);
      assert.ok(
        signals.some((s) => s.type === "lookalike_url"),
        `${p.id} expected a lookalike_url signal but checkUrls() found none: ${p.message}`
      );
    }
  });

  test(`checkUrls() never flags lookalike_url for a ${lang} payload that doesn't expect it`, () => {
    // The inverse check: a payload that doesn't list lookalike_url in
    // expected.signals (e.g. a "safe" payload linking a real bank domain)
    // must not get a false-positive lookalike_url signal either.
    const dontExpectLookalike = payloads.filter((p) => !p.expected.signals.includes("lookalike_url"));
    for (const p of dontExpectLookalike) {
      const signals = checkUrls(p.message);
      assert.ok(
        !signals.some((s) => s.type === "lookalike_url"),
        `${p.id} did not expect lookalike_url but checkUrls() flagged one: ${p.message}`
      );
    }
  });
}
