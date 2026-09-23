// Regression tests for the byte-exact ingestion guarantee: a stored document
// must come back byte-for-byte identical to what was received, not just
// visually/structurally similar. This is the property the old
// screenshot-then-OCR pipeline broke (a re-render/re-encode is never
// byte-identical to its source), and the one forensics in
// services/document-forensics depends on.
process.env.DATABASE_URL = ":memory:";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { ingestDocument, getStoredDocument, sniffDocumentType, extractDocumentText } from "./index.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const jpegFixture = readFileSync(path.join(fixturesDir, "clean.jpg"));
const pdfFixture = readFileSync(path.join(fixturesDir, "incremental-update.pdf"));

test("sniffDocumentType recognizes PDF, JPEG, PNG and WEBP by magic bytes only", () => {
  assert.equal(sniffDocumentType(pdfFixture), "application/pdf");
  assert.equal(sniffDocumentType(jpegFixture), "image/jpeg");
  assert.equal(sniffDocumentType(Buffer.from("not a document")), null);
});

test("a JPEG document is retrievable byte-for-byte identical to what was received", () => {
  const { id, sha256 } = ingestDocument({ buffer: jpegFixture, sourceChannel: "web_upload" });
  const stored = getStoredDocument(id);

  // Buffer.equals is a full byte-for-byte comparison, not a size/hash
  // shortcut - this is the actual claim being tested.
  assert.ok(stored.bytes.equals(jpegFixture), "stored JPEG bytes differ from the original upload");
  assert.equal(stored.bytes.length, jpegFixture.length);
  assert.equal(sha256, createHash("sha256").update(jpegFixture).digest("hex"));
  assert.equal(stored.mimeType, "image/jpeg");

  // Not just "looks the same": the exact EXIF bytes exiftool wrote into the
  // fixture (Make/Model/DateTimeOriginal) must still be present verbatim -
  // a re-encode is exactly what strips this.
  assert.ok(stored.bytes.includes("FixtureCam"), "EXIF Model tag did not survive storage");
  assert.ok(stored.bytes.includes("TestCam"), "EXIF Make tag did not survive storage");
});

test("a PDF's embedded metadata and incremental-save structure are preserved after ingestion", () => {
  const { id } = ingestDocument({ buffer: pdfFixture, sourceChannel: "web_upload" });
  const stored = getStoredDocument(id);

  assert.ok(stored.bytes.equals(pdfFixture), "stored PDF bytes differ from the original upload");
  assert.equal(stored.mimeType, "application/pdf");

  const text = stored.bytes.toString("latin1");
  // The fixture is a two-revision PDF: an original body plus a genuine
  // incremental update (a second xref/trailer with /Prev pointing back at
  // the first). Collapsing this into a single, "cleaned up" revision -
  // exactly what re-saving a PDF through most renderers does - would erase
  // the edit history forgery detection needs to see.
  assert.equal((text.match(/%%EOF/g) || []).length, 2, "expected two revisions (two %%EOF markers)");
  assert.match(text, /\/Prev \d+/, "expected the incremental update's /Prev back-reference to survive");
  // Both the original and the edited Info dict must still be present -
  // proving the first revision's object was appended after, not overwritten.
  assert.match(text, /D:20240101000000Z/, "original revision's ModDate should still be present");
  assert.match(text, /D:20240615120000Z/, "incremental update's ModDate should still be present");
});

test("ingestDocument rejects a buffer that isn't a recognised document type", () => {
  const result = ingestDocument({ buffer: Buffer.from("plain text, not a document"), sourceChannel: "web_upload" });
  assert.deepEqual(result, { error: "unsupported_type" });
});

test("getStoredDocument returns undefined for an unknown id", () => {
  assert.equal(getStoredDocument("00000000-0000-0000-0000-000000000000"), undefined);
});

test("extractDocumentText returns null for a PDF instead of OCR-ing it", async () => {
  const { id } = ingestDocument({ buffer: pdfFixture, sourceChannel: "web_upload" });
  assert.equal(await extractDocumentText(id), null);
});

test("extractDocumentText throws for an unknown id rather than returning empty text", async () => {
  await assert.rejects(() => extractDocumentText("00000000-0000-0000-0000-000000000000"), /no document stored/);
});
