// Document forensics: structural warning signs in an uploaded PDF or DOCX
// (pasted signature images, text typed onto a scan, edits after signing,
// editing-tool metadata, hidden text, active content), plus the document's
// text for the normal analysis pipeline.
//
//   bytes -> worker thread (pdf.js / docx.js: untrusted parsing, heap-capped,
//            hard timeout) -> facts
//         -> main thread: images.js (previews, DOCX alpha), detectors.js
//            (facts -> DOC-* signals), text layer or OCR fallback
//
// The LLM never sees the file, its images or these facts - only the text,
// through runPipeline(), like any other message. Nothing here is stored.

import { Worker } from "node:worker_threads";
import { extractTextFromImage } from "../ocr/index.js";
import { detectDocumentSignals, DOCUMENT_DETECTOR_VERSION } from "./detectors.js";
import { encodedImageFacts, grayToPng, rawPreview } from "./images.js";
import { effectiveDpi } from "./overlay.js";
import { TEXT_LAYER_MIN_CHARS, MAX_PREVIEWS } from "./pdf.js";

export { DOCUMENT_DETECTOR_VERSION };
export { sniffDocumentType } from "./sniff.js";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_TIMEOUT_MS = Number(process.env.DOCUMENT_TIMEOUT_MS) || 15_000;
/** Parallel document analyses; each runs a worker with up to WORKER_HEAP_MB of heap. */
export const MAX_CONCURRENT_DOCUMENTS = 2;
const WORKER_HEAP_MB = 256;
const WORKER_URL = new URL("./worker.js", import.meta.url);
let active = 0;
const EMU_PER_INCH = 914_400;
/** OCR output with fewer letters/digits than this, or mostly symbols, is "low" quality. */
const OCR_OK_MIN_CHARS = 100;
const OCR_OK_MIN_ALNUM_SHARE = 0.6;
const META_OUT_MAX = 120;

/** Public failure categories; `detail` is for server logs only. */
export class DocumentError extends Error {
  /** @param {"unsupported"|"encrypted"|"unreadable"|"busy"} code */
  constructor(code, detail) {
    super(`document analysis failed: ${code}${detail ? ` (${detail})` : ""}`);
    this.name = "DocumentError";
    this.code = code;
  }
}

const realChars = (s) => (s.match(/[\p{L}\p{N}]/gu) ?? []).length;

