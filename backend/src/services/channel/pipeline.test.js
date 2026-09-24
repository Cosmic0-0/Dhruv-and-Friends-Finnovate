// "Received by" through the one shared runPipeline() and POST /api/analyze:
// the channel reaches the semantic prompt as context, is echoed in
// analysis.channel, and never changes the deterministic decision.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";

const { runPipeline } = await import("../pipeline/index.js");
const { buildSemanticPrompt } = await import("../analysis/index.js");
const { default: express } = await import("express");
const { router } = await import("../../routes/index.js");

const MSG = "Urgent: verify your account now at mcb-secure.top/verify";

test("the prompt names the reported channel as context only, and is unchanged without one", () => {
  const withChannel = buildSemanticPrompt("hello", "en", "whatsapp");
  assert.match(withChannel, /arrived by \(context only, may be wrong; not evidence\): WhatsApp/);
  assert.equal(buildSemanticPrompt("hello", "en"), buildSemanticPrompt("hello", "en", null));
  assert.doesNotMatch(buildSemanticPrompt("hello", "en"), /arrived by/);
});

test("runPipeline passes the channel to the model, echoes it, and scores exactly as without it", async () => {
  let seenPrompt = "";
  const llm = async (prompt) => {
    seenPrompt = prompt;
    return { text: JSON.stringify({ signals: [], scamType: null, stage: null }), provider: "test", model: "test" };
  };
  const withChannel = await runPipeline(MSG, { channel: "sms", semantic: { llm } });
  assert.match(seenPrompt, /arrived by .*: SMS/);
  assert.equal(withChannel.analysis.channel, "sms");

  const without = await runPipeline(MSG, { semantic: { llm } });
  assert.equal("channel" in without.analysis, false);
  assert.deepEqual(withChannel.risk, without.risk);
  assert.equal(withChannel.verdict, without.verdict);
  assert.deepEqual(withChannel.signals.map((s) => s.code), without.signals.map((s) => s.code));
});

test("POST /api/analyze rejects an unknown channel with 400", async (t) => {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: MSG, channel: "telegram" }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /channel must be one of/);
});
