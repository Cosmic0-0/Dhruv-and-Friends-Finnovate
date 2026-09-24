// PDF inspection on real (generated) files, parsed directly - no worker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeStructure, inspectPdf, scanActiveContent } from "./pdf.js";
import { parsePdfDate } from "./meta.js";
import * as B from "./fixture-builders.js";
import * as F from "./spec-fixtures.js";

const bytes = (s) => new Uint8Array(Buffer.from(s, "latin1"));

test("analyzeStructure: one revision, a linearized file, and unexplained edits", () => {
  assert.deepEqual(
    { ...analyzeStructure(bytes("%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n9\n%%EOF\n")) },
    { sections: 1, linearized: false, incrementalUpdates: 0, unexplainedUpdates: 0, signed: false, signatureCount: 0, bytesAfterSignature: 0, afterSignature: false },
  );
  // Fast-web-view files have two xref sections by design.
  const linearized = analyzeStructure(bytes("%PDF-1.7\n1 0 obj\n<< /Linearized 1 >>\nendobj\nstartxref\n9\n%%EOF\n2 0 obj\n<<>>\nendobj\nstartxref\n30\n%%EOF\n"));
  assert.equal(linearized.linearized, true);
  assert.equal(linearized.incrementalUpdates, 0);
  assert.equal(linearized.unexplainedUpdates, 0);
  const edited = analyzeStructure(bytes("%PDF-1.7\nstartxref\n9\n%%EOF\n3 0 obj\n<< /Producer (x) >>\nendobj\nstartxref\n40\n%%EOF\n"));
  assert.equal(edited.incrementalUpdates, 1);
  assert.equal(edited.unexplainedUpdates, 1);
});

test("analyzeStructure: signatures, counter-signatures, DSS appends and edits after signing", async () => {
  const signed = analyzeStructure(await B.buildSignedPdf());
  assert.equal(signed.signed, true);
  assert.equal(signed.incrementalUpdates, 1);
  assert.equal(signed.unexplainedUpdates, 0, "adding the signature is not an edit");
  assert.equal(signed.afterSignature, false);

  const counter = analyzeStructure(await B.buildCounterSignedPdf());
  assert.equal(counter.signatureCount, 2);
  assert.equal(counter.unexplainedUpdates, 0);
  assert.equal(counter.afterSignature, false);

  const dss = analyzeStructure(await B.buildSignedWithDssPdf());
  assert.equal(dss.unexplainedUpdates, 0);
  assert.equal(dss.afterSignature, false, "long-term validation data is not a change to the content");

  const edited = analyzeStructure(await B.buildEditedAfterSigningPdf());
  assert.equal(edited.afterSignature, true);
  assert.ok(edited.bytesAfterSignature > 100);
});

test("analyzeStructure: a /DSS entry excuses only new objects, including against pages packed in object streams", async () => {
  // The clean native fixture keeps its page inside a compressed object stream.
  const packed = await B.buildCleanNativePdf();
  assert.equal(analyzeStructure(await F.editWithDss(packed, { edit: false })).unexplainedUpdates, 0, "adding /DSS alone");
  assert.equal(analyzeStructure(await F.editWithDss(packed)).unexplainedUpdates, 1, "the update rewrites the packed page");
  const signed = await B.buildSignedPdf();
  assert.equal(analyzeStructure(await F.editWithDss(signed, { edit: false })).afterSignature, false);
  assert.equal(analyzeStructure(await F.editWithDss(signed)).afterSignature, true);
});

test("parsePdfDate handles offsets and partial dates", () => {
  assert.equal(parsePdfDate("D:20260901133000+04'00'"), Date.parse("2026-09-01T09:30:00Z"));
  assert.equal(parsePdfDate("D:20260901093000Z"), Date.parse("2026-09-01T09:30:00Z"));
  assert.equal(parsePdfDate("D:2026"), Date.parse("2026-01-01T00:00:00Z"));
  assert.equal(parsePdfDate("yesterday"), null);
});

test("active content inside compressed object streams is found (obfuscated names too)", async () => {
  const pdf = await B.buildActiveContentPdf();
  assert.ok(!Buffer.from(pdf).includes("/JavaScript"), "the script's name is hidden from a raw byte scan");
  const { variants, complete } = await scanActiveContent(new Uint8Array(pdf));
  assert.deepEqual(variants.sort(), ["embedded_file", "javascript", "launch_action", "submit_form"]);
  assert.equal(complete, true);
  assert.deepEqual((await scanActiveContent(new Uint8Array(await B.buildCleanNativePdf()))).variants, []);
});

test("inspectPdf: the flagship forgery - a transparent, upscaled signature on a scan", async () => {
  const facts = await inspectPdf(new Uint8Array(await B.buildForgedSignaturePdf()));
  assert.equal(facts.metadata.producer, "iLovePDF");
  assert.equal(facts.structure.incrementalUpdates, 1);
  const [page] = facts.pages;
  assert.equal(page.isScanPage, true);
  assert.equal(Math.round(page.scan.dpi), 150);
  assert.equal(page.overlays.length, 1);
  const [o] = page.overlays;
  assert.equal(o.widthPx, 116);
  assert.equal(Math.round(o.effectiveDpi), 48);
  assert.ok(o.transparentShare > 0.5);
  assert.equal(o.hardEdgeRatio, 1);
  assert.equal(facts.previews.length, 1);
  assert.equal(facts.previews[0].channels, 4);
  assert.match(facts.text, /Please transfer MUR 18,500/);
  assert.equal(facts.ocrImages.length, 0, "a text layer exists, no OCR needed");
});