function runInWorker(bytes, { timeoutMs, workerUrl }) {
  return new Promise((resolve, reject) => {
    const copy = new Uint8Array(bytes);
    const worker = new Worker(workerUrl, {
      workerData: { bytes: copy },
      transferList: [copy.buffer],
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    let settled = false;
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().catch(() => {});
      settle(value);
    };
    const timer = setTimeout(() => finish(reject, new DocumentError("unreadable", `timed out after ${timeoutMs}ms`)), timeoutMs);
    worker.once("message", (msg) =>
      msg?.ok ? finish(resolve, msg.facts) : finish(reject, new DocumentError(msg?.code ?? "unreadable", msg?.detail)),
    );
    // Includes ERR_WORKER_OUT_OF_MEMORY from the heap limit.
    worker.once("error", (err) => finish(reject, new DocumentError("unreadable", err?.code ?? err?.message)));
    worker.once("exit", (code) => finish(reject, new DocumentError("unreadable", `worker exited with code ${code}`)));
  });
}

async function docxImageFacts(images = []) {
  const out = [];
  for (const img of images) {
    try {
      const f = await encodedImageFacts(img.data);
      const inches = img.cx && img.cy ? [img.cx / EMU_PER_INCH, img.cy / EMU_PER_INCH] : null;
      out.push({
        ...f,
        previewKey: img.key,
        effectiveDpi: inches ? effectiveDpi(f.widthPx, f.heightPx, inches[0] * 72, inches[1] * 72) : null,
      });
    } catch (err) {
      console.error(`[document-forensics] DOCX image skipped: ${err.message}`);
    }
  }
  return out;
}

/** Previews for DOC-04 signals (at most MAX_PREVIEWS); links each signal to its preview by index. */
async function attachPreviews(signals, facts, docxImages) {
  const previews = [];
  for (const s of signals) {
    if (s.code !== "DOC-04") continue;
    const key = s.metadata.previewKey;
    delete s.metadata.previewKey;
    if (!key || previews.length >= MAX_PREVIEWS) continue;
    let dataUrl = null;
    try {
      const pdfPixels = facts.previews?.find((p) => p.key === key);
      dataUrl = pdfPixels ? await rawPreview(pdfPixels) : (docxImages.find((d) => d.previewKey === key)?.preview ?? null);
    } catch (err) {
      console.error(`[document-forensics] preview skipped: ${err.message}`);
    }
    if (!dataUrl) continue;
    s.metadata.previewIndex = previews.length;
    previews.push({
      signalCode: "DOC-04",
      page: s.metadata.page ?? null,
      widthPx: s.metadata.widthPx,
      heightPx: s.metadata.heightPx,
      effectiveDpi: s.metadata.effectiveDpi,
      backgroundDpi: s.metadata.backgroundDpi,
      hasAlpha: s.metadata.hasAlpha,
      hardEdgeRatio: s.metadata.hardEdgeRatio,
      dataUrl,
    });
  }
  return previews;
}

function ocrQualityOf(text) {
  const visible = text.replace(/\s/g, "");
  const alnum = realChars(text);
  return alnum < OCR_OK_MIN_CHARS || (visible.length > 0 && alnum / visible.length < OCR_OK_MIN_ALNUM_SHARE) ? "low" : "ok";
}

/**
 * The text layer when it holds real text; otherwise OCR of the first scanned
 * pages. OCR failure never fails the analysis - the structural findings
 * still stand, and the result says no text was read.
 */
async function documentText(facts, ocr) {
  const layer = (facts.text ?? "").trim();
  if (facts.fileType !== "pdf" || realChars(layer) >= TEXT_LAYER_MIN_CHARS || !facts.ocrImages?.length) {
    return { text: layer, textSource: layer ? "text_layer" : "none" };
  }
  const pages = [];
  for (const image of facts.ocrImages) {
    try {
      const text = (await ocr(await grayToPng(image))).trim();
      if (text) pages.push(text);
    } catch (err) {
      console.error(`[document-forensics] OCR failed on page ${image.page}: ${err.message}`);
    }
  }
  const ocrText = pages.join("\n\n");
  if (!ocrText) return { text: layer, textSource: layer ? "text_layer" : "none" };
  return { text: [ocrText, layer].filter(Boolean).join("\n\n"), textSource: "ocr", ocrQuality: ocrQualityOf(ocrText) };
}

const capMeta = (v) => (typeof v === "string" && v ? v.slice(0, META_OUT_MAX) : null);
const iso = (ms) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/** The response's `document.metadata`: tool names and dates only - never author/person fields. */
function documentMetadata(facts) {
  const m = facts.metadata ?? {};
  if (facts.fileType === "pdf") {
    return {
      producer: capMeta(m.producer ?? m.xmpProducer),
      creator: capMeta(m.creator ?? m.xmpCreatorTool),
      created: iso(m.created ?? m.xmpCreated),
      modified: iso(m.modified ?? m.xmpModified),
      incrementalUpdates: facts.structure?.incrementalUpdates ?? 0,
      signed: Boolean(facts.structure?.signed),
    };
  }
  return {
    producer: capMeta(m.application),
    creator: null,
    created: iso(m.created),
    modified: iso(m.modified),
    incrementalUpdates: null,
    signed: Boolean(facts.signed),
  };
}

/**
 * @param {Uint8Array} buffer the uploaded file (already size-checked by the route)
 * @param {{ now?: number, timeoutMs?: number, ocr?: (png: Buffer) => Promise<string>, workerUrl?: URL }} [opts]
 * @returns {Promise<{ fileType: "pdf"|"docx", pageCount: number|null, pagesAnalyzed: number|null,
 *   textSource: "text_layer"|"ocr"|"none", text: string, ocrQuality?: "low"|"ok",
 *   metadata: object, signals: object[], previews: object[] }>}
 * @throws {DocumentError}
 */
export async function analyzeDocument(buffer, { now = Date.now(), timeoutMs = DOCUMENT_TIMEOUT_MS, ocr = extractTextFromImage, workerUrl = WORKER_URL } = {}) {
  if (active >= MAX_CONCURRENT_DOCUMENTS) throw new DocumentError("busy");
  active++;
  try {
    const facts = await runInWorker(buffer, { timeoutMs, workerUrl });
    const docxImages = facts.fileType === "docx" ? await docxImageFacts(facts.images) : [];
    const signals = detectDocumentSignals(facts, { now, docxImages });
    const previews = await attachPreviews(signals, facts, docxImages);
    const { text, textSource, ocrQuality } = await documentText(facts, ocr);
    return {
      fileType: facts.fileType,
      pageCount: facts.pageCount ?? null,
      pagesAnalyzed: facts.pagesAnalyzed ?? null,
      textSource,
      text,
      ...(ocrQuality ? { ocrQuality } : {}),
      metadata: documentMetadata(facts),
      signals,
      previews,
    };
  } finally {
    active--;
  }
}
