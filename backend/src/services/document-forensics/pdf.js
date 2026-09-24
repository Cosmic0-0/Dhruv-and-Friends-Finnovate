// PDF inspection: parses an UNTRUSTED file into plain facts. Runs inside the
// document worker (worker.js) so a hostile or huge PDF can only exhaust that
// worker, never the API process. No signals are decided here - detectors.js
// turns these facts into DOC-* signals on the main thread.
//
// Library split (see EXPLAINER.md "Document forensics"):
//   - pdf.js (pdfjs-dist, pinned): text layer, operator list (image
//     placements under the CTM, text render mode, fonts, fill colour),
//     decoded image pixels (SMask merged into alpha), Info/XMP metadata and
//     password detection. It decodes every image filter, so real files work.
//   - pdf-lib: enumerates every object, including ones packed in compressed
//     object streams, to find active content that a raw byte scan would miss.
//   - raw bytes: revision sections (startxref/%%EOF), linearization and
//     digital-signature /ByteRange coverage.

import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from "pdf-lib";
import { DocumentInspectError } from "./sniff.js";
import { parseIsoDate, parsePdfDate, sanitizeMeta } from "./meta.js";
import {
  FULL_PAGE_COVERAGE, IDENTITY, LOW_RES_RATIO, OCR_IMAGE_MIN_COVERAGE, OVERLAY_MIN_AREA, OVERLAY_MIN_PIXELS, SCAN_MAX_VISIBLE_CHARS,
  alphaStats, applyPoint, compose, coverage, effectiveDpi, intersects, placementFromCtm, toGray,
} from "./overlay.js";

export const MAX_PAGES = 10;
export const OCR_MAX_PAGES = 3;
/** Fewer letters/digits than this in the text layer means "no usable text layer" (OCR the scan instead). */
export const TEXT_LAYER_MIN_CHARS = 50;
const MAX_RUNS_PER_PAGE = 4000;
const MAX_RUN_CHARS = 200;
const MAX_PREVIEW_CANDIDATES = 8;
export const MAX_PREVIEWS = 4;
const IMAGE_RESOLVE_TIMEOUT_MS = 5000;

const require = createRequire(import.meta.url);
const PDFJS_ROOT = `${path.dirname(require.resolve("pdfjs-dist/package.json")).replaceAll("\\", "/")}/`;

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs"));

// Hardened pdf.js options: no font eval/system fonts/XFA, no canvas, no
// network (resource tables are read from the installed package), capped
// image size, errors tolerated rather than thrown mid-parse.
function pdfjsOptions(data) {
  return {
    data,
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useWorkerFetch: false,
    stopAtErrors: false,
    verbosity: 0,
    maxImageSize: 40_000_000,
    cMapUrl: `${PDFJS_ROOT}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ROOT}standard_fonts/`,
    wasmUrl: `${PDFJS_ROOT}wasm/`,
    iccUrl: `${PDFJS_ROOT}iccs/`,
  };
}

const latin1 = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString("latin1");

// ---------- Revision structure (raw bytes) ----------

const SECTION_RE = /startxref\s+\d+\s*%%EOF/g;
const BYTE_RANGE_RE = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
const SIGNATURE_APPENDIX_RE = /\/(?:DSS|VRI)\b/;
const OBJECT_RE = /(?<!\d)(\d+)\s+\d+\s+obj\b/g;
const pagesRef = (dict) => /\/Pages\s+(\d+\s+\d+\s+R)/.exec(dict)?.[1] ?? null;

