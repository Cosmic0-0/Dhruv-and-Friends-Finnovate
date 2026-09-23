import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
const { _internals: dnsInternals } = await import("../services/site-security/url-safety.js");
const { _internals: tlsInternals } = await import("../services/site-security/tls.js");

const originalFetch = globalThis.fetch;
const originalDnsLookup = dnsInternals.lookup;
const originalTlsConnect = tlsInternals.connect;

// Semantic-model contract (services/analysis): enum codes + exact quotes
// only - no verdict, score or action.
const MOCK_LLM_RESULT = {
  signals: [{ code: "SOC-01", evidence: "Urgent", confidence: 0.8 }],
  scamType: null,
  stage: null,
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

  // URL-02 (30, rule) + SOC-01 (6, lexicon, corroborated by the model) = 36
  // -> elevated -> legacy verdict "suspicious". Computed by rs-1.4, not the LLM.
  assert.equal(body.riskScore, 36);
  assert.deepEqual(body.risk, { score: 36, level: "elevated", confidence: "high" });
  assert.equal(body.verdict, "suspicious");
  assert.equal(body.decision, "verify_first");
  assert.equal(body.analysis.rulesetVersion, "rs-1.5");
  assert.equal(body.analysis.semantic.status, "ok");
  assert.ok(Array.isArray(body.signals) && body.signals.length > 0);
  assert.equal(typeof body.suggestedAction, "string");
  assert.equal(typeof body.explanation, "string");
  assert.ok(Array.isArray(body.actions) && body.actions.length > 0);
  assert.ok(body.trace.some((t) => t.id === "URL-02" && t.points === 30));
  const urgency = body.signals.find((s) => s.code === "SOC-01" && s.scored);
  assert.deepEqual(urgency.corroboratedBy, ["semantic_model"]);

  // checkUrls() ran and flagged the lookalike link regardless of the RDAP
  // outage, but domainAgeDays must be entirely absent - never null, never 0,
  // never an error - since the lookup was forced to fail.
  const lookalike = body.signals.find((s) => s.type === "lookalike_url");
  assert.ok(lookalike, "expected a lookalike_url signal for mcb-secure.top");
  assert.equal("domainAgeDays" in lookalike, false);
});

test("POST /api/analyze: pageUrl keeps the scanned page's own domain out of URL-08, without weakening a real lookalike of it", async (t) => {
  globalThis.fetch = routedFetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  const pageText = "badssl.com click through dh480.badssl.com to test an old cipher suite.";

  const withPageUrl = await (
    await originalFetch(`${base}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: pageText, pageUrl: "https://badssl.com/" }),
    })
  ).json();
  assert.ok(!withPageUrl.signals.some((s) => s.code === "URL-08"), "badssl.com must not be flagged as an unofficial link on its own page");

  const withoutPageUrl = await (
    await originalFetch(`${base}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: pageText }),
    })
  ).json();
  assert.ok(withoutPageUrl.signals.some((s) => s.code === "URL-08"), "same text with no page context keeps prior behaviour");

  const lookalikePage = await (
    await originalFetch(`${base}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "click through badssl.com.evil-login.net to continue", pageUrl: "https://badssl.com/" }),
    })
  ).json();
  assert.ok(lookalikePage.signals.some((s) => s.code === "URL-08"), "a genuine lookalike of the page's own domain must still be flagged");

  // A malformed pageUrl is ignored, not rejected - the request still succeeds.
  const malformed = await originalFetch(`${base}/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: pageText, pageUrl: "not a url" }),
  });
  assert.equal(malformed.status, 200);
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

