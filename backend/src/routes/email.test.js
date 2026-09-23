import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Own file = own process = own rate-limit budget (see community.test.js).
// The model endpoint always fails here, so every result is the
// deterministic assessment - the demo-reliability path.
process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";
process.env.LLM_MODE = "fallback";
process.env.FALLBACK_PROVIDER = "anthropic";
process.env.FALLBACK_API_KEY = "test-key";
process.env.LLM_TIMEOUT_MS = "300";

const { default: express } = await import("express");
const { router } = await import("./index.js");

const originalFetch = globalThis.fetch;
const FIXTURES = JSON.parse(readFileSync(new URL("../../fixtures/email-demo.json", import.meta.url), "utf8")).fixtures;
const fixture = (id) => FIXTURES.find((f) => f.id === id).request;

async function startServer(t) {
  globalThis.fetch = (url, init) => {
    const href = String(url);
    if (href.includes("rdap.org") || href.includes("api.anthropic.com")) return Promise.reject(new Error("simulated outage"));
    return originalFetch(url, init);
  };
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const { port } = server.address();
  return async (body) => {
    const res = await originalFetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
}

test("POST /api/analyze with emailContext: same response shape, email findings in signals[]", async (t) => {
  const post = await startServer(t);
  const { status, body } = await post(fixture("supplier-bank-change-fraud"));
  assert.equal(status, 200);
  for (const key of ["verdict", "riskScore", "risk", "decision", "signals", "trace", "actions", "suggestedAction", "explanation", "riskCategories", "analysis"]) {
    assert.ok(key in body, `missing ${key}`);
  }
  assert.equal(body.verdict, "scam");
  assert.equal(body.analysis.source, "email");
  assert.equal(body.analysis.semantic.status, "unavailable", "LLM down, deterministic result still returned");
  assert.ok(body.signals.some((s) => s.code === "EMAIL-06" && s.scored));
  assert.equal(body.analysis.email.status, "analysed");
  assert.ok(body.analysis.email.availableEvidence.includes("authentication"));
  assert.equal(body.riskCategories.payment_risk, "HIGH");
  assert.equal(JSON.stringify(body).includes("messageId"), false);
});

test("POST /api/analyze without emailContext is unchanged (no analysis.email, source pasted_text)", async (t) => {
  const post = await startServer(t);
  const { status, body } = await post({ message: "Your parcel is waiting. Pay the Rs 150 customs fee at post-mu-track.top" });
  assert.equal(status, 200);
  assert.equal(body.analysis.source, "pasted_text");
  assert.equal(body.analysis.email, undefined);
});

test("invalid emailContext is a 400 with a field-specific message", async (t) => {
  const post = await startServer(t);
  const cases = [
    [{ message: "x", emailContext: "yes" }, /emailContext must be an object/],
    [{ message: "x", emailContext: { from: { address: "not-an-email" } } }, /emailContext.from.address/],
    [{ message: "x", emailContext: { replyTo: [{ address: "a b@c.d" }] } }, /replyTo\[0\]/],
    [{ message: "x", emailContext: { attachments: "a.pdf" } }, /attachments must be an array/],
    [{ message: "x", paymentContext: { accountNumber: "12" } }, /accountNumber/],
  ];
  for (const [req, re] of cases) {
    const { status, body } = await post(req);
    assert.equal(status, 400, JSON.stringify(req));
    assert.match(body.error, re);
  }
});

test("the email body is still required even when emailContext is present", async (t) => {
  const post = await startServer(t);
  const { status } = await post({ emailContext: { from: "a@b.example" } });
  assert.equal(status, 400);
});