test("inspectPdf: a genuine scan with its OCR layer has no overlays and no visible text", async () => {
  const facts = await inspectPdf(new Uint8Array(await B.buildLegitScanPdf()));
  const [page] = facts.pages;
  assert.equal(page.isScanPage, true);
  assert.deepEqual(page.overlays, []);
  assert.equal(page.visibleChars, 0);
  assert.ok(page.runs.every((r) => r.renderMode === 3));
});

test("inspectPdf: false-positive guards - designed backgrounds and compact (MRC) scans", async () => {
  const designed = await inspectPdf(new Uint8Array(await B.buildDesignedBackgroundPdf()));
  assert.ok(designed.pages[0].scan, "it does have a full-page image");
  assert.equal(designed.pages[0].isScanPage, false, "but lots of real text makes it a designed page");
  assert.deepEqual(designed.pages[0].overlays, []);

  const mrc = await inspectPdf(new Uint8Array(await B.buildMrcScanPdf()));
  assert.equal(mrc.pages[0].isScanPage, true);
  assert.deepEqual(mrc.pages[0].overlays, [], "a text mask at the scan's own resolution is not an overlay");
});

test("inspectPdf: text runs carry font, size, render mode and fill", async () => {
  const facts = await inspectPdf(new Uint8Array(await B.buildEditedAmountPdf()));
  const typed = facts.pages[0].runs.find((r) => r.text === "MUR 125,000.00");
  assert.ok(typed);
  assert.equal(typed.font, "Helvetica");
  assert.equal(typed.renderMode, 0);
  assert.equal(typed.fill, "color");
  assert.equal(Math.round(typed.fontSize), 13);
  assert.equal(typed.coveredByScan, false, "typed after the scan, so on top of it");
});

test("inspectPdf: annotation appearances are read and marked, without changing how the page is judged", async () => {
  // A Stamp annotation's image is an overlay on the scan, placed where the annotation's Rect puts it.
  const stamp = await inspectPdf(new Uint8Array(await F.buildSignatureStampAnnotationPdf()));
  assert.equal(stamp.pages[0].isScanPage, true);
  assert.equal(stamp.pages[0].imageCount, 1, "the stamp is not page content");
  const [o] = stamp.pages[0].overlays;
  assert.equal(Math.round(o.effectiveDpi), 48);
  // Filled form fields are read as annotation text, not as page text.
  const form = await inspectPdf(new Uint8Array(await F.buildFilledFormPdf()));
  const values = form.pages[0].runs.filter((r) => r.annotation).map((r) => r.text.trim());
  assert.deepEqual(values.sort(), ["01/09/2026", "MUR 1,250.00"]);
  assert.ok(form.pages[0].runs.filter((r) => !r.annotation).every((r) => r.font === "Times-Roman"));
});

test("inspectPdf: text over a sizeable image is marked overImage; text over a small logo is not", async () => {
  const photo = await inspectPdf(new Uint8Array(await F.buildOcrPhotoWithMarginsPdf()));
  assert.equal(photo.pages[0].scan, null, "the photo covers about 70% of the page, so it is not a full-page scan");
  assert.ok(photo.pages[0].runs.every((r) => r.renderMode === 3 && r.overImage));
  const logo = await inspectPdf(new Uint8Array(await F.buildHiddenTextOverLogoPdf()));
  assert.ok(logo.pages[0].runs.every((r) => !r.overImage));
});

test("inspectPdf: text painted before the scan is covered by it, so the page is still a scan with no visible text", async () => {
  const facts = await inspectPdf(new Uint8Array(await F.buildTextUnderImageScanPdf()));
  const [page] = facts.pages;
  assert.equal(page.isScanPage, true);
  assert.ok(page.runs.length > 0);
  assert.ok(page.runs.every((r) => r.renderMode === 0 && r.coveredByScan), "ordinary visible text, all under the scan");
  assert.equal(page.visibleChars, 0);
});

test("inspectPdf: a scan without a text layer hands greyscale pixels to OCR", async () => {
  const facts = await inspectPdf(new Uint8Array(await B.buildScanOnlyPdf()));
  assert.equal(facts.text, "");
  assert.equal(facts.ocrImages.length, 1);
  const [img] = facts.ocrImages;
  assert.equal(img.data.byteLength, img.width * img.height);
});

test("inspectPdf: password-protected and broken files fail with public error codes", async () => {
  await assert.rejects(inspectPdf(new Uint8Array(await B.buildEncryptedPdf())), { code: "encrypted" });
  await assert.rejects(inspectPdf(bytes("%PDF-1.7\nthis is not really a pdf")), { code: "unreadable" });
});