/** The objects packed in an object stream (number -> text), or null when they cannot be read (encrypted, unknown filter). */
function packedObjects(dict, streamPart) {
  const first = Number(/\/First\s+(\d+)/.exec(dict)?.[1]);
  const start = /^stream\r?\n/.exec(streamPart);
  const end = streamPart.lastIndexOf("endstream");
  if (!start || end < 0 || !Number.isInteger(first)) return null;
  let data = Buffer.from(streamPart.slice(start[0].length, end), "latin1");
  try {
    if (/\/Filter\s*\[?\s*\/FlateDecode\s*\]?/.test(dict)) data = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    else if (/\/Filter\b/.test(dict)) return null;
  } catch {
    return null;
  }
  const packed = data.toString("latin1");
  const header = packed.slice(0, first).trim().split(/\s+/).map(Number);
  if (header.length % 2 !== 0 || header.some((n) => !Number.isInteger(n))) return null;
  const out = new Map();
  for (let k = 0; k < header.length; k += 2) {
    out.set(header[k], packed.slice(first + header[k + 1], k + 3 < header.length ? first + header[k + 3] : undefined));
  }
  return out;
}

/** The objects one revision defines (number -> dictionary text, object streams unpacked) and its trailer's /Info. */
function revisionObjects(section) {
  const objects = new Map();
  let inspectable = true;
  for (const m of section.matchAll(OBJECT_RE)) {
    const bodyStart = m.index + m[0].length;
    const endAt = section.indexOf("endobj", bodyStart);
    const body = section.slice(bodyStart, endAt < 0 ? section.length : endAt);
    const streamAt = body.search(/>>\s*stream\r?\n/);
    const dict = streamAt < 0 ? body : body.slice(0, streamAt + 2);
    objects.set(Number(m[1]), dict);
    if (/\/Type\s*\/ObjStm\b/.test(dict)) {
      const packed = streamAt < 0 ? null : packedObjects(dict, body.slice(body.indexOf("stream", streamAt)));
      if (packed) for (const [n, d] of packed) objects.set(n, d);
      else inspectable = false;
    }
  }
  const info = [...section.matchAll(/\/Info\s+(\d+)\s+\d+\s+R/g)].at(-1)?.[1];
  return { objects, inspectable, infoRef: info === undefined ? null : Number(info) };
}

/**
 * Long-term-validation data added after signing: the revision mentions
 * DSS/VRI and every object it defines is new, except the catalog gaining
 * its /DSS entry (with the same page tree), the Info dictionary and the XMP
 * metadata. Rewriting any existing page, content stream, annotation or
 * field is an edit, whatever else the revision carries. A revision whose
 * object streams cannot be read (encryption) is judged by the DSS/VRI
 * mention alone.
 */
function validationDataOnly(rev, text, known) {
  if (!SIGNATURE_APPENDIX_RE.test(text)) return false;
  if (!rev.inspectable) return true;
  for (const [num, dict] of rev.objects) {
    const before = known.get(num);
    if (before === undefined || num === rev.infoRef || /\/Type\s*\/Metadata\b/.test(dict)) continue;
    if (/\/Type\s*\/Catalog\b/.test(dict) && pagesRef(dict) === pagesRef(before)) continue;
    return false;
  }
  return true;
}

/**
 * Counts saved revisions and relates them to digital signatures.
 *
 * - A linearized ("fast web view") file legitimately has two sections.
 * - A revision whose end is exactly what a signature covers is that
 *   signature being added; one holding only DSS/VRI validation data (see
 *   validationDataOnly) is long-term-validation material added after
 *   signing. Neither is an edit.
 * - A revision after the last signed range that is not validation data, or
 *   stray bytes after the last %%EOF, mean the file changed after it was
 *   signed.
 * @param {Uint8Array} bytes
 */
