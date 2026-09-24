process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "1";
process.env.ORG_ANALYST_TOKEN = "test-analyst-token";

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { router } from "./index.js";

async function serverFor(t) {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return async (path, init = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, init);
    return { status: res.status, body: await res.json() };
  };
}

test("organisation campaign and analyst-outcome endpoints use the configured organisation", async (t) => {
  const call = await serverFor(t);
  const analyzed = await call("/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Urgent: transfer Rs 5000 today and bypass the normal approval.",
      emailContext: {
        messageId: "route-org-1",
        recipient: "employee@demo-company.example",
        from: { name: "Jane Smith", address: "jane.smith.finance@gmail.com" },
      },
    }),
  });
  assert.equal(analyzed.status, 200);
  const observationId = analyzed.body.analysis.organisation.observationId;

  const outcome = await call("/org/outcomes", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-analyst-token" },
    body: JSON.stringify({ observationId, label: "confirmed_bec" }),
  });
  assert.equal(outcome.status, 200);
  assert.equal(outcome.body.consensus, "confirmed_bec");

  const campaigns = await call("/org/campaigns");
  assert.equal(campaigns.status, 200);
  assert.equal(campaigns.body.organisationId, "demo-company");
  assert.ok(Array.isArray(campaigns.body.campaigns));
});

// These three share the 5/hour report limiter with the test above (4 calls).
test("POST /api/org/outcomes rejects a missing or wrong analyst token with 401", async (t) => {
  const call = await serverFor(t);
  const body = JSON.stringify({ observationId: "a".repeat(64), label: "false_positive" });
  const missing = await call("/org/outcomes", { method: "POST", headers: { "content-type": "application/json" }, body });
  assert.equal(missing.status, 401);
  assert.deepEqual(missing.body, { error: "analyst token required" });
  const wrong = await call("/org/outcomes", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer not-the-token" },
    body,
  });
  assert.equal(wrong.status, 401);
});

test("POST /api/org/outcomes is disabled (403) when ORG_ANALYST_TOKEN is not configured", async (t) => {
  const saved = process.env.ORG_ANALYST_TOKEN;
  delete process.env.ORG_ANALYST_TOKEN;
  t.after(() => { process.env.ORG_ANALYST_TOKEN = saved; });
  const call = await serverFor(t);
  const res = await call("/org/outcomes", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-analyst-token" },
    body: JSON.stringify({ observationId: "a".repeat(64), label: "false_positive" }),
  });
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: "analyst outcomes are not enabled on this server" });
});
