import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeDocumentForensics, checkDocumentForensicsHealth } from "./index.js";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("analyzeDocumentForensics maps the Python service's snake_case report to the API's camelCase contract", async () => {
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/analyze$/);
    assert.equal(init.method, "POST");
    return new Response(
      JSON.stringify({
        document_id: "doc-1",
        mime_type: "image/jpeg",
        confidence: "medium",
        summary: "1 tampering indicator(s) found",
        indicators: [
          { check: "error_level_analysis", title: "Localized error-level anomaly", description: "d", confidence: "medium", evidence: "e" },
        ],
        signature: { present: true, note: "internal consistency only", indicators: [] },
        checks_run: ["metadata_pdf", "error_level_analysis"],
        checks_skipped: [{ check: "trufor", reason: "resolved_by_cheaper_checks" }],
        scanned_at: "2026-01-01T00:00:00Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await analyzeDocumentForensics({ buffer: Buffer.from("fake"), mimeType: "image/jpeg", documentId: "doc-1" });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.report, {
    documentId: "doc-1",
    mimeType: "image/jpeg",
    confidence: "medium",
    summary: "1 tampering indicator(s) found",
    indicators: [
      { check: "error_level_analysis", title: "Localized error-level anomaly", description: "d", confidence: "medium", evidence: "e" },
    ],
    signature: { present: true, note: "internal consistency only", indicators: [] },
    checksRun: ["metadata_pdf", "error_level_analysis"],
    checksSkipped: [{ check: "trufor", reason: "resolved_by_cheaper_checks" }],
    scannedAt: "2026-01-01T00:00:00Z",
  });
});

test("analyzeDocumentForensics degrades to unavailable, never throws, when the service is unreachable", async () => {
  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8081");
  };

  const result = await analyzeDocumentForensics({ buffer: Buffer.from("fake"), mimeType: "image/jpeg" });
  assert.equal(result.status, "unavailable");
  assert.match(result.reason, /ECONNREFUSED/);
});

test("analyzeDocumentForensics degrades to unavailable on a non-2xx response", async () => {
  globalThis.fetch = async () => new Response("bad request", { status: 400 });

  const result = await analyzeDocumentForensics({ buffer: Buffer.from("fake"), mimeType: "image/png" });
  assert.equal(result.status, "unavailable");
  assert.match(result.reason, /400/);
});

test("analyzeDocumentForensics degrades to unavailable on timeout, without hanging the caller", async () => {
  globalThis.fetch = (url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    });

  const result = await analyzeDocumentForensics({ buffer: Buffer.from("fake"), mimeType: "image/jpeg", timeoutMs: 10 });
  assert.equal(result.status, "unavailable");
});

test("analyzeDocumentForensics never sends a document without a mimeType field the service can sniff-validate against", async () => {
  let capturedForm;
  globalThis.fetch = async (url, init) => {
    capturedForm = init.body;
    return new Response(JSON.stringify({ mime_type: "application/pdf", summary: "no tampering indicators found" }), { status: 200 });
  };

  await analyzeDocumentForensics({ buffer: Buffer.from("fake-pdf-bytes"), mimeType: "application/pdf" });
  assert.ok(capturedForm instanceof FormData);
  assert.equal(capturedForm.get("mime_type"), "application/pdf");
});

test("checkDocumentForensicsHealth returns true only for a reachable, healthy service", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  assert.equal(await checkDocumentForensicsHealth(), true);

  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  assert.equal(await checkDocumentForensicsHealth(), false);
});
