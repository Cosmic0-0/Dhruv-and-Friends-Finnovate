import { test } from "node:test";
import assert from "node:assert/strict";

// shareSamples: false (Settings > "Share anonymous scam samples" off) must
// store nothing derived from the request. In-memory DB, no LLM or RDAP.
process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";
process.env.LLM_MODE = "fallback";
process.env.FALLBACK_PROVIDER = "anthropic";
process.env.FALLBACK_API_KEY = "test-key";

const { default: express } = await import("express");
const { router } = await import("./index.js");
const { db } = await import("../db/index.js");
const { attachScamDna, recordFingerprint } = await import("../services/scam-dna/index.js");

const originalFetch = globalThis.fetch;
// No outbound calls: RDAP and the LLM both fail, so the deterministic path runs.
function offlineFetch(url, init) {
  const href = String(url);
  if (href.includes("rdap.org") || href.includes("api.anthropic.com")) return Promise.reject(new Error("offline"));
  return originalFetch(url, init);
}

const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const SCAM = "MCB: Ou kont pou bloke zordi. Konfirm ou OTP lor mcb-secure.top/verify urgent";

async function serve(t) {
  globalThis.fetch = offlineFetch;
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => {
    globalThis.fetch = originalFetch;
    return new Promise((resolve) => server.close(resolve));
  });
  const { port } = server.address();
  return (path, body) =>
    originalFetch(`http://127.0.0.1:${port}/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
}

test("shareSamples must be a boolean when present", async (t) => {
  const post = await serve(t);
  for (const path of ["/analyze", "/batch-scan"]) {
    const body = path === "/analyze" ? { message: SCAM, shareSamples: "no" } : { messages: [SCAM], shareSamples: 0 };
    const res = await post(path, body);
    assert.equal(res.status, 400, path);
    assert.match((await res.json()).error, /shareSamples/);
  }
});

test("shareSamples: false analyses normally but stores no evidence event, ScamDNA row or batch history", async (t) => {
  const post = await serve(t);
  const before = { events: count("report_events"), dna: count("scam_dna"), batches: count("batch_history") };

  const res = await post("/analyze", { message: SCAM, shareSamples: false });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(["scam", "suspicious"].includes(body.verdict));

  const batch = await post("/batch-scan", { messages: [SCAM, SCAM], shareSamples: false });
  assert.equal(batch.status, 200);

  assert.equal(count("report_events"), before.events);
  assert.equal(count("scam_dna"), before.dna);
  assert.equal(count("batch_history"), before.batches);
});

test("batch history is still recorded by default", async (t) => {
  const post = await serve(t);
  const before = count("batch_history");
  const res = await post("/batch-scan", { messages: [SCAM] });
  assert.equal(res.status, 200);
  assert.equal(count("batch_history"), before + 1);
});

test("attachScamDna with record:false only reads an existing campaign", () => {
  const profile = { type: "MCB_IMPERSONATION", stage: "OTP_REQUEST", claimedIdentity: "Sharing Test Bank" };
  const fresh = attachScamDna({ verdict: "scam", signals: [], scamProfile: profile }, { record: false });
  assert.equal(fresh.scamDna, undefined);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM scam_dna WHERE claimed_identity = ?").get("Sharing Test Bank").n, 0);

  recordFingerprint({ scamType: "MCB_IMPERSONATION", claimedIdentity: "Sharing Test Bank", sender: "SHARE-TEST" });
  const known = attachScamDna({ verdict: "scam", signals: [], scamProfile: profile }, { record: false });
  assert.equal(known.scamDna.matchStrength, "matched");
  assert.equal(known.scamDna.relatedReports, 1);
  assert.equal(db.prepare("SELECT message_count AS n FROM scam_dna WHERE claimed_identity = ?").get("Sharing Test Bank").n, 1);
});

test("ocrOnly on /analyze/screenshot must be a boolean when present, checked before any image work", async (t) => {
  const post = await serve(t);
  const res = await post("/analyze/screenshot", { image: "not really an image", ocrOnly: "yes" });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "ocrOnly must be a boolean" });
});