export function analyzeStructure(bytes) {
  const text = latin1(bytes);
  const sectionEnds = [...text.matchAll(SECTION_RE)].map((m) => m.index + m[0].length);
  const linearized = /\/Linearized\b/.test(text.slice(0, 2048));
  const base = linearized ? 2 : 1;
  const coverageEnds = [...text.matchAll(BYTE_RANGE_RE)]
    .map((m) => m.slice(1, 5).map(Number))
    .filter(([a, b, c, d]) => a === 0 && b > 0 && c > b && d > 0)
    .map(([, , c, d]) => c + d);
  const coversSection = (end) => coverageEnds.some((cov) => cov >= end && cov <= end + 2);

  // Every object defined so far (its latest definition), to tell a
  // revision's new objects from the ones it changes.
  const known = new Map();
  const sections = sectionEnds.map((end, i) => {
    const start = i === 0 ? 0 : sectionEnds[i - 1];
    const body = text.slice(start, end);
    const rev = revisionObjects(body);
    const validationOnly = i >= base && validationDataOnly(rev, body, known);
    for (const [n, d] of rev.objects) known.set(n, d);
    return { start, end, isUpdate: i >= base, validationOnly };
  });
  const unexplainedUpdates = sections.filter((s) => s.isUpdate && !coversSection(s.end) && !s.validationOnly).length;

  let bytesAfterSignature = 0;
  let afterSignature = false;
  if (coverageEnds.length > 0) {
    const signedEnd = Math.max(...coverageEnds);
    const tail = text.slice(signedEnd);
    if (tail.replace(/[\s\0]/g, "").length > 0) {
      bytesAfterSignature = tail.length;
      const later = sections.filter((s) => s.start >= signedEnd - 2);
      const stray = text.slice(sectionEnds.at(-1) ?? 0);
      const hasStray = stray.replace(/[\s\0]/g, "").length > 0;
      afterSignature = later.length === 0 && !hasStray
        ? !SIGNATURE_APPENDIX_RE.test(tail)
        : later.some((s) => !s.validationOnly) || (hasStray && !SIGNATURE_APPENDIX_RE.test(stray));
    }
  }

  return {
    sections: sectionEnds.length,
    linearized,
    incrementalUpdates: Math.max(0, sectionEnds.length - base),
    unexplainedUpdates,
    signed: coverageEnds.length > 0,
    signatureCount: coverageEnds.length,
    bytesAfterSignature,
    afterSignature,
  };
}

// ---------- Active content (pdf-lib object enumeration) ----------

function decodeString(obj) {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText();
  return null;
}

function nameOf(obj) {
  return obj instanceof PDFName ? obj.decodeText() : null;
}

