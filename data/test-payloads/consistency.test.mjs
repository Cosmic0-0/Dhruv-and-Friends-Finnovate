// Run from the repo root: node --test data/test-payloads/consistency.test.mjs
// Tests the scoring only - no AI calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCases, summarize } from "./consistency.mjs";

const run = (verdict, signalTypes = [], extra = {}) => ({ verdict, signalTypes, riskScore: 80, ...extra });

test("loads all 72 payloads plus the 8 seed messages", () => {
  const cases = loadCases();
  assert.equal(cases.length, 72);
  assert.equal(new Set(cases.map((c) => c.id)).size, 72);
  assert.ok(cases.every((c) => c.message && c.expectedVerdict));
  assert.equal(loadCases("seed").length, 8);
});

test("same verdict and signals every run counts as stable", () => {
  const s = summarize({ id: "EN-01", expectedVerdict: "scam" }, [run("scam", ["a"]), run("scam", ["a"]), run("scam", ["a"])]);
  assert.equal(s.stable, true);
  assert.equal(s.verdictAgreement, 1);
  assert.equal(s.matchesExpected, 3);
  assert.deepEqual(s.unstableSignals, []);
});

test("a flipped verdict, a signal that comes and goes, and a failed run are all reported", () => {
  const s = summarize({ id: "EN-12", expectedVerdict: "suspicious" }, [
    run("suspicious", ["a", "b"], { riskScore: 55 }),
    run("scam", ["a"], { riskScore: 90 }),
    run("suspicious", ["a"], { riskScore: 60 }),
    { error: "LLM returned invalid JSON" },
  ]);
  assert.equal(s.stable, false);
  assert.equal(s.errors, 1);
  assert.deepEqual(s.verdicts, { suspicious: 2, scam: 1 });
  assert.equal(s.topVerdict, "suspicious");
  assert.equal(s.verdictAgreement, 2 / 3);
  assert.equal(s.matchesExpected, 2);
  assert.deepEqual(s.riskScoreRange, [55, 90]);
  assert.deepEqual(s.unstableSignals, ["b 1/3"]);
});

test("seed messages are unstable if the AI doesn't always pick out the number", () => {
  const c = { id: "SEED-0012", expectedVerdict: "scam", expectedSender: "59000012" };
  const s = summarize(c, [run("scam", [], { sender: "+230 5900 0012" }), run("scam", [], { sender: "59000012" }), run("scam", [], { sender: "Mum" })]);
  assert.equal(s.senderFound, 2);
  assert.equal(s.stable, false);
});

test("all runs failing is unstable, not a crash", () => {
  const s = summarize({ id: "EN-01", expectedVerdict: "scam" }, [{ error: "x" }, { error: "x" }]);
  assert.equal(s.stable, false);
  assert.equal(s.topVerdict, null);
});
