import { test } from "node:test";
import assert from "node:assert/strict";
import { actionPlan, humanizeType, parseLinkCheck, safeChecks, signalKind, sortSignals } from "./result.ts";

test("signals sort highest severity first, stable within a severity", () => {
  const sorted = sortSignals([
    { id: "a", severity: "low" as const },
    { id: "b", severity: "high" as const },
    { id: "c", severity: "medium" as const },
    { id: "d", severity: "high" as const },
  ]);
  assert.deepEqual(sorted.map((s) => s.id), ["b", "d", "c", "a"]);
});

test("contract types and common LLM variants map to known kinds", () => {
  assert.equal(signalKind("sender_mismatch"), "sender_mismatch");
  assert.equal(signalKind("lookalike_url"), "lookalike_url");
  assert.equal(signalKind("urgency_language"), "urgency_language");
  assert.equal(signalKind("spoofed_identity"), "spoofed_identity");
  assert.equal(signalKind("bank impersonation"), "spoofed_identity");
  assert.equal(signalKind("Urgency Language"), "urgency_language");
  assert.equal(signalKind("suspicious-link"), "lookalike_url");
  assert.equal(signalKind("otpRequest"), "credential_request");
  assert.equal(signalKind("prize_scam"), "prize_offer");
  assert.equal(signalKind("grammar_errors"), null);
});

test("unknown types get a readable fallback, never snake_case", () => {
  assert.equal(humanizeType("grammar_errors"), "Grammar errors");
  assert.equal(humanizeType("unusualFormatting"), "Unusual formatting");
  assert.equal(humanizeType("  ALL-CAPS text "), "All caps text");
  assert.equal(humanizeType("___"), "");
});

test("link check parses the 'closely resembles' description", () => {
  assert.deepEqual(parseLinkCheck({ description: "mcb-mu.help closely resembles legitimate domain mcb.mu" }), {
    host: "mcb-mu.help",
    resembles: { kind: "domain", value: "mcb.mu" },
  });
});

test("link check parses the 'brand token' description", () => {
  assert.deepEqual(
    parseLinkCheck({ description: 'mcb-secure.top contains brand token "mcb" but is not a recognized domain for it' }),
    { host: "mcb-secure.top", resembles: { kind: "brand", value: "MCB" } },
  );
});

test("link check falls back to hostnames in free text, then evidence, and omits what it can't find", () => {
  assert.deepEqual(parseLinkCheck({ description: "The link sbm-group.co is not sbmgroup.mu." }), {
    host: "sbm-group.co",
    resembles: { kind: "domain", value: "sbmgroup.mu" },
  });
  assert.deepEqual(parseLinkCheck({ description: "Suspicious link", evidence: "http://myt-prize.win/claim" }), {
    host: "myt-prize.win",
  });
  assert.deepEqual(parseLinkCheck({ description: "Suspicious link" }), {});
});

test("scam steps always include the three safety steps", () => {
  const { steps } = actionPlan("scam", "block_sender");
  assert.deepEqual(steps, ["dont_open_or_reply", "block_sender", "call_bank_card", "delete_and_report"]);
});

test("scam with report_to_bank doesn't repeat the bank step", () => {
  const { steps } = actionPlan("scam", "report_to_bank");
  assert.deepEqual(steps, ["dont_open_or_reply", "call_bank_card", "delete_and_report"]);
});

test("several keys in one string are all used", () => {
  const { steps } = actionPlan("suspicious", "block_sender, verify_official_channel");
  assert.deepEqual(steps, ["block_sender", "verify_official", "dont_share_code"]);
});

test("unknown keys fall back to sensible defaults and aren't shown", () => {
  assert.deepEqual(actionPlan("suspicious", "call_police_now"), { steps: ["verify_official", "dont_share_code"] });
  assert.deepEqual(actionPlan("scam", "xyz").steps, ["dont_open_or_reply", "call_bank_card", "delete_and_report"]);
});

test("a sentence is kept as the model's own advice", () => {
  const plan = actionPlan("scam", "Do not click on the link. Contact MCB directly.");
  assert.equal(plan.prose, "Do not click on the link. Contact MCB directly.");
  assert.deepEqual(plan.steps, ["dont_open_or_reply", "call_bank_card", "delete_and_report"]);
});

test("safe checklist only claims what's true", () => {
  assert.deepEqual(safeChecks([], "Your MCB card ending 4417 was used for Rs 450 at Winners.", []), [
    "no_link",
    "informs_not_asks",
    "last_four_only",
    "no_pressure",
  ]);
  // A link is present: can't claim "no link", but no lookalike was found.
  assert.deepEqual(safeChecks([], "Your statement is ready on mcb.mu/statements", []), [
    "no_lookalike",
    "informs_not_asks",
    "no_pressure",
  ]);
  // Urgency present: neither calm tick is shown.
  assert.deepEqual(safeChecks([{ type: "urgency_language" }], "Reply today please", []), ["no_link"]);
  // Full account number in the text: no last-4 tick even if a masked one is also there.
  assert.deepEqual(
    safeChecks([], "Card XXXX4417, account 000123454417", [{ kind: "account" }]),
    ["no_link", "informs_not_asks", "no_pressure"],
  );
});
