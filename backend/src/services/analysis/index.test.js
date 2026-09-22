import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Must be set before ANY import of index.js (even transitively): index.js
// imports llmClient.js, which reads these into module-load-time constants.
// A static top-level `import ... from "./index.js"` is hoisted ahead of any
// code in this file regardless of source order, so every export this file
// needs comes from a single dynamic import below, after these are set -
// same pattern as backend/src/routes/index.test.js and
// backend/src/services/domain-age/index.test.js.
process.env.LLM_MODE = "fallback";
process.env.FALLBACK_PROVIDER = "anthropic";
process.env.FALLBACK_API_KEY = "test-key";

const { analyzeMessage, sanitizeSignal, classifySignalSource } = await import("./index.js");

test("sanitizeSignal attaches a source field to every signal", () => {
  const out = sanitizeSignal({ type: "spoofed_identity", description: "claims to be MCB", severity: "high" });
  assert.equal(typeof out.source, "string");
  assert.equal(out.source, "llm_analysis");
});

test("classifySignalSource labels message-content patterns as message_text", () => {
  assert.equal(classifySignalSource("urgency_language"), "message_text");
  assert.equal(classifySignalSource("otp_request"), "message_text");
  assert.equal(classifySignalSource("credential_request"), "message_text");
  assert.equal(classifySignalSource("secrecy_instruction"), "message_text");
});

test("classifySignalSource labels inferential scam-pattern types as llm_analysis", () => {
  assert.equal(classifySignalSource("sender_mismatch"), "llm_analysis");
  assert.equal(classifySignalSource("spoofed_identity"), "llm_analysis");
});

test("sanitizeSignal preserves existing fields and only adds source, never removes evidence", () => {
  const out = sanitizeSignal({
    type: "urgency_language",
    description: "creates time pressure",
    severity: "medium",
    evidence: "Act now within 1 hour",
  });
  assert.equal(out.type, "urgency_language");
  assert.equal(out.description, "creates time pressure");
  assert.equal(out.severity, "medium");
  assert.equal(out.evidence, "Act now within 1 hour");
  assert.equal(out.source, "message_text");
});

const originalFetch = globalThis.fetch;

const MOCK_LLM_RESULT = {
  verdict: "scam",
  signals: [{ type: "otp_request", description: "Asks for an OTP code", severity: "high" }],
  suggestedAction: "block_sender",
  explanation: "This message asks for an OTP, a common scam tactic.",
  riskScore: 90,
  sender: "IslandTrust Bank",
};

// Lifted verbatim from data/kreol-dataset/scam-corpus.jsonl (id: FL-KM-0002,
// status: owner_reviewed) - a realistic mfe+en code-switched OTP-theft
// message that should retrieve grounding.
const REALISTIC_KREOL_MESSAGE =
  "Ser client, lekip sekirite IslandTrust Bank pe demann ou konfirm OTP (583291) lor sa nimero-la pou anil enn transaksion sispe.";

test.afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = originalFetch;
});

test("analyzeMessage includes the Kreol grounding block in the prompt when relevant examples exist, and returns a valid result", async () => {
  let capturedBody;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /api\.anthropic\.com/);
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ text: JSON.stringify(MOCK_LLM_RESULT) }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await analyzeMessage(REALISTIC_KREOL_MESSAGE, "mixed");

  assert.ok(capturedBody, "expected the LLM call to have been made");
  const prompt = capturedBody.messages[0].content;
  assert.match(prompt, /SYNTHETIC/);
  assert.match(prompt, /Reviewed example scam messages:/);
  assert.match(prompt, /583291/, "expected the OTP entity from the grounding example to appear in the prompt");

  // Still returns a valid, schema-conformant result - the grounding block
  // never interferes with parsing/validating the LLM's structured output.
  assert.equal(result.verdict, "scam");
  assert.ok(Array.isArray(result.signals) && result.signals.length > 0);
  assert.equal(typeof result.suggestedAction, "string");
  assert.equal(typeof result.explanation, "string");
  assert.equal(result.riskScore, 90);
  assert.equal(result.sender, "IslandTrust Bank");
});

test("analyzeMessage still returns a valid result when no grounding is relevant (bare prompt, no grounding block)", async () => {
  let capturedBody;
  globalThis.fetch = async (url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ text: JSON.stringify(MOCK_LLM_RESULT) }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await analyzeMessage("Zzzqx Wvbnm Ptrfgh 999000 unrelated gibberish nonsense", "en");

  const prompt = capturedBody.messages[0].content;
  assert.doesNotMatch(prompt, /SYNTHETIC/);
  assert.equal(result.verdict, "scam");
  assert.equal(typeof result.explanation, "string");
});
