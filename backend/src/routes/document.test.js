import { test } from "node:test";
import assert from "node:assert/strict";

// Own file = own process = own rate-limit budget (see community.test.js).
// The hosted model is configured but unreachable: document analysis must
// still return a full deterministic verdict.
process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";
process.env.LLM_MODE = "fallback";
process.env.FALLBACK_PROVIDER = "anthropic";
process.env.FALLBACK_API_KEY = "test-key";
process.env.LLM_TIMEOUT_MS = "300";

const { default: express } = await import("express");
const { router } = await import("./index.js");
const { jsonErrorHandler } = await import("../services/http-errors/index.js");
const B = await import("../services/document-forensics/fixture-builders.js");

const originalFetch = globalThis.fetch;

async function startServer(t) {
  globalThis.fetch = (url, init) => {
    const href = String(url);
    if (href.includes("rdap.org") || href.includes("api.anthropic.com")) return Promise.reject(new Error("simulated outage"));
    return originalFetch(url, init);
  };
  const app = express();
  app.use("/api", router);
  app.use(jsonErrorHandler);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const { port } = server.address();
  const send = async (raw) => {
    const res = await originalFetch(`http://127.0.0.1:${port}/api/analyze/document`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw,
    });
    return { status: res.status, body: await res.json() };
  };
  return { post: (body) => send(JSON.stringify(body)), postRaw: send };
}

const b64 = (buf) => Buffer.from(buf).toString("base64");

test("forged signature with the LLM down -> 200, deterministic HIGH, document block with a preview", async (t) => {
  const { post } = await startServer(t);
  const { status, body } = await post({ file: b64(await B.buildForgedSignaturePdf()), fileName: "C:\\evil\\..\\name.pdf", language: "en" });
  assert.equal(status, 200);
  assert.equal(body.analysis.semantic.status, "unavailable");
  assert.equal(body.analysis.source, "document");
  assert.equal(body.analysis.detectorVersions.document, "document-1.0");
  assert.equal(body.analysis.rulesetVersion, "rs-1.5");
  assert.deepEqual(body.risk, { score: 66, level: "high", confidence: "high" });
  assert.equal(body.verdict, "scam");
  assert.equal(body.decision, "do_not_pay");
  assert.ok(body.signals.some((s) => s.code === "DOC-04" && s.metadata.variant === "transparent_overlay"));

  // The account number was redacted before analysis and in the response.
  assert.match(body.extractedText, /\[account ending 6789\]/);
  assert.doesNotMatch(JSON.stringify(body), /000123456789/);

  const d = body.document;
  assert.deepEqual(Object.keys(d).sort(), ["fileType", "metadata", "pageCount", "pagesAnalyzed", "previews", "textSource", "textTruncated"]);
  assert.equal(d.fileType, "pdf");
  assert.equal(d.textSource, "text_layer");
  assert.equal(d.textTruncated, false);
  assert.equal(d.metadata.producer, "iLovePDF");
  assert.equal(d.metadata.incrementalUpdates, 1);
  assert.equal(d.previews.length, 1);
  assert.match(d.previews[0].dataUrl, /^data:image\/png;base64,/);
  // The client-supplied file name is ignored, never echoed.
  assert.doesNotMatch(JSON.stringify(body), /evil/);
});

test("a data-URL clean native PDF -> LOW", async (t) => {
  const { post } = await startServer(t);
  const { status, body } = await post({ file: `data:application/pdf;base64,${b64(await B.buildCleanNativePdf())}` });
  assert.equal(status, 200);
  assert.equal(body.risk.level, "low");
  assert.equal(body.document.fileType, "pdf");
  assert.deepEqual(body.document.previews, []);
  assert.ok(body.signals.every((s) => !s.code.startsWith("DOC-")));
});

test("a DOCX with a macro -> 200, ELEVATED, no page counts pretended", async (t) => {
  const { post } = await startServer(t);
  const { status, body } = await post({ file: b64(B.buildMacroDocx()) });
  assert.equal(status, 200);
  assert.equal(body.document.fileType, "docx");
  assert.equal(body.document.pagesAnalyzed, null);
  assert.equal(body.document.metadata.incrementalUpdates, null);
  assert.equal(body.risk.level, "elevated");
  assert.ok(body.actions.some((a) => a.id === "doc_dont_enable_content"));
});

test("long document text is truncated at the cap and flagged, not rejected", async (t) => {
  const { post } = await startServer(t);
  const lines = Array.from({ length: 200 }, (_, i) => `Line ${i}: this fictional letter keeps going to exceed one analysis worth of text.`);
  const { status, body } = await post({ file: b64(B.buildDocx({ lines })) });
  assert.equal(status, 200);
  assert.equal(body.document.textTruncated, true);
  assert.ok(body.extractedText.length <= 5000 && body.extractedText.length > 4000);
  assert.match(body.extractedText, /\.$/, "cut at a line boundary");
});

test("input errors: missing, undecodable, wrong type, encrypted", async (t) => {
  const { post } = await startServer(t);
  assert.deepEqual(await post({}), { status: 400, body: { error: "document is required and must be a base64-encoded string" } });
  assert.deepEqual(await post({ file: "!!!!" }), { status: 400, body: { error: "document could not be decoded as base64" } });
  // A text file renamed to .pdf: the name is irrelevant, the bytes decide.
  const txt = await post({ file: b64(Buffer.from("Hello, this is a plain text file.")), fileName: "statement.pdf" });
  assert.equal(txt.status, 400);
  assert.match(txt.body.error, /^document must be a PDF or Word/);
  assert.deepEqual(await post({ file: b64(await B.buildEncryptedPdf()) }), { status: 400, body: { error: "document is password-protected" } });
});

test("size limits: over 10MB decoded -> 400; a body over the JSON limit -> generic 413", async (t) => {
  const { post, postRaw } = await startServer(t);
  const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x20);
  big.write("%PDF-1.7\n");
  assert.deepEqual(await post({ file: b64(big) }), { status: 400, body: { error: "document exceeds maximum size of 10MB" } });
  const huge = `{"file":"${"A".repeat(15 * 1024 * 1024)}"}`;
  assert.deepEqual(await postRaw(huge), { status: 413, body: { error: "request body is too large" } });
});
