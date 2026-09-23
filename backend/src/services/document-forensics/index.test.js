// analyzeDocument() end to end: real worker thread, previews, OCR fallback,
// isolation limits, and the deterministic verdict each demo fixture gets
// from rs-1.4 with the semantic model switched off.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";

const { analyzeDocument, MAX_CONCURRENT_DOCUMENTS } = await import("./index.js");
const B = await import("./fixture-builders.js");
const { runPipeline } = await import("../pipeline/index.js");
const { redact } = await import("../redact/index.js");

const HANGING_WORKER = new URL("data:text/javascript,setInterval(() => {}, 1000)");
const noOcr = async () => {
  throw new Error("OCR must not run for this file");
};
const tags = (signals) => signals.map((s) => `${s.code}${s.metadata?.variant ? `:${s.metadata.variant}` : ""}`).sort();

async function verdict(doc) {
  return runPipeline(redact(doc.text).redacted.slice(0, 5000), { source: "document", extraSignals: doc.signals, semantic: { enabled: false } });
}

const EXPECTED = {
  "legit-scan.pdf": { level: "low", signals: [] },
  "forged-signature.pdf": { level: "high", signals: ["DOC-01", "DOC-02:incremental_update", "DOC-04:transparent_overlay"] },
  "edited-amount.pdf": { level: "elevated", signals: ["DOC-05"] },
  "clean-native.pdf": { level: "low", signals: [] },
  "macro.docx": { level: "elevated", signals: ["DOC-07:macro"] },
  "external-template.docx": { level: "elevated", signals: ["DOC-07:external_template"] },
  "clean.docx": { level: "low", signals: [] },
};

test("every demo fixture gets the documented findings and verdict", async () => {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const doc = await analyzeDocument(await B.DEMO_FIXTURES[name](), { ocr: noOcr });
    assert.deepEqual(tags(doc.signals), expected.signals, name);
    assert.equal(doc.textSource, "text_layer", name);
    const r = await verdict(doc);
    assert.equal(r.risk.level, expected.level, `${name}: ${JSON.stringify(r.trace)}`);
  }
});

test("the forged signature: HIGH with DX-1, a preview, and document-specific advice", async () => {
  const doc = await analyzeDocument(await B.buildForgedSignaturePdf(), { ocr: noOcr });
  assert.equal(doc.fileType, "pdf");
  assert.equal(doc.pageCount, 1);
  assert.equal(doc.pagesAnalyzed, 1);
  assert.deepEqual(doc.metadata, {
    producer: "iLovePDF",
    creator: "iLovePDF",
    created: "2026-09-01T09:30:00.000Z",
    modified: "2026-09-15T14:12:00.000Z",
    incrementalUpdates: 1,
    signed: false,
  });
  assert.equal(doc.previews.length, 1);
  const [p] = doc.previews;
  assert.equal(p.signalCode, "DOC-04");
  assert.match(p.dataUrl, /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
  assert.ok(p.dataUrl.length < 20_000);
  assert.deepEqual({ w: p.widthPx, dpi: p.effectiveDpi, bg: p.backgroundDpi, alpha: p.hasAlpha, hard: p.hardEdgeRatio }, { w: 116, dpi: 48, bg: 150, alpha: true, hard: 1 });
  const overlay = doc.signals.find((s) => s.code === "DOC-04");
  assert.equal(overlay.metadata.previewIndex, 0);
  assert.equal(overlay.metadata.previewKey, undefined);

  const r = await verdict(doc);
  assert.deepEqual(r.trace.map((t) => t.id).sort(), ["DOC-01", "DOC-02", "DOC-04", "DX-1", "PAY-01"]);
  assert.equal(r.risk.score, 66);
  assert.equal(r.decision, "do_not_pay");
  assert.ok(r.actions.some((a) => a.id === "doc_verify_with_issuer"));
  assert.equal(r.riskCategories.technical_risk, "HIGH");
});

test("a DOCX with a floating transparent signature gets the weak DOCX variant and a preview", async () => {
  const doc = await analyzeDocument(B.buildDocx({ anchoredPng: await B.renderPastedSignature() }), { ocr: noOcr });
  assert.deepEqual(tags(doc.signals), ["DOC-04:docx_transparent_image"]);
  assert.equal(doc.previews.length, 1);
  assert.equal(doc.previews[0].backgroundDpi, null);
  assert.equal((await verdict(doc)).risk.level, "low");
});

test("a scan without a text layer is read by OCR, and the OCR quality reaches the engine", async () => {
  let calls = 0;
  const doc = await analyzeDocument(await B.buildScanOnlyPdf(), {
    ocr: async (png) => {
      calls++;
      assert.ok(Buffer.isBuffer(png) && png.length > 0);
      return "Northbridge Savings Bank statement";
    },
  });
  assert.equal(calls, 1);
  assert.equal(doc.textSource, "ocr");
  assert.equal(doc.ocrQuality, "low", "very little text came back");
  assert.match(doc.text, /Northbridge/);
});

test("OCR failure never fails the analysis: structural findings stand, no text", async () => {
  const doc = await analyzeDocument(await B.buildScanOnlyPdf(), { ocr: async () => Promise.reject(new Error("tesseract down")) });
  assert.equal(doc.textSource, "none");
  assert.equal(doc.text, "");
});

test("isolation: a worker that never answers is terminated at the timeout", async () => {
  const started = Date.now();
  await assert.rejects(analyzeDocument(await B.buildCleanNativePdf(), { workerUrl: HANGING_WORKER, timeoutMs: 300 }), { name: "DocumentError", code: "unreadable" });
  assert.ok(Date.now() - started < 5000);
});

test("isolation: at most MAX_CONCURRENT_DOCUMENTS analyses at once, extra ones are refused as busy", async () => {
  const bytes = await B.buildCleanNativePdf();
  const running = Array.from({ length: MAX_CONCURRENT_DOCUMENTS }, () => analyzeDocument(bytes, { workerUrl: HANGING_WORKER, timeoutMs: 800 }));
  await assert.rejects(analyzeDocument(bytes), { code: "busy" });
  const settled = await Promise.allSettled(running);
  assert.ok(settled.every((s) => s.status === "rejected" && s.reason.code === "unreadable"));
  // The slots are released afterwards.
  assert.equal((await analyzeDocument(bytes, { ocr: noOcr })).fileType, "pdf");
});

test("worker errors surface as public codes, not parser messages", async () => {
  await assert.rejects(analyzeDocument(await B.buildEncryptedPdf()), { code: "encrypted" });
  await assert.rejects(analyzeDocument(Buffer.from("PK\u0003\u0004 not a zip at all")), { code: "unreadable" });
  await assert.rejects(analyzeDocument(Buffer.from("plain text")), { code: "unsupported" });
});
