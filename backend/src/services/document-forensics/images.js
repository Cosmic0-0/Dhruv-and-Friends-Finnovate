// Main-thread image work for document forensics, all in memory with sharp:
// small overlay previews for the UI, alpha facts for DOCX pictures, and
// greyscale scans encoded for OCR. Inputs are capped (limitInputPixels) so a
// decompression bomb cannot make sharp allocate unbounded memory.

import sharp from "sharp";
import { alphaStats } from "./overlay.js";

/** Longest side of a preview, in pixels. Previews are never enlarged. */
export const PREVIEW_MAX_PX = 256;
const PREVIEW_INPUT_PIXELS = 16_000_000;
const OCR_INPUT_PIXELS = 40_000_000;

async function toDataUrl(pipeline) {
  // Nearest-neighbour keeps hard, pixelated edges visible - the evidence.
  const png = await pipeline
    .resize({ width: PREVIEW_MAX_PX, height: PREVIEW_MAX_PX, fit: "inside", withoutEnlargement: true, kernel: "nearest" })
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Preview of raw decoded pixels (RGB or RGBA) from the PDF worker. */
export function rawPreview({ width, height, channels, data }) {
  return toDataUrl(sharp(Buffer.from(data), { raw: { width, height, channels }, limitInputPixels: PREVIEW_INPUT_PIXELS }));
}

/** Alpha facts + preview for an encoded image (DOCX PNG). */
export async function encodedImageFacts(bytes) {
  const { data, info } = await sharp(Buffer.from(bytes), { limitInputPixels: PREVIEW_INPUT_PIXELS })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stats = alphaStats(data, info.width, info.height);
  const preview = await rawPreview({ width: info.width, height: info.height, channels: 4, data });
  return { widthPx: info.width, heightPx: info.height, ...stats, preview };
}

/** A greyscale scan from the PDF worker, as a PNG for the OCR service. */
export function grayToPng({ width, height, data }) {
  return sharp(Buffer.from(data), { raw: { width, height, channels: 1 }, limitInputPixels: OCR_INPUT_PIXELS }).png().toBuffer();
}
