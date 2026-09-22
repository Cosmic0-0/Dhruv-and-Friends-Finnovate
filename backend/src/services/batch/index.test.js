import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBatch, MAX_BATCH_SIZE } from "./index.js";

const fakeAnalyze = (verdictByMessage) => async (message) => ({
  verdict: verdictByMessage[message],
  signals: [],
  suggestedAction: "verify_official_channel",
  analysisFailed: false,
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
  assert.deepEqual(summary, { total: 4, scamCount: 2, suspiciousCount: 1, safeCount: 1, unanalyzedCount: 0 });
});

test("summarizeBatch passes through every field analyze() returns, not just the five originally destructured", async () => {
  // Regression test: summarizeBatch used to destructure only verdict/
  // signals/suggestedAction/explanation/analysisFailed and rebuild a new
  // object from just those, silently dropping riskScore/sender/
  // senderReports/riskCategories even though routes/index.js's analyze()
  // callback already computed them (see docs/API-CONTRACT.md Known Gaps).
  const analyze = async () => ({
    verdict: "scam",
    signals: [{ type: "IDENTITY_MISMATCH", description: "x", severity: "high", source: "identity_check" }],
    suggestedAction: "block_sender",
    explanation: "x",
    riskScore: 95,
    sender: "MCB",
    senderReports: 3,
    riskCategories: { identity_risk: "HIGH", behavioral_risk: "LOW", payment_risk: "LOW", technical_risk: "HIGH", verification_risk: "LOW" },
  });

  const { results } = await summarizeBatch(["one message"], { analyze });

  assert.equal(results[0].riskScore, 95);
  assert.equal(results[0].sender, "MCB");
  assert.equal(results[0].senderReports, 3);
  assert.deepEqual(results[0].riskCategories, {
    identity_risk: "HIGH",
    behavioral_risk: "LOW",
    payment_risk: "LOW",
    technical_risk: "HIGH",
    verification_risk: "LOW",
  });
  assert.equal(results[0].signals[0].type, "IDENTITY_MISMATCH");
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
  const messages = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `message ${i}`);
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

test("summarizeBatch marks a failed item with analysisFailed and counts it in unanalyzedCount", async () => {
  const messages = ["ok one", "boom", "ok two"];
  const analyze = async (message) => {
    if (message === "boom") {
      return {
        verdict: "suspicious",
        signals: [],
        suggestedAction: "verify_official_channel",
        explanation: "Analysis failed: LLM unreachable",
        analysisFailed: true,
      };
    }
    return { verdict: "safe", signals: [], suggestedAction: "verify_official_channel", analysisFailed: false };
  };

  const { results, summary } = await summarizeBatch(messages, { analyze });

  const failed = results.find((r) => r.message === "boom");
  assert.equal(failed.analysisFailed, true);
  assert.equal(results.filter((r) => r.message !== "boom").every((r) => r.analysisFailed === false), true);
  assert.equal(summary.unanalyzedCount, 1);
  assert.equal(summary.suspiciousCount, 1);
});

test("summarizeBatch returns results in original input order despite concurrent execution", async () => {
  const messages = Array.from({ length: 10 }, (_, i) => `message ${i}`);
  // Reverse-staggered delay so later items can resolve before earlier ones
  // if order weren't preserved explicitly by index.
  const analyze = async (message) => {
    const index = Number(message.split(" ")[1]);
    await new Promise((resolve) => setTimeout(resolve, (messages.length - index) % 4));
    return { verdict: "safe", signals: [], suggestedAction: "verify_official_channel", analysisFailed: false };
  };

  const { results } = await summarizeBatch(messages, { analyze }, 4);

  assert.deepEqual(
    results.map((r) => r.message),
    messages
  );
});
