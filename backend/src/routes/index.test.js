import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Isolated in-memory DB, fast RDAP timeout, and a hosted-fallback LLM path
// (so this test never depends on a real Ollama instance being reachable) -
// all must be set before the router (and its transitive imports) load.
process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";
process.env.LLM_MODE = "fallback";
process.env.FALLBACK_PROVIDER = "anthropic";
process.env.FALLBACK_API_KEY = "test-key";

const { default: express } = await import("express");
const { router } = await import("./index.js");

const originalFetch = globalThis.fetch;

const MOCK_LLM_RESULT = {
  verdict: "scam",
  signals: [{ type: "urgency_language", description: "Act now or lose your account", severity: "high" }],
  suggestedAction: "block_sender",
  explanation: "This message pressures immediate action, a common scam tactic.",
};

// Routes every outbound call by host: the RDAP domain-age lookup is forced
// to fail, the LLM fallback call returns a canned valid analysis, and the
// test's own request to the local test server passes through untouched.
function routedFetch(url, init) {
  const href = String(url);
  if (href.includes("rdap.org")) {
    return Promise.reject(new Error("simulated RDAP failure"));
  }
  if (href.includes("api.anthropic.com")) {
    return Promise.resolve(
      new Response(JSON.stringify({ content: [{ text: JSON.stringify(MOCK_LLM_RESULT) }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  }
  return originalFetch(url, init);
}

test("POST /api/analyze returns a complete, valid response even when the domain-age lookup fails", async (t) => {
  globalThis.fetch = routedFetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const res = await originalFetch(`http://127.0.0.1:${port}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Urgent: verify your account now at mcb-secure.top/verify" }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.verdict, "scam");
  assert.ok(Array.isArray(body.signals) && body.signals.length > 0);
  assert.equal(typeof body.suggestedAction, "string");
  assert.equal(typeof body.explanation, "string");

  // checkUrls() ran and flagged the lookalike link regardless of the RDAP
  // outage, but domainAgeDays must be entirely absent - never null, never 0,
  // never an error - since the lookup was forced to fail.
  const lookalike = body.signals.find((s) => s.type === "lookalike_url");
  assert.ok(lookalike, "expected a lookalike_url signal for mcb-secure.top");
  assert.equal("domainAgeDays" in lookalike, false);
});
