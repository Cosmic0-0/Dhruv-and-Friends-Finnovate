import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";

// POST /api/analyze/document's storage, file-type and encryption rules from
// docs/API-CONTRACT.md. Own file = own process = own rate-limit budget (see
// community.test.js). The hosted model is configured but unreachable.
process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";
process.env.LLM_MODE = "fallback";
process.env.FALLBACK_PROVIDER = "anthropic";
process.env.FALLBACK_API_KEY = "test-key";
process.env.LLM_TIMEOUT_MS = "300";

const { default: express } = await import("express");
const { router } = await import("./index.js");
const { jsonErrorHandler } = await import("../services/http-errors/index.js");
const { db } = await import("../db/index.js");
const { getStoredDocument } = await import("../services/document-store/index.js");
const { CFB_MAGIC } = await import("../services/document-forensics/sniff.js");
const B = await import("../services/document-forensics/fixture-builders.js");
const F = await import("../services/document-forensics/spec-fixtures.js");

const originalFetch = globalThis.fetch;
const UNSUPPORTED = "document must be a PDF or Word (.docx) file (checked by content, not the file name)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  return async (body) => {
    const res = await originalFetch(`http://127.0.0.1:${port}/api/analyze/document`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
}

const b64 = (buf) => Buffer.from(buf).toString("base64");
const storedCount = () => db.prepare("SELECT COUNT(*) AS n FROM documents").get().n;

test("sharing on (the default): a PDF's exact uploaded bytes are stored and documentId refers to them", async (t) => {
  const post = await startServer(t);
  const pdf = await B.buildCleanNativePdf();
  const { status, body } = await post({ file: b64(pdf) });
  assert.equal(status, 200);
  assert.match(body.documentId, UUID);
  const stored = getStoredDocument(body.documentId);
  assert.ok(stored, "documentId points at a stored row");
  assert.equal(stored.mimeType, "application/pdf");
  assert.ok(Buffer.from(stored.bytes).equals(pdf), "the stored bytes are the uploaded bytes, unmodified");
});

test("a DOCX is analysed but not stored: documentId is null", async (t) => {
  const post = await startServer(t);
  const before = storedCount();
  const { status, body } = await post({ file: b64(B.buildCleanDocx()) });
  assert.equal(status, 200);
  assert.equal(body.document.fileType, "docx");
  assert.equal(body.documentId, null);
  assert.equal(storedCount(), before);
});

test("shareSamples: false stores nothing, and a non-boolean shareSamples is rejected", async (t) => {
  const post = await startServer(t);
  const before = storedCount();
  const { status, body } = await post({ file: b64(await B.buildCleanNativePdf()), shareSamples: false });
  assert.equal(status, 200);
  assert.equal(body.documentId, null);
  assert.equal(storedCount(), before, "no document row was written");
  assert.deepEqual(await post({ file: b64(await B.buildCleanNativePdf()), shareSamples: "no" }), { status: 400, body: { error: "shareSamples must be a boolean" } });
});

test("the type comes from the bytes, never the file name", async (t) => {
  const post = await startServer(t);
  // A real Word file called .pdf is analysed as Word.
  const renamed = await post({ file: b64(B.buildCleanDocx()), fileName: "statement.pdf" });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.document.fileType, "docx");
  // A spreadsheet is a ZIP too, but not a Word document.
  const xlsx = zipSync({ "[Content_Types].xml": strToU8('<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>') });
  assert.deepEqual(await post({ file: b64(xlsx), fileName: "statement.docx" }), { status: 400, body: { error: UNSUPPORTED } });
  // A legacy .doc (compound file without an encrypted package) is not supported.
  const legacyDoc = new Uint8Array([...CFB_MAGIC, ...new Uint8Array(504)]);
  assert.deepEqual(await post({ file: b64(legacyDoc), fileName: "letter.doc" }), { status: 400, body: { error: UNSUPPORTED } });
});

test("password-protected Word files are reported as password-protected", async (t) => {
  const post = await startServer(t);
  const encryptedDocx = new Uint8Array([...CFB_MAGIC, ...new Uint8Array(120), ...Buffer.from("EncryptedPackage", "utf16le"), ...new Uint8Array(120)]);
  assert.deepEqual(await post({ file: b64(encryptedDocx) }), { status: 400, body: { error: "document is password-protected" } });
});

test("a PDF with only an owner password (permissions only) opens without one and is analysed, not refused", async (t) => {
  const post = await startServer(t);
  const lines = ["Northbridge Savings Bank (fictional) - SAMPLE e-statement", "Account holder: A. Sample", "Closing balance MUR 36,313.85"];
  for (const objectStreams of [false, true]) {
    const { status, body } = await post({ file: b64(F.buildPermissionsOnlyPdf({ lines, objectStreams })) });
    assert.equal(status, 200, `objectStreams=${objectStreams}: ${JSON.stringify(body)}`);
    assert.equal(body.document.fileType, "pdf");
    assert.match(body.extractedText, /Closing balance MUR 36,313\.85/);
    assert.equal(body.risk.level, "low");
  }
});