/** The URL a SubmitForm action posts to, when it is an external one. */
function submitTarget(context, value) {
  let target = value instanceof PDFRef ? context.lookup(value) : value;
  if (target instanceof PDFDict) target = target.get(PDFName.of("UF")) ?? target.get(PDFName.of("F"));
  const url = decodeString(target);
  return url && /^(?:https?:|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

function inspectDict(context, dict, found, depth) {
  if (depth > 8) return;
  const action = nameOf(dict.get(PDFName.of("S")));
  if (action === "JavaScript" || dict.has(PDFName.of("JS"))) found.add("javascript");
  if (action === "Launch") found.add("launch_action");
  if (action === "SubmitForm" && submitTarget(context, dict.get(PDFName.of("F")))) found.add("submit_form");
  // Document-level script name tree (Names -> JavaScript).
  if (dict.has(PDFName.of("JavaScript"))) found.add("javascript");
  const type = nameOf(dict.get(PDFName.of("Type")));
  if (dict.has(PDFName.of("EmbeddedFiles")) || type === "EmbeddedFile" || (type === "Filespec" && dict.has(PDFName.of("EF")))) {
    found.add("embedded_file");
  }
  if (nameOf(dict.get(PDFName.of("Subtype"))) === "FileAttachment") found.add("embedded_file");
  // Direct (not indirect) nested dictionaries, e.g. an annotation's /A action.
  for (const [, value] of dict.entries()) {
    if (value instanceof PDFDict) inspectDict(context, value, found, depth + 1);
    else if (value instanceof PDFArray) {
      for (const item of value.asArray()) if (item instanceof PDFDict) inspectDict(context, item, found, depth + 1);
    }
  }
}

// Fallback when pdf-lib cannot parse the file: a raw byte scan. It misses
// anything packed in compressed object streams, so the result is "partial".
const RAW_ACTIVE = [
  ["javascript", /\/S\s*\/JavaScript\b|\/JS\s*[(<\[]|\/JavaScript\s*\d+\s+\d+\s+R/],
  ["launch_action", /\/S\s*\/Launch\b/],
  ["embedded_file", /\/EmbeddedFiles?\b|\/Subtype\s*\/FileAttachment\b/],
  ["submit_form", /\/S\s*\/SubmitForm\b[\s\S]{0,200}?\/F\s*\(\s*(?:https?:|mailto:)/i],
];

export async function scanActiveContent(bytes, { encrypted = false } = {}) {
  const found = new Set();
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      const dict = obj instanceof PDFDict ? obj : obj?.dict instanceof PDFDict ? obj.dict : null;
      if (dict) inspectDict(doc.context, dict, found, 0);
    }
    // An encrypted file's object streams are ciphertext to pdf-lib, so
    // anything inside them was not seen.
    return { variants: [...found], complete: !encrypted };
  } catch {
    const text = latin1(bytes);
    for (const [variant, re] of RAW_ACTIVE) if (re.test(text)) found.add(variant);
    return { variants: [...found], complete: false };
  }
}

// ---------- Operator list walk (pdf.js) ----------

function matrixArg(args) {
  const m = args?.length === 1 ? args[0] : args;
  return m && m.length >= 6 ? Array.from(m).slice(0, 6) : null;
}

function hexColor(args) {
  if (typeof args?.[0] === "string") return args[0].toLowerCase();
  if (args?.length >= 3 && args.every((n) => typeof n === "number")) {
    const to = (n) => Math.max(0, Math.min(255, Math.round(n <= 1 ? n * 255 : n))).toString(16).padStart(2, "0");
    return `#${to(args[0])}${to(args[1])}${to(args[2])}`;
  }
  return "pattern";
}

/** Fill colour classes the detectors need: text on a white page is "white". */
export function fillClass(fill) {
  if (fill === "transparent") return "transparent";
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(fill ?? "");
  if (m && [m[1], m[2], m[3]].every((h) => parseInt(h, 16) >= 242)) return "white";
  return "color";
}

function glyphText(glyphs) {
  if (!Array.isArray(glyphs)) return "";
  let text = "";
  for (const g of glyphs) {
    // TJ spacing: a large negative adjustment is a visual word gap.
    if (typeof g === "number") {
      if (g <= -200) text += " ";
    } else if (g) {
      text += g.isSpace ? " " : (g.unicode ?? "");
    }
  }
  return text;
}

const initialState = () => ({
  ctm: IDENTITY, fill: "#000000", renderMode: 0, font: null, fontSize: 0, tm: IDENTITY, lineX: 0, lineY: 0, x: 0, y: 0, leading: 0, rise: 0, annotation: false,
});

/**
 * Replays the graphics state over pdf.js's operator list and records every
 * image paint (with its CTM) and every text show (with its render mode,
 * font, effective size, fill and position), plus whether any non-white area
 * was filled. Images and text drawn by an annotation's appearance (a stamp,
 * typed-on text, a filled field) are marked `annotation: true`.
 */
export function walkOperatorList({ fnArray, argsArray }, OPS, fontNameOf = (id) => id) {
  const FILL_OPS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke, OPS.rawFillPath]);
  const images = [];
  const runs = [];
  let nonWhiteFill = false;
  let st = initialState();
  const stack = [];
  const save = () => stack.push({ ...st });
  const restore = () => {
    if (stack.length) st = stack.pop();
  };
  const moveText = (x, y) => {
    st.lineX += x;
    st.lineY += y;
    st.x = st.lineX;
    st.y = st.lineY;
  };
  const showText = (glyphs, order) => {
    if (runs.length >= MAX_RUNS_PER_PAGE) return;
    const text = glyphText(glyphs);
    if (text === "") return;
    const m = compose(st.ctm, st.tm);
    const [x, y] = applyPoint(m, st.x, st.y + st.rise);
    runs.push({
      order,
      text: text.slice(0, MAX_RUN_CHARS),
      font: fontNameOf(st.font),
      fontSize: Math.abs(st.fontSize) * Math.hypot(m[2], m[3]),
      renderMode: st.renderMode,
      fill: fillClass(st.fill),
      x,
      y,
      annotation: st.annotation,
    });
  };
  const paint = (order, entry) => images.push({ order, ...entry, annotation: st.annotation });

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    switch (fn) {
      case OPS.save:
        save();
        break;
      case OPS.restore:
        restore();
        break;
      case OPS.transform: {
        const m = matrixArg(args);
        if (m) st.ctm = compose(st.ctm, m);
        break;
      }
      case OPS.paintFormXObjectBegin: {
        save();
        const m = matrixArg(args?.[0] ? [args[0]] : null);
        if (m) st.ctm = compose(st.ctm, m);
        break;
      }
      case OPS.paintFormXObjectEnd:
        restore();
        break;
      case OPS.beginAnnotation: {
        // A viewer draws the appearance over the page from a fresh graphics
        // state, through the annotation's transform (its box onto Rect) and
        // then its appearance /Matrix.
        save();
        let ctm = IDENTITY;
        for (const m of [args?.[2], args?.[3]]) {
          const mm = matrixArg(m ? [m] : null);
          if (mm) ctm = compose(ctm, mm);
        }
        st = { ...initialState(), ctm, annotation: true };
        break;
      }
      case OPS.endAnnotation:
        restore();
        break;
      case OPS.setFillRGBColor:
      case OPS.setFillGray:
      case OPS.setFillCMYKColor:
      case OPS.setFillColor:
        st.fill = fn === OPS.setFillGray && typeof args?.[0] === "number" ? hexColor([args[0], args[0], args[0]]) : hexColor(args);
        break;
      case OPS.setFillColorN:
        st.fill = "pattern";
        break;
      case OPS.setFillTransparent:
        st.fill = "transparent";
        break;
      case OPS.beginText:
        st.tm = IDENTITY;
        st.x = st.y = st.lineX = st.lineY = 0;
        break;
      case OPS.setFont:
        st.font = args?.[0] ?? null;
        st.fontSize = typeof args?.[1] === "number" ? args[1] : 0;
        break;
      case OPS.setTextRenderingMode:
        st.renderMode = args?.[0] ?? 0;
        break;
      case OPS.setTextRise:
        st.rise = args?.[0] ?? 0;
        break;
      case OPS.setLeading:
        st.leading = -(args?.[0] ?? 0);
        break;
      case OPS.setLeadingMoveText:
        st.leading = args?.[1] ?? 0;
        moveText(args?.[0] ?? 0, args?.[1] ?? 0);
        break;
      case OPS.moveText:
        moveText(args?.[0] ?? 0, args?.[1] ?? 0);
        break;
      case OPS.nextLine:
        moveText(0, st.leading);
        break;
      case OPS.setTextMatrix: {
        const m = matrixArg(args);
        if (m) st.tm = m;
        st.x = st.y = st.lineX = st.lineY = 0;
        break;
      }
      case OPS.showText:
      case OPS.showSpacedText:
        showText(args?.[0], i);
        break;
      case OPS.nextLineShowText:
        moveText(0, st.leading);
        showText(args?.[0], i);
        break;
      case OPS.nextLineSetSpacingShowText:
        moveText(0, st.leading);
        showText(args?.[2], i);
        break;
      case OPS.paintImageXObject:
        paint(i, { objId: args[0], widthPx: args[1], heightPx: args[2], ctm: st.ctm, stencil: false });
        break;
      case OPS.paintInlineImageXObject:
        if (args?.[0]) paint(i, { inline: args[0], widthPx: args[0].width, heightPx: args[0].height, ctm: st.ctm, stencil: false });
        break;
      case OPS.paintImageXObjectRepeat: {
        const [objId, sx, sy, positions = []] = args ?? [];
        for (let p = 0; p + 1 < positions.length; p += 2) {
          paint(i, { objId, widthPx: null, heightPx: null, ctm: compose(st.ctm, [sx, 0, 0, sy, positions[p], positions[p + 1]]), stencil: false });
        }
        break;
      }
      case OPS.paintImageMaskXObject:
        if (args?.[0]) paint(i, { widthPx: args[0].width, heightPx: args[0].height, ctm: st.ctm, stencil: true });
        break;
      case OPS.constructPath:
        if (FILL_OPS.has(args?.[0]) && fillClass(st.fill) === "color" && !st.annotation) nonWhiteFill = true;
        break;
      case OPS.shadingFill:
        if (!st.annotation) nonWhiteFill = true;
        break;
      default:
        if (FILL_OPS.has(fn) && fillClass(st.fill) === "color" && !st.annotation) nonWhiteFill = true;
    }
  }
  return { images, runs, nonWhiteFill };
}

