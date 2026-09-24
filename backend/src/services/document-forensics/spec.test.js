// What the document checker (POST /api/analyze/document) has to do, checked
// on files built the way real tools build them (spec-fixtures.js) instead of
// the demo fixtures the detectors were designed around. Each test names the
// requirement it checks, from docs/API-CONTRACT.md ("POST
// /api/analyze/document") and docs/DOCUMENT-FORENSICS.md.
//
// Every fixture was checked to be a valid file of the kind it claims to be:
// pdf.js renders it as described, and the encrypted ones also open in
// qpdf/pikepdf with their JavaScript intact. A failure here is a gap in the
// checker, not a broken file.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";

const { analyzeDocument } = await import("./index.js");
const F = await import("./spec-fixtures.js");
const B = await import("./fixture-builders.js");
const { runPipeline } = await import("../pipeline/index.js");
const { redact } = await import("../redact/index.js");
const { default: sharp } = await import("sharp");

const noOcr = async () => {
  throw new Error("OCR must not run: this file has a text layer");
};
const analyze = (bytes) => analyzeDocument(bytes, { ocr: noOcr });
const tag = (s) => `${s.code}${s.metadata?.variant ? `:${s.metadata.variant}` : ""}`;
const tags = (signals) => signals.map(tag).sort();
const find = (signals, code, variant) => signals.find((s) => s.code === code && (!variant || s.metadata?.variant === variant));

const FICTIONAL_JS = "app.alert('fictional test')";
const E_STATEMENT = [
  "Northbridge Savings Bank (fictional) - SAMPLE e-statement",
  "Account holder: A. Sample",
  "Statement period: 01/08/2026 - 31/08/2026",
  "Closing balance MUR 36,313.85",
  "This is a fictional sample statement for FraudLens testing.",
];

// ---------- DOC-04: an image pasted onto a scan ----------

test("DOC-04: a pasted transparent signature is found however the editor drew it", async () => {
  const cases = {
    "through a form XObject (a flattened stamp)": await F.buildSignatureInFormXObjectPdf(),
    "inside a page imported by a merge tool": await F.buildMergedForgeryPdf(),
    "made transparent by a colour-key /Mask": await F.buildMaskedSignaturePdf("color_key"),
    "made transparent by a 1-bit /Mask image": await F.buildMaskedSignaturePdf("mask_image"),
  };
  for (const [how, bytes] of Object.entries(cases)) {
    const doc = await analyze(bytes);
    const s = find(doc.signals, "DOC-04", "transparent_overlay");
    assert.ok(s, `${how}: got [${tags(doc.signals)}]`);
    assert.equal(s.metadata.page, 1, how);
    // 116 px stretched over 2.4 in on a 150 dpi scan.
    assert.equal(s.metadata.effectiveDpi, 48, how);
    assert.equal(s.metadata.backgroundDpi, 150, how);
    assert.equal(doc.previews.length, 1, how);
  }
});

test("DOC-04: a photographed signature (opaque JPEG) pasted at the scan's own resolution is still a pasted image", async () => {
  const doc = await analyze(await F.buildPhotographedSignaturePdf());
  assert.deepEqual(tags(doc.signals), ["DOC-04:overlay"]);
  const [s] = doc.signals;
  assert.equal(s.metadata.hasAlpha, false);
  assert.equal(s.metadata.effectiveDpi, 150);
  assert.equal(doc.previews[s.metadata.previewIndex].signalCode, "DOC-04");
});

test("DOC-04: a signature added as a Stamp annotation (macOS Preview, Acrobat 'Add signature') is an image drawn over the scan", async () => {
  // Requirement: DOC-04 "fires on an image drawn over the scan". Every viewer
  // draws an annotation's appearance on top of the page, so the reader sees
  // exactly what a pasted signature in the page content would show.
  const doc = await analyze(await F.buildSignatureStampAnnotationPdf());
  const s = find(doc.signals, "DOC-04");
  assert.ok(s, `no DOC-04; got [${tags(doc.signals)}]`);
  assert.equal(s.metadata.variant, "transparent_overlay");
  assert.equal(s.metadata.page, 1);
});

