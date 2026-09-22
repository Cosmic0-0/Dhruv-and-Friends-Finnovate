import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSignal, classifySignalSource } from "./index.js";

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