const isVisibleRun = (r) => r.renderMode !== 3 && r.renderMode !== 7 && r.fill === "color" && !r.coveredByScan;
const nonSpaceLength = (s) => s.replace(/\s/g, "").length;
const inside = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

function resolveObject(page, objId) {
  const store = objId.startsWith("g_") ? page.commonObjs : page.objs;
  return Promise.race([
    new Promise((resolve) => {
      try {
        store.get(objId, resolve);
      } catch {
        resolve(null);
      }
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), IMAGE_RESOLVE_TIMEOUT_MS).unref()),
  ]);
}

async function imageData(page, img) {
  if (img.inline) return img.inline;
  if (!img.objId) return null;
  const data = await resolveObject(page, img.objId);
  return data?.data ? data : null;
}

/**
 * Geometry for one page: which image is the scan, whether the page is a scan
 * at all, and which images were drawn on top of it. The page itself (scan,
 * scan-or-designed, OCR photos) is judged from its content alone;
 * annotations only add what is drawn on top of it.
 */
function classifyPage(view, walked) {
  const pageArea = Math.max(1, (view[2] - view[0]) * (view[3] - view[1]));
  const placed = walked.images.map((img) => {
    const p = placementFromCtm(img.ctm);
    return { ...img, ...p, coverage: coverage(p.bbox, view) };
  });
  const content = placed.filter((p) => !p.annotation);
  // The background scan is the first full-page raster painted. Further
  // full-page layers (mixed-raster-content "compact" scans) are not overlays.
  const scan = content.filter((p) => !p.stencil && p.coverage >= FULL_PAGE_COVERAGE).sort((a, b) => a.order - b.order)[0] ?? null;
  // Text painted BEFORE the scan, where the scan then covers it, cannot be
  // seen: OCR software's "text under the page image" mode writes its text
  // layer this way, in the ordinary visible render mode.
  if (scan) for (const r of walked.runs) r.coveredByScan = r.order < scan.order && inside(scan.bbox, r.x, r.y);
  // Text over a sizeable image: when invisible, that is the image's OCR layer.
  const photos = content.filter((p) => !p.stencil && p.coverage >= OCR_IMAGE_MIN_COVERAGE);
  for (const r of walked.runs) r.overImage = photos.some((p) => inside(p.bbox, r.x, r.y));
  const visibleChars = walked.runs.filter((r) => !r.annotation && isVisibleRun(r)).reduce((n, r) => n + nonSpaceLength(r.text), 0);
  // A full-page image under lots of real text is a designed background
  // (letterhead, Canva export), not a scan.
  const isScanPage = Boolean(scan) && visibleChars <= SCAN_MAX_VISIBLE_CHARS;
  const candidates = isScanPage
    ? placed.filter((p) => p !== scan && p.order > scan.order && p.coverage < FULL_PAGE_COVERAGE &&
        intersects(p.bbox, scan.bbox) &&
        ((p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1])) / pageArea >= OVERLAY_MIN_AREA)
    : [];
  return { placed, scan, visibleChars, isScanPage, candidates };
}

