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

test("POST /api/check-sender looks up an existing report count without incrementing it", async (t) => {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  await originalFetch(`${base}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: "+230 5789 1234" }),
  });

  const first = await (
    await originalFetch(`${base}/check-sender`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sender: "57891234" }),
    })
  ).json();
  assert.equal(first.reportCount, 1);

  // A second lookup must not change the count - this route is read-only.
  const second = await (
    await originalFetch(`${base}/check-sender`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sender: "57891234" }),
    })
  ).json();
  assert.equal(second.reportCount, 1);
});

test("POST /api/check-sender returns 0 for a sender with no reports", async (t) => {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const res = await originalFetch(`http://127.0.0.1:${port}/api/check-sender`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: "never reported" }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.reportCount, 0);
});

test("GET /api/trends returns real aggregate counts with phone-shaped senders masked to their last 4 digits", async (t) => {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  // A sender unique to this test - other tests in this file share the same
  // in-memory DB and report their own senders, so totals must be read as
  // "at least" this test's own contribution, not an exact global count.
  const uniqueSender = "+230 5111 9876";
  await originalFetch(`${base}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: uniqueSender }),
  });
  await originalFetch(`${base}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: uniqueSender }),
  });

  const res = await originalFetch(`${base}/trends`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.totals.reportedSenders >= 1);
  assert.ok(body.totals.totalReports >= 2);
  const row = body.topSenders.find((s) => s.reportCount === 2 && s.sender === "•••• 9876");
  assert.ok(row, "the reported sender should appear in topSenders, masked to its last 4 digits");
  assert.ok(!row.sender.includes("5111"), "only the last 4 digits should be visible");
});

test("campaign API merges observed checks, preserves graph nodes, and returns 404 for unknown IDs", async (t) => {
  const app = express(); app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise(resolve => server.close(resolve)));
  t.after(() => { globalThis.fetch = originalFetch; });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let sender = "Sender-First";
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.anthropic.com")) return new Response(JSON.stringify({content:[{text:JSON.stringify({ ...MOCK_LLM_RESULT, sender:"MCB", observedSender:sender, scamType:"MCB_IMPERSONATION",stage:"OTP_REQUEST" })}]}));
    return routedFetch(url, init);
  };
  const scan = async domain => (await originalFetch(`${base}/analyze`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:`From: ${sender}. MCB asks for your OTP at ${domain}`})})).json();
  const first = await scan("mcb-one.top");
  assert.equal(first.scamDna.matchStrength,"new"); assert.equal(first.scamDna.relatedReports,0);
  sender="Sender-Second";
  const second=await scan("mcb-two.top");
  assert.equal(first.scamDna.fingerprintId,second.scamDna.fingerprintId);
  assert.equal(second.scamDna.matchStrength,"matched"); assert.equal(second.scamDna.relatedReports,1);
  const graph=await (await originalFetch(`${base}/campaign/${second.scamDna.fingerprintId}`)).json();
  assert.deepEqual(graph.senders,["Sender-First","Sender-Second"]);
  assert.deepEqual(graph.domains,["mcb-one.top","mcb-two.top"]);
  assert.equal(graph.claimedIdentity,"MCB"); assert.equal(graph.messageCount,2);
  assert.equal((await originalFetch(`${base}/campaign/nonexistent`)).status,404);
});

test("sandbox routes validate stage/type, expose metadata, terminate and survive transport failure", async (t) => {
 const app=express(); app.use("/api",router); const server=app.listen(0);
 t.after(()=>new Promise(resolve=>server.close(resolve))); t.after(()=>{globalThis.fetch=originalFetch;});
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const post=body=>originalFetch(`${base}/sandbox/next`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 const metadata=await (await originalFetch(`${base}/sandbox/playbooks`)).json(); assert.equal(metadata.playbooks.length,8);
 for(const bad of [{scamType:"invented",stage:"URGENCY",turnIndex:0},{scamType:"FAKE_PARCEL",stage:"OTP_REQUEST",turnIndex:0},{scamType:"FAKE_PARCEL",stage:"URGENCY",turnIndex:-1},{scamType:"FAKE_PARCEL",stage:"URGENCY",turnIndex:"1"}]) assert.equal((await post(bad)).status,400);
 let calls=0;
 globalThis.fetch=async(url,init)=>{if(String(url).includes("api.anthropic.com")){calls++;throw Error("offline")} return originalFetch(url,init)};
 const ended=await (await post({scamType:"MCB_IMPERSONATION",stage:"URGENCY",turnIndex:5})).json(); assert.equal(ended.ended,true); assert.equal(calls,0);
 const fallback=await (await post({scamType:"MCB_IMPERSONATION",stage:"URGENCY",turnIndex:0})).json(); assert.equal(fallback.source,"scripted"); assert.equal(fallback.simulated,true); assert.ok(fallback.line); assert.equal(calls,1);
});