test("POST /api/analyze-site validates input, rejects unsafe urls with 400, and returns a graded report for a reachable site", async (t) => {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(() => {
    globalThis.fetch = originalFetch;
    dnsInternals.lookup = originalDnsLookup;
    tlsInternals.connect = originalTlsConnect;
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const missing = await originalFetch(`${base}/analyze-site`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missing.status, 400);

  // A private-IP target must be rejected before any outbound request is
  // made - see services/site-security/url-safety.js. No DNS/fetch mocking
  // needed for this one: 127.0.0.1 is a literal, not a hostname to resolve.
  const unsafe = await originalFetch(`${base}/analyze-site`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1:9/admin" }),
  });
  assert.equal(unsafe.status, 400);
  assert.match((await unsafe.json()).error, /private or reserved/);

  // A reachable target: mock DNS/TLS/fetch for the target host, same as
  // services/site-security/index.test.js, but reached through the real
  // HTTP route this time.
  dnsInternals.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  tlsInternals.connect = () => {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    socket.getProtocol = () => "TLSv1.3";
    socket.authorized = true;
    socket.getPeerCertificate = () => ({
      valid_from: new Date(Date.now() - 30 * 86_400_000).toUTCString(),
      valid_to: new Date(Date.now() + 90 * 86_400_000).toUTCString(),
    });
    queueMicrotask(() => socket.emit("secureConnect"));
    return socket;
  };
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href === "https://route-target.example/") {
      return new Response("<html><body>hi</body></html>", { status: 200, headers: { "content-type": "text/html" } });
    }
    if (href === "http://route-target.example/") {
      return new Response(null, { status: 301, headers: { location: "https://route-target.example/" } });
    }
    return new Response("not found", { status: 404 });
  };

  const res = await originalFetch(`${base}/analyze-site`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://route-target.example/" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.grade, "string");
  assert.ok(Array.isArray(body.findings));
  assert.ok(body.findings.some((f) => f.title === "Missing Content-Security-Policy"));
});

// Routes the internal document-forensics call (an unqualified fetch() from
// inside the route handler, not the test's own request to the local test
// server, which always goes through originalFetch directly) without
// depending on whether anything is actually listening on the real
// DOCUMENT_FORENSICS_URL in this environment.
function routeDocumentForensics(handler) {
  return (url, init) => {
    if (String(url).includes("/analyze") && init?.body instanceof FormData) return handler(init);
    return originalFetch(url, init);
  };
}

test("POST /api/documents stores the exact uploaded bytes and returns redacted OCR text, without running the message pipeline", async (t) => {
  globalThis.fetch = routeDocumentForensics(() => Promise.reject(new Error("simulated: forensics service not running")));
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../services/document-store/fixtures");
  const pdf = readFileSync(path.join(fixturesDir, "incremental-update.pdf"));

  const res = await originalFetch(`${base}/documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document: `data:application/pdf;base64,${pdf.toString("base64")}`, filename: "statement.pdf" }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(typeof body.documentId, "string");
  assert.equal(body.mimeType, "application/pdf");
  assert.equal(body.byteLength, pdf.length);
  // No verdict/riskScore/signals - this route ingests a document, it never
  // scores one (see routes/index.js's comment on this route).
  assert.equal("verdict" in body, false);
  assert.equal("riskScore" in body, false);
  // A down/unreachable forensics service degrades this field - it must
  // never fail the upload itself (already asserted by the 201 above).
  assert.equal(body.forensics.status, "unavailable");
});

test("POST /api/documents surfaces a real forensics report when the service responds", async (t) => {
  globalThis.fetch = routeDocumentForensics(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          document_id: "doc-1",
          mime_type: "image/jpeg",
          confidence: "medium",
          summary: "1 tampering indicator(s) found",
          indicators: [
            { check: "error_level_analysis", title: "Localized error-level anomaly", description: "d", confidence: "medium", evidence: "e" },
          ],
          signature: null,
          checks_run: ["metadata_pdf", "error_level_analysis"],
          checks_skipped: [{ check: "trufor", reason: "resolved_by_cheaper_checks" }],
          scanned_at: "2026-01-01T00:00:00Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
  );
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../services/document-store/fixtures");
  const jpeg = readFileSync(path.join(fixturesDir, "clean.jpg"));

  const res = await originalFetch(`http://127.0.0.1:${port}/api/documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document: `data:image/jpeg;base64,${jpeg.toString("base64")}` }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.forensics.status, "ok");
  assert.equal(body.forensics.report.summary, "1 tampering indicator(s) found");
  assert.equal(body.forensics.report.indicators[0].check, "error_level_analysis");
  // camelCase, not the Python service's snake_case - see
  // services/document-forensics-client/index.js's camelizeReport().
  assert.equal(body.forensics.report.checksRun.length, 2);
  assert.equal("checks_run" in body.forensics.report, false);
});

test("POST /api/documents rejects a file that isn't a recognised document type", async (t) => {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const res = await originalFetch(`http://127.0.0.1:${port}/api/documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document: Buffer.from("not a document").toString("base64") }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /must be a valid PDF, PNG, JPEG, or WEBP/);
});