async function describeOverlays(page, pageNo, cls, previewPool) {
  const scanDpi = effectiveDpi(cls.scan.widthPx, cls.scan.heightPx, cls.scan.widthPt, cls.scan.heightPt);
  const overlays = [];
  for (const c of cls.candidates) {
    const data = c.stencil ? null : await imageData(page, c);
    const widthPx = c.widthPx ?? data?.width ?? null;
    const heightPx = c.heightPx ?? data?.height ?? null;
    if (!(widthPx >= OVERLAY_MIN_PIXELS && heightPx >= OVERLAY_MIN_PIXELS)) continue;
    const dpi = effectiveDpi(widthPx, heightPx, c.widthPt, c.heightPt);
    const lowRes = dpi !== null && scanDpi !== null && dpi < LOW_RES_RATIO * scanDpi;
    // Stencil masks at or above the scan's resolution are how scanners'
    // compact (MRC) mode stores sharp text over a low-res background.
    if (c.stencil && !lowRes) continue;
    const alpha = data?.kind === 3 ? alphaStats(data.data, widthPx, heightPx) : { transparentShare: 0, hardEdgeRatio: null };
    const overlay = {
      page: pageNo,
      widthPx,
      heightPx,
      effectiveDpi: dpi,
      backgroundDpi: scanDpi,
      stencil: c.stencil,
      transparentShare: alpha.transparentShare,
      hardEdgeRatio: alpha.hardEdgeRatio,
      previewKey: null,
    };
    if (data && (data.kind === 2 || data.kind === 3) && previewPool.length < MAX_PREVIEW_CANDIDATES && widthPx * heightPx <= 16_000_000) {
      overlay.previewKey = `p${pageNo}-${overlays.length}`;
      previewPool.push({ key: overlay.previewKey, overlay, width: widthPx, height: heightPx, channels: data.kind === 3 ? 4 : 3, data: data.data.slice().buffer });
    }
    overlays.push(overlay);
  }
  return overlays;
}

