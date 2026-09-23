import { test } from "node:test";
import assert from "node:assert/strict";

// Same isolation as routes/index.test.js: in-memory DB, fast RDAP timeout,
// canned hosted-fallback LLM. Kept in its own file because node --test runs
// each file in a fresh process - so this file gets its own /api/report rate
// limiter budget instead of sharing index.test.js's 5/hour.
process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";
process.env.LLM_MODE = "fallback";
process.env.FALLBACK_PROVIDER = "anthropic";
process.env.FALLBACK_API_KEY = "test-key";
process.env.REPORTER_HASH_SECRET = "test-secret";

const { default: express } = await import("express");
const { router } = await import("./index.js");
const { db } = await import("../db/index.js");
const { recordUserReport } = await import("../services/community-signals/index.js");

const originalFetch = globalThis.fetch;
const SCAM = "Urgent: your MCB account is suspended. Verify now at mcb-secure.top/verify or lose access within 24h.";

function mockLlm(llmResult) {
  globalThis.fetch = (url, init) => {
    const href = String(url);
    if (href.includes("rdap.org")) return Promise.reject(new Error("simulated RDAP failure"));
    if (href.includes("api.anthropic.com")) {
      return Promise.resolve(
        new Response(JSON.stringify({ content: [{ text: JSON.stringify(llmResult) }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    }
    return originalFetch(url, init);
  };
}

async function startServer(t) {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const { port } = server.address();
  return (path, body) =>
    originalFetch(`http://127.0.0.1:${port}/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
}

test.beforeEach(() => {
  db.exec("DELETE FROM report_events; DELETE FROM risk_audit_log; DELETE FROM reports;");
});

test("POST /api/analyze attaches an audited community_wave signal once 5 distinct people reported the pattern", async (t) => {
  for (let i = 0; i < 5; i++) recordUserReport({ sender: "57891234", message: SCAM, ip: `10.0.0.${i}` });
  mockLlm({
    verdict: "suspicious",
    riskScore: 55,
    signals: [{ type: "urgency_language", description: "Pressure to act", severity: "medium" }],
    suggestedAction: "verify_official_channel",
    explanation: "Looks pressuring.",
  });
  const post = await startServer(t);

  const res = await post("/analyze", { message: SCAM });
  assert.equal(res.status, 200);
  const body = await res.json();

  const community = body.signals.find((s) => s.source === "community_reports");
  assert.equal(community.type, "community_wave");
  assert.equal(community.communityEvidence.distinctReporters, 5);
  assert.equal(body.riskScore, 55);
  assert.equal(body.adjustedRiskScore, 75);
  // lookalike_url (deterministic, high) + CW-2 wave -> suspicious escalates to scam
  assert.equal(body.verdict, "scam");
  assert.equal(body.riskAdjustments[0].verdictFrom, "suspicious");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM risk_audit_log").get().n, 1);
  // riskCategories describe message content only - computed before community evidence
  assert.ok(body.riskCategories);
});

test("POST /api/report records a privacy-minimised evidence event and keeps its response shape", async (t) => {
  const post = await startServer(t);
  const res = await post("/report", { sender: "+230 5789 1234", message: SCAM });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(await res.json()).sort(), ["recorded", "reportCount", "sender"]);

  const row = db.prepare("SELECT * FROM report_events").get();
  assert.equal(row.origin, "user_report");
  assert.equal(row.sender_key, "23057891234");
  assert.ok(!JSON.stringify(row).includes("suspended"), "raw message text must not be stored");
  assert.ok(!JSON.stringify(row).includes("127.0.0.1"), "raw IP must not be stored");
});

test("POST /api/report with an oversized message still succeeds, without fingerprinting it", async (t) => {
  const post = await startServer(t);
  const res = await post("/report", { sender: "57891234", message: "x".repeat(6000) });
  assert.equal(res.status, 200);
  assert.equal(db.prepare("SELECT token_count FROM report_events").get().token_count, 0);
});

test("senderReports is not attached for a redacted placeholder or an official identity", async (t) => {
  const post = await startServer(t);
  for (const sender of ["[phone 1]", "MCB"]) {
    mockLlm({
      verdict: "scam",
      signals: [],
      suggestedAction: "block_sender",
      explanation: "Scam.",
      sender,
    });
    const body = await (await post("/analyze", { message: "Call [phone 1] now to unlock your account" })).json();
    assert.equal(body.sender, sender);
    assert.equal(body.senderReports, undefined, `no senderReports for ${sender}`);
  }
});
