import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, buildTranscript, mapFlags, stageTimeline, validateConversation, MAX_CONVERSATION_TEXT } from "./index.js";

const chat = [
  { from: "them", text: "Hi! Sorry, wrong number." },
  { from: "me", text: "No, sorry" },
  { from: "them", text: "You can start with only Rs 5,000. Returns are guaranteed." },
  { from: "them", text: "Send me the OTP you received now." },
];

test("validateConversation rejects bad input", () => {
  assert.ok(validateConversation({}).error);
  assert.ok(validateConversation({ messages: [{ from: "x", text: "a" }] }).error);
  assert.ok(validateConversation({ messages: [{ from: "me", text: "only me" }] }).error);
  assert.ok(validateConversation({ messages: [{ from: "them", text: "a".repeat(5001) }] }).error);
  assert.deepEqual(validateConversation({ messages: chat }).value.messages.length, 4);
});

test("buildTranscript keeps only the other party, in order, with offsets", () => {
  const t = buildTranscript(chat);
  assert.equal(t.parts.length, 3);
  assert.deepEqual(t.parts.map((p) => p.index), [0, 2, 3]);
  assert.ok(!t.text.includes("No, sorry"));
  assert.equal(t.text.slice(t.parts[2].start, t.parts[2].end), "Send me the OTP you received now.");
  assert.equal(t.truncated, false);
});

test("buildTranscript keeps the newest messages when over budget", () => {
  const long = Array.from({ length: 10 }, (_, i) => ({ from: "them", text: `${i} `.padEnd(3000, "x") }));
  const t = buildTranscript(long);
  assert.ok(t.text.length <= MAX_CONVERSATION_TEXT);
  assert.equal(t.truncated, true);
  assert.equal(t.parts.at(-1).index, 9);
  assert.equal(t.firstAnalysedIndex, t.parts[0].index);
});

test("mapFlags attaches only grounded evidence to the right message; stages follow", () => {
  const t = buildTranscript(chat);
  const flags = mapFlags(
    [
      { code: "SEC-01", severity: "high", evidence: "OTP you received" },
      { code: "SOC-06", severity: "medium", evidence: "Returns are guaranteed" },
      { code: "SOC-01", severity: "low", evidence: "not in the chat at all" },
      { code: "REP-03", severity: "medium", evidence: "Sender", sourceType: "community" },
      { code: "PAY-01", severity: "low" },
    ],
    t,
  );
  assert.deepEqual(flags.map((f) => [f.index, f.code]), [[2, "SOC-06"], [3, "SEC-01"]]);
  assert.deepEqual(stageTimeline(flags), [{ stage: "TRUST_BUILDING", index: 2 }, { stage: "OTP_REQUEST", index: 3 }]);
});

test("analyzeConversation runs the pipeline once on the transcript", async () => {
  const seen = [];
  const out = await analyzeConversation(chat, {
    analyze: async (text) => {
      seen.push(text);
      return { verdict: "scam", signals: [{ code: "SEC-01", severity: "high", evidence: "the OTP" }] };
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(out.verdict, "scam");
  assert.equal(out.conversation.messageCount, 4);
  assert.equal(out.conversation.flags[0].index, 3);
});
