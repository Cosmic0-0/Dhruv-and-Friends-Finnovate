import { test } from "node:test";
import assert from "node:assert/strict";
import { documentFindings, formatFileSize, precheckDocument, previewFacts, withoutPreviews } from "./document.ts";
import type { DocumentPreview, Signal } from "./types.ts";

const MB = 1024 * 1024;

test("precheck: size and an obvious type, before anything is uploaded", () => {
  assert.equal(precheckDocument({ name: "statement.pdf", size: 2 * MB, type: "" }, 10 * MB), "ok");
  assert.equal(precheckDocument({ name: "Letter.DOCX", size: 10, type: "" }, 10 * MB), "ok");
  assert.equal(precheckDocument({ name: "scan", size: 10, type: "application/pdf" }, 10 * MB), "ok");
  assert.equal(precheckDocument({ name: "big.pdf", size: 10 * MB + 1, type: "application/pdf" }, 10 * MB), "too_large");
  assert.equal(precheckDocument({ name: "photo.jpg", size: 10, type: "image/jpeg" }, 10 * MB), "unsupported");
  assert.equal(precheckDocument({ name: "empty.pdf", size: 0, type: "application/pdf" }, 10 * MB), "empty");
  // A renamed text file passes here on purpose: the server decides by content.
  assert.equal(precheckDocument({ name: "notes.txt.pdf", size: 20, type: "text/plain" }, 10 * MB), "ok");
});

test("formatFileSize", () => {
  assert.equal(formatFileSize(840 * 1024), "840 KB");
  assert.equal(formatFileSize(300), "1 KB");
  assert.equal(formatFileSize(2.45 * MB), "2.5 MB");
  assert.equal(formatFileSize(2.45 * MB, "fr"), "2,5 MB");
});

const sig = (code: string, metadata: Record<string, unknown> = {}, extra: Partial<Signal> = {}): Signal => ({
  type: "document_x",
  description: "d",
  severity: "high",
  code,
  metadata,
  ...extra,
});

test("documentFindings keeps only DOC-* codes and keys them by code and variant", () => {
  const findings = documentFindings([
    sig("DOC-04", { variant: "transparent_overlay", page: 1, resolutionRatio: 3.1 }),
    sig("PAY-01"),
    sig("DOC-05", { page: 2, snippets: ["MUR 125,000.00"] }, { evidence: "MUR 125,000.00" }),
    sig("DOC-01", { tools: ["iLovePDF"] }, { severity: "low" }),
    sig("DOC-07", { variant: "something_new" }),
    sig("DOC-99"),
    { type: "urgency_language", description: "x", severity: "low" },
  ]);
  assert.deepEqual(
    findings.map((f) => f.key),
    ["DOC-04:transparent_overlay", "DOC-05", "DOC-01", "DOC-07", "other"],
  );
  assert.equal(findings[0].ratio, 3.1);
  assert.equal(findings[0].page, 1);
  assert.equal(findings[1].snippet, "MUR 125,000.00");
  assert.deepEqual(findings[2].tools, ["iLovePDF"]);
  assert.equal(findings[2].severity, "low");
});

const preview = (p: Partial<DocumentPreview> = {}): DocumentPreview => ({
  signalCode: "DOC-04",
  page: 1,
  widthPx: 116,
  heightPx: 44,
  effectiveDpi: 48,
  backgroundDpi: 150,
  hasAlpha: true,
  hardEdgeRatio: 1,
  dataUrl: "data:image/png;base64,AAAA",
  ...p,
});

test("previewFacts: transparency, how much blurrier than the scan, hard edges", () => {
  assert.deepEqual(previewFacts(preview()), { page: 1, transparent: true, lowerRes: 3.1, hardEdges: true });
  // Close to the scan's resolution is not called out.
  assert.equal(previewFacts(preview({ effectiveDpi: 120 })).lowerRes, null);
  // DOCX: no scan behind it.
  assert.deepEqual(previewFacts(preview({ page: null, backgroundDpi: null, hardEdgeRatio: 0.2 })), { page: null, transparent: true, lowerRes: null, hardEdges: false });
});

test("withoutPreviews drops only the preview images", () => {
  const stored = {
    response: {
      verdict: "scam" as const,
      document: {
        fileType: "pdf" as const,
        pageCount: 1,
        pagesAnalyzed: 1,
        textSource: "text_layer" as const,
        textTruncated: false,
        metadata: { producer: "x", creator: null, created: null, modified: null, incrementalUpdates: 0, signed: false },
        previews: [preview()],
      },
    },
    at: 1,
  };
  const slim = withoutPreviews(stored);
  assert.deepEqual(slim.response.document.previews, []);
  assert.equal(slim.response.document.metadata.producer, "x");
  assert.equal(stored.response.document.previews.length, 1, "the original is not mutated");
});
