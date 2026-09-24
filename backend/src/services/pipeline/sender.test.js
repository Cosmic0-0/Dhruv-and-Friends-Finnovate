// Regression: the seed-set consistency check found 0/8 messages had their
// sender extracted, because none used a labelled "From:"/"Sender:" line -
// they just gave a number to send money or reply to ("send it here: 5900
// 0012"). extractObservedSender() (private to pipeline/index.js) is
// exercised here through runPipeline() with the LLM disabled, so only the
// deterministic regex fallback is under test.
process.env.DATABASE_URL = ":memory:";

import { test } from "node:test";
import assert from "node:assert/strict";

const { runPipeline } = await import("./index.js");
const OFF = { enabled: false };

test("a 'From:' line is still picked up", async () => {
  const r = await runPipeline("From: MCB Alerts. Your OTP is 482913.", { semantic: OFF });
  assert.equal(r.observedSender, "MCB Alerts");
});

test("a number the message asks you to send money to is picked up with no sender line", async () => {
  const r = await runPipeline("Ou finn gagn enn refund. Avoy nimero kont ou pou konfirm, send it here: 5900 0012", { semantic: OFF });
  assert.equal(r.observedSender, "5900 0012");
});

test("a number the message asks you to reply on is picked up", async () => {
  const r = await runPipeline("Your parcel is held at customs. Pay the fee to release it, reply on 5750 1234 to confirm.", { semantic: OFF });
  assert.equal(r.observedSender, "5750 1234");
});

test("no sender line and no send/reply number leaves observedSender absent", async () => {
  const r = await runPipeline("Please pay your electricity bill by Friday.", { semantic: OFF });
  assert.equal(r.observedSender, undefined);
});

test("an unrelated 'send' does not false-positive on a stray number", async () => {
  const r = await runPipeline("We will send your invoice by email within 3 business days.", { semantic: OFF });
  assert.equal(r.observedSender, undefined);
});