/** Most telling overlays first: transparent, then most upscaled. */
function previewRank(o) {
  const ratio = o.effectiveDpi && o.backgroundDpi ? o.effectiveDpi / o.backgroundDpi : 1;
  return (o.transparentShare >= 0.01 ? 0 : 10) + ratio;
}

async function withPage(pdf, pageNo, fn) {
  const page = await pdf.getPage(pageNo);
  try {
    return await fn(page);
  } finally {
    page.cleanup();
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<object>} facts (see detectors.js), with transferable pixel buffers in
 *   `previews` and `ocrImages`
 */
export async function inspectPdf(bytes) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument(pdfjsOptions(bytes.slice()));
  let pdf;
  try {
    pdf = await task.promise;
  } catch (err) {
    await task.destroy().catch(() => {});
    if (err?.name === "PasswordException") throw new DocumentInspectError("encrypted");
    throw new DocumentInspectError("unreadable", err?.message);
  }

  try {
    const { info = {}, metadata } = await pdf.getMetadata().catch(() => ({}));
    const xmp = (key) => {
      try {
        return metadata?.get(key) ?? null;
      } catch {
        return null;
      }
    };
    const encrypted = Boolean(info.EncryptFilterName);
    const facts = {
      fileType: "pdf",
      pageCount: pdf.numPages,
      pagesAnalyzed: Math.min(pdf.numPages, MAX_PAGES),
      encrypted,
      metadata: {
        producer: sanitizeMeta(info.Producer),
        creator: sanitizeMeta(info.Creator),
        created: parsePdfDate(info.CreationDate),
        modified: parsePdfDate(info.ModDate),
        xmpProducer: sanitizeMeta(xmp("pdf:producer")),
        xmpCreatorTool: sanitizeMeta(xmp("xmp:creatortool")),
        xmpCreated: parseIsoDate(xmp("xmp:createdate")),
        xmpModified: parseIsoDate(xmp("xmp:modifydate")),
      },
      structure: analyzeStructure(bytes),
      activeContent: await scanActiveContent(bytes, { encrypted }),
      pages: [],
      text: "",
      previews: [],
      ocrImages: [],
    };

    const fontNames = new Map();
    const textParts = [];
    const previewPool = [];
    for (let n = 1; n <= facts.pagesAnalyzed; n++) {
      await withPage(pdf, n, async (page) => {
        const content = await page.getTextContent();
        textParts.push(content.items.map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : "")).join(""));

        // Annotations included: a signature stamp or typed-on text added in
        // Preview, Acrobat or an online editor is drawn over the page too.
        const ol = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.ENABLE });
        const fontNameOf = (id) => {
          if (!id) return null;
          if (!fontNames.has(id)) {
            let name = id;
            try {
              name = page.commonObjs.get(id)?.name || id;
            } catch {
              /* font not resolved: keep its internal id */
            }
            fontNames.set(id, name);
          }
          return fontNames.get(id);
        };
        const walked = walkOperatorList(ol, pdfjs.OPS, fontNameOf);
        const cls = classifyPage(page.view, walked);
        facts.pages.push({
          page: n,
          scan: cls.scan
            ? { widthPx: cls.scan.widthPx, heightPx: cls.scan.heightPx, dpi: effectiveDpi(cls.scan.widthPx, cls.scan.heightPx, cls.scan.widthPt, cls.scan.heightPt) }
            : null,
          isScanPage: cls.isScanPage,
          imageCount: cls.placed.filter((p) => !p.annotation).length,
          nonWhiteFill: walked.nonWhiteFill,
          visibleChars: cls.visibleChars,
          overlays: cls.isScanPage ? await describeOverlays(page, n, cls, previewPool) : [],
          runs: walked.runs,
        });
      });
    }
    facts.text = textParts.join("\n\n").trim();

    // Only the most telling overlays' pixels leave the worker.
    const chosen = [...previewPool].sort((a, b) => previewRank(a.overlay) - previewRank(b.overlay)).slice(0, MAX_PREVIEWS);
    for (const p of previewPool) if (!chosen.includes(p)) p.overlay.previewKey = null;
    facts.previews = chosen.map(({ key, width, height, channels, data }) => ({ key, width, height, channels, data }));

    // No usable text layer: hand the first scans to OCR (greyscale pixels).
    const realChars = (facts.text.match(/[\p{L}\p{N}]/gu) ?? []).length;
    if (realChars < TEXT_LAYER_MIN_CHARS) {
      for (const p of facts.pages.filter((pg) => pg.scan).slice(0, OCR_MAX_PAGES)) {
        await withPage(pdf, p.page, async (page) => {
          const ol = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
          const cls = classifyPage(page.view, walkOperatorList(ol, pdfjs.OPS));
          const data = cls.scan ? await imageData(page, cls.scan) : null;
          if (!data) return;
          const gray = toGray(data.data, data.kind, data.width, data.height);
          facts.ocrImages.push({ page: p.page, width: data.width, height: data.height, data: gray.buffer });
        });
      }
    }
    return facts;
  } catch (err) {
    if (err instanceof DocumentInspectError) throw err;
    throw new DocumentInspectError("unreadable", err?.message);
  } finally {
    await task.destroy().catch(() => {});
  }
}
