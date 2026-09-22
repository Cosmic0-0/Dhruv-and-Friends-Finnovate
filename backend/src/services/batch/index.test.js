import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBatch } from "./index.js";

const fakeAnalyze = (verdictByMessage) => async (message) => ({
  verdict: verdictByMessage[message],
  signals: [],
  suggestedAction: "verify_official_channel",
});

test("summarizeBatch aggregates verdict counts correctly", async () => {
  const messages = ["scam one", "safe one", "suspicious one", "scam two"];
  const analyze = fakeAnalyze({
    "scam one": "scam",
    "safe one": "safe",
    "suspicious one": "suspicious",
    "scam two": "scam",
  });

  const { results, summary } = await summarizeBatch(messages, { analyze });

  assert.equal(results.length, 4);
  assert.deepEqual(summary, { total: 4, scamCount: 2, suspiciousCount: 1, safeCount: 1 });
});

test("summarizeBatch passes explanation through unchanged for every item", async () => {
  const messages = ["scam one", "safe one", "suspicious one"];
  const explanationByMessage = {
    "scam one": "Urgent bank impersonation with a lookalike link.",
    "safe one": "No scam signals detected.",
    "suspicious one": "Unusual urgency language, no confirmed sender mismatch.",
  };
  const verdictByMessage = { "scam one": "scam", "safe one": "safe", "suspicious one": "suspicious" };
  const analyze = async (message) => ({
    verdict: verdictByMessage[message],
    signals: [],
    suggestedAction: "verify_official_channel",
    explanation: explanationByMessage[message],
  });

  const { results } = await summarizeBatch(messages, { analyze });

  assert.equal(results.length, 3);
  for (const result of results) {
    assert.equal(result.explanation, explanationByMessage[result.message]);
  }
});

test("summarizeBatch rejects an empty batch", async () => {
  await assert.rejects(() => summarizeBatch([], { analyze: async () => ({}) }), /non-empty array/);
});

test("summarizeBatch rejects a non-array input", async () => {
  await assert.rejects(
    () => summarizeBatch("not an array", { analyze: async () => ({}) }),
    /non-empty array/
  );
});

test("summarizeBatch rejects an oversized batch", async () => {
  const messages = Array.from({ length: 101 }, (_, i) => `message ${i}`);
  await assert.rejects(
    () => summarizeBatch(messages, { analyze: async () => ({ verdict: "safe" }) }),
    /exceeds max size/
  );
});

test("summarizeBatch rejects a non-string or blank message", async () => {
  await assert.rejects(
    () => summarizeBatch(["ok", ""], { analyze: async () => ({ verdict: "safe" }) }),
    /non-empty string/
  );
});

test("summarizeBatch rejects a missing analyze function", async () => {
  await assert.rejects(() => summarizeBatch(["ok"], {}), /analyze must be a function/);
});