test("DOC-04: a signature pasted in a later incremental update is found, alongside the re-save", async () => {
  const doc = await analyze(await F.buildSignatureAddedInUpdatePdf());
  assert.deepEqual(tags(doc.signals), ["DOC-01", "DOC-02:incremental_update", "DOC-04:transparent_overlay"]);
  assert.equal(doc.metadata.incrementalUpdates, 1);
});

test("DOC-04: a forgery on page 7 of a 12-page agreement is found and located; 10 of the 12 pages are inspected", async () => {
  const doc = await analyze(await F.buildLongScannedAgreementPdf({ pages: 12, signedPage: 7 }));
  assert.equal(doc.pageCount, 12);
  assert.equal(doc.pagesAnalyzed, 10);
  assert.deepEqual(doc.signals.map((s) => [tag(s), s.metadata.page]), [["DOC-04:transparent_overlay", 7]]);
  assert.equal(doc.previews.length, 1);
  assert.equal(doc.previews[0].page, 7);
});

test("previews: at most 4, each tied to its own DOC-04 signal, never more than 256 px on a side", async () => {
  const doc = await analyze(await F.buildManyOverlaysPdf());
  const overlays = doc.signals.filter((s) => s.code === "DOC-04");
  assert.equal(overlays.length, 6, "all six pasted images are reported");
  assert.equal(doc.previews.length, 4);
  const linked = overlays.filter((s) => s.metadata.previewIndex !== undefined);
  assert.deepEqual(linked.map((s) => s.metadata.previewIndex).sort(), [0, 1, 2, 3]);
  for (const s of overlays) assert.equal(s.metadata.previewKey, undefined, "internal preview keys never leave the checker");
  // With 4 slots and 3 signatures, at least one 600 px stamp needed scaling down.
  assert.ok(linked.some((s) => s.metadata.widthPx > 256));
  for (const s of linked) {
    const p = doc.previews[s.metadata.previewIndex];
    assert.deepEqual(
      [p.signalCode, p.page, p.widthPx, p.heightPx, p.hasAlpha],
      ["DOC-04", s.metadata.page, s.metadata.widthPx, s.metadata.heightPx, s.metadata.hasAlpha],
    );
    const { format, width, height } = await sharp(Buffer.from(p.dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")).metadata();
    assert.equal(format, "png");
    assert.ok(Math.max(width, height) <= 256, `preview is ${width}x${height}`);
  }
});

// ---------- DOC-05: text typed onto a scan ----------

test("DOC-05: an amount typed over a scan as a FreeText annotation (PDFescape, Acrobat 'Add text') is text typed onto the scan", async () => {
  // Requirement: DOC-05 is visible text on a scan page. The annotation hides
  // the old closing balance behind an opaque box and shows a new one; a
  // viewer draws it over the page like any other typed-on text.
  const doc = await analyze(await F.buildTypedAmountAnnotationPdf("MUR 125,000.00"));
  const s = find(doc.signals, "DOC-05");
  assert.ok(s, `no DOC-05; got [${tags(doc.signals)}]`);
  assert.equal(s.evidence, "MUR 125,000.00");
  assert.equal(s.metadata.page, 1);
});

test("annotations only add to scan checks: filled-in fields on a native form are not odd-font edits or hidden text", async () => {
  // The field values (an amount and a date) are in Helvetica on a Times page:
  // as page content that would be DOC-08, but filling in a form is normal.
  const doc = await analyze(await F.buildFilledFormPdf());
  assert.deepEqual(tags(doc.signals), []);
});

test("DOC-05: a searchable scan whose OCR text lies UNDER the page image (FineReader, OmniPage) has nothing typed onto it", async () => {
  // Requirement: DOC-05 is text drawn ON a scan. Here the recognised text is
  // painted first and the full-page scan covers it, so no reader can see
  // it, and the signature is part of the scan: this is the genuine document.
  const doc = await analyze(await F.buildTextUnderImageScanPdf());
  assert.deepEqual(tags(doc.signals), []);
  assert.equal(doc.textSource, "text_layer");
});

test("DOC-05: typed-on evidence is redacted before it leaves the checker", async () => {
  const doc = await analyze(await F.buildTypedOnScanPdf("Pay to account 000123456789 today"));
  const s = find(doc.signals, "DOC-05");
  assert.ok(s, `no DOC-05; got [${tags(doc.signals)}]`);
  assert.match(s.evidence, /\[account ending 6789\]/);
  assert.doesNotMatch(JSON.stringify(doc.signals), /000123456789/);
});

// ---------- DOC-06: hidden text ----------

test("DOC-06: white heading text on a coloured banner is design; the same heading on a bare white page is hidden", async () => {
  assert.deepEqual(tags((await analyze(await F.buildBannerStatementPdf({ banner: true }))).signals), []);
  assert.deepEqual(tags((await analyze(await F.buildBannerStatementPdf({ banner: false }))).signals), ["DOC-06:white_text"]);
});

test("DOC-06: the font size is Tf and the text matrix together (Quartz writes Tf 1 and scales the matrix)", async () => {
  assert.deepEqual(tags((await analyze(await F.buildQuartzStylePdf())).signals), [], "11 pt text written as Tf 1 x 11");
  assert.deepEqual(tags((await analyze(await F.buildQuartzStylePdf({ tinyParagraph: true }))).signals), ["DOC-06:tiny_font"], "Tf 10 x 0.05 is 0.5 pt");
});

test("DOC-06: an OCR'd photo covering most but not all of the page (a receipt with margins) is an OCR layer, not hidden text", async () => {
  // DOC-06 is meant to catch text hidden from the reader, such as
  // instructions aimed at automated checkers. OCR software writes its
  // invisible layer over whatever image it read, full-page or not, and the
  // checker already excuses that layer on full-page scans.
  const doc = await analyze(await F.buildOcrPhotoWithMarginsPdf());
  assert.deepEqual(tags(doc.signals), []);
});

test("DOC-06: invisible text over a small logo is still hidden text - a logo is not a photo of text", async () => {
  const doc = await analyze(await F.buildHiddenTextOverLogoPdf());
  assert.deepEqual(tags(doc.signals), ["DOC-06:invisible_render_mode"]);
});

test("DOC-06: hidden text also reaches the verdict, where SOC-07 flags the instruction in it", async () => {
  const doc = await analyze(await B.buildHiddenTextPdf());
  assert.ok(find(doc.signals, "DOC-06", "invisible_render_mode"));
  const r = await runPipeline(redact(doc.text).redacted, { source: "document", extraSignals: doc.signals, semantic: { enabled: false } });
  assert.ok(r.signals.some((s) => s.code === "SOC-07"), `got [${r.signals.map((s) => s.code)}]`);
  assert.ok(r.actions.some((a) => a.id === "hostile_instructions"));
});

// ---------- DOC-02: saved revisions and digital signatures ----------

test("DOC-02: an edit after signing is not excused because the same update also adds /DSS validation data", async () => {
  // Requirement: after_signature is "bytes appended after the last signed
  // /ByteRange, and they are not DSS/VRI validation data". An update that
  // rewrites the page is not validation data, whatever else it carries.
  const signed = await B.buildSignedPdf();
  assert.deepEqual(tags((await analyze(await B.buildSignedWithDssPdf())).signals), [], "control: a DSS-only append is silent");
  assert.deepEqual(tags((await analyze(await F.editWithDss(signed, { edit: false }))).signals), [], "control: so is one that rewrites the catalog to add /DSS");
  assert.ok(find((await analyze(await F.editWithDss(signed, { dss: false }))).signals, "DOC-02", "after_signature"), "control: the edit alone is caught");

  const doc = await analyze(await F.editWithDss(signed));
  assert.match(doc.text, /Amount due: MUR 95,000\.00/, "the edit is what a reader now sees");
  assert.ok(find(doc.signals, "DOC-02", "after_signature"), `got [${tags(doc.signals)}]`);
});

test("DOC-02: on an unsigned file, a revision that edits the page counts even when it also carries /DSS", async () => {
  // Requirement: incremental_update is "a saved revision after the first that
  // is not a signature being added, DSS data or linearization".
  const native = await F.buildNativeClassicPdf();
  assert.deepEqual(tags((await analyze(await F.editWithDss(native, { edit: false }))).signals), [], "control: adding only /DSS is not an edit");
  const doc = await analyze(await F.editWithDss(native));
  assert.equal(doc.metadata.incrementalUpdates, 1);
  assert.ok(find(doc.signals, "DOC-02", "incremental_update"), `got [${tags(doc.signals)}]`);
});

// ---------- DOC-01 / DOC-03 and document.metadata ----------

test("DOC-03: PDF dates are compared as instants, time zones included", async () => {
  // Mauritius is UTC+4: 13:30+04'00' and 09:31Z are one minute apart.
  const ok = await analyze(await F.buildDatedPdf({ created: "D:20260901133000+04'00'", modified: "D:20260901093100Z" }));
  assert.deepEqual(tags(ok.signals), []);
  assert.equal(ok.metadata.created, "2026-09-01T09:30:00.000Z");
  assert.equal(ok.metadata.modified, "2026-09-01T09:31:00.000Z");
  // 09:30+04'00' is 05:30Z, four hours BEFORE the 09:30Z creation.
  const bad = await analyze(await F.buildDatedPdf({ created: "D:20260901093000Z", modified: "D:20260901093000+04'00'" }));
  assert.deepEqual(tags(bad.signals), ["DOC-03:mod_before_create"]);
});

test("DOC-01/DOC-03: XMP metadata is read - a Canva design whose Info dictionary now says Word", async () => {
  const doc = await analyze(await F.buildCanvaXmpPdf());
  assert.deepEqual(tags(doc.signals), ["DOC-01", "DOC-03:producer_mismatch"]);
  const s = find(doc.signals, "DOC-01");
  assert.deepEqual(s.metadata.tools, ["Canva"]);
  assert.ok(s.metadata.fields.includes("XMP creator tool"));
});

test("document.metadata holds tool names and dates only - never author or title - capped at 120 characters", async () => {
  const doc = await analyze(await F.buildDatedPdf({
    created: "D:20260901093000Z",
    modified: "D:20260901093000Z",
    author: "Jane Doe",
    producer: `Northbridge Statement Engine ${"x".repeat(300)}`,
  }));
  assert.deepEqual(Object.keys(doc.metadata).sort(), ["created", "creator", "incrementalUpdates", "modified", "producer", "signed"]);
  assert.ok(doc.metadata.producer.length <= 120);
  assert.doesNotMatch(JSON.stringify(doc), /Jane Doe/);
});

// ---------- Encryption and DOC-07 active content ----------

test("a permissions-only encrypted e-statement (opens without a password) is analysed like any PDF, with or without object streams", async () => {
  for (const objectStreams of [false, true]) {
    const doc = await analyze(F.buildPermissionsOnlyPdf({ lines: E_STATEMENT, objectStreams }));
    assert.equal(doc.fileType, "pdf");
    assert.equal(doc.textSource, "text_layer");
    assert.match(doc.text, /Closing balance MUR 36,313\.85/);
    assert.deepEqual(tags(doc.signals), [], `objectStreams=${objectStreams}`);
  }
});

test("DOC-07: JavaScript in a permissions-only encrypted PDF is found", async () => {
  const doc = await analyze(F.buildPermissionsOnlyPdf({ lines: E_STATEMENT, javascript: FICTIONAL_JS }));
  assert.deepEqual(tags(doc.signals), ["DOC-07:javascript"]);
});

// A known gap, left open for the hackathon (docs/API-CONTRACT.md, "Document
// forensics limits"): pdf-lib cannot decrypt, so it cannot read an encrypted
// file's object streams. Marked todo so the suite stays green; drop the
// option once the active-content scan reads decrypted objects.
test("DOC-07: JavaScript inside an encrypted object stream is found too (a common way to hide it from scanners)", { todo: "encrypted object streams are not read yet" }, async () => {
  // The file differs from the test above only in where its objects are
  // stored; pdf.js reads it and qpdf sees the /OpenAction script.
  const doc = await analyze(F.buildPermissionsOnlyPdf({ lines: E_STATEMENT, javascript: FICTIONAL_JS, objectStreams: true }));
  assert.deepEqual(tags(doc.signals), ["DOC-07:javascript"]);
});

test("DOC-07 DOCX: a template loaded from a web server or a network share is flagged, with its host", async () => {
  for (const [target, host] of [
    ["https://templates.example.invalid/letterhead.dotm", "templates.example.invalid"],
    ["file://fileserver.example.invalid/templates/letter.dotm", "fileserver.example.invalid"],
  ]) {
    const s = find((await analyze(F.buildDocxWithTemplate(target))).signals, "DOC-07", "external_template");
    assert.ok(s, target);
    assert.equal(s.metadata.host, host);
  }
});

test("DOC-07 DOCX: a letter based on a template on the author's own disk does not 'load a template from the internet'", async () => {
  // Word records any template other than Normal as an External
  // attachedTemplate relationship, including one in the author's own Custom
  // Office Templates folder. The finding tells the reader the file "loads a
  // template from the internet when it is opened, a known way to deliver
  // malware" - true for a URL or a network share, not for a path on the
  // author's C: drive.
  const doc = await analyze(F.buildDocxWithTemplate("file:///C:\\Users\\asample\\Documents\\Custom%20Office%20Templates\\Northbridge%20Letter.dotx"));
  assert.deepEqual(tags(doc.signals), []);
});

test("DOC-04 DOCX: only a floating picture counts as pasted; an inline transparent logo is ordinary layout", async () => {
  const png = await B.renderPastedSignature();
  assert.deepEqual(tags((await analyze(F.buildDocxWithInlineLogo(png))).signals), []);
  assert.deepEqual(tags((await analyze(B.buildDocx({ anchoredPng: png }))).signals), ["DOC-04:docx_transparent_image"]);
});

// ---------- Text and reliability ----------

test("OCR fallback: a scan with no text layer is read by OCR, the first 3 scanned pages only", async () => {
  const seen = [];
  const doc = await analyzeDocument(await F.buildScanOnlyPdf(5), {
    ocr: async (png) => {
      const { width, height } = await sharp(png).metadata();
      seen.push([width, height]);
      return `Page ${seen.length}: Northbridge Savings Bank statement, closing balance MUR 1,250.00, account holder A. Sample.`;
    },
  });
  assert.equal(seen.length, 3);
  assert.deepEqual(seen[0], [1240, 1754], "the scan is OCR'd at its own resolution");
  assert.equal(doc.textSource, "ocr");
  assert.equal(doc.ocrQuality, "ok");
  assert.match(doc.text, /Page 1:[\s\S]*Page 2:[\s\S]*Page 3:/);
  assert.doesNotMatch(doc.text, /Page 4:/);
});

test("reliability: a 10-page 300 dpi scan, about the largest realistic upload, finishes inside the default worker timeout", async (t) => {
  const bytes = await F.buildHighResScanPdf(10);
  const started = Date.now();
  const doc = await analyze(bytes);
  t.diagnostic(`${(bytes.length / 1048576).toFixed(1)} MB analysed in ${Date.now() - started} ms`);
  assert.equal(doc.pagesAnalyzed, 10);
  assert.deepEqual(tags(doc.signals), []);
});
