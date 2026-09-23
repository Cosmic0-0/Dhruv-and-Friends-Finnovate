import { createWorker } from "tesseract.js";
import sharp from "sharp";

// Screenshots often carry white-on-color call-to-action buttons ("Confirm Your
// Information", "Reactivate Now") — exactly the text most worth reading in a
// scam message. Tesseract reads dark-text-on-light reliably but regularly
// misses light-text-on-dark, so we OCR two variants of the same image and
// merge what each one found instead of trying to detect button regions.
//
// A plain min/max normalize() isn't enough: a brand-blue button fill (e.g.
// rgb(21,158,221)) lands right around luminosity 124 — too close to a
// saturated page background's luminosity for a global linear stretch to
// separate them, so the button stays a similar gray to its own text. A hard
// threshold pushes each pixel fully black or white first, which reliably
// separates a solid-color button fill from white text/background even when
// their grayscale luminosities are close.
const UPSCALE_MAX_WIDTH = 1600;
const BUTTON_PASS_THRESHOLD = 190;

/**
 * Extracts and cleans text from a screenshot image buffer.
 * @param {Buffer} imageBuffer
 * @returns {Promise<string>}
 */
export async function extractTextFromImage(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("extractTextFromImage: imageBuffer must be a non-empty Buffer");
  }

  const { normal, inverted } = await preprocessForOcr(imageBuffer);

  // No dedicated Tesseract pack for Kreol Morisyen; eng+fra covers its Latin-script
  // text well enough for OCR since the language layer (services/nlp) handles it downstream.
  const worker = await createWorker("eng+fra");
  try {
    const [normalResult, invertedResult] = await Promise.all([
      worker.recognize(normal),
      worker.recognize(inverted),
    ]);
    return mergeOcrPasses(normalResult.data.text, invertedResult.data.text);
  } finally {
    await worker.terminate();
  }
}

/**
 * Produces two OCR-ready variants of the source image: a normalized
 * grayscale pass (best for ordinary dark-on-light text) and an inverted
 * pass (best for light-on-dark text, e.g. a solid-color CTA button).
 * Both are upscaled when small, since Tesseract accuracy drops on the
 * low-resolution text common in phone-screenshot crops.
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ normal: Buffer, inverted: Buffer }>}
 */
async function preprocessForOcr(imageBuffer) {
  const base = sharp(imageBuffer).rotate();
  const metadata = await base.metadata();
  const shouldUpscale = (metadata.width ?? 0) > 0 && metadata.width < UPSCALE_MAX_WIDTH;
  const resizeOptions = shouldUpscale ? { width: UPSCALE_MAX_WIDTH } : null;

  const applyResize = (pipeline) => (resizeOptions ? pipeline.resize(resizeOptions) : pipeline);

  const [normal, inverted] = await Promise.all([
    // Ordinary dark-text-on-light content: a linear contrast stretch is enough.
    applyResize(sharp(imageBuffer).rotate()).grayscale().normalize().toBuffer(),
    // Solid-color button/banner content: binarize first so a mid-luminosity
    // brand color is pushed fully to one side before inverting, then invert
    // so the button's fill becomes white and its text becomes dark — the
    // orientation Tesseract reads reliably.
    applyResize(sharp(imageBuffer).rotate())
      .grayscale()
      .threshold(BUTTON_PASS_THRESHOLD)
      .negate({ alpha: false })
      .toBuffer(),
  ]);

  return { normal, inverted };
}

/**
 * Combines the normal-pass and inverted-pass OCR output into one text
 * block: lines already found by the normal pass are kept as-is (and in
 * their original order/layout), and any additional lines the inverted
 * pass alone found (e.g. a button's white-on-color label) are appended.
 * @param {string} normalText
 * @param {string} invertedText
 * @returns {string}
 */
export function mergeOcrPasses(normalText, invertedText) {
  const normalLines = cleanExtractedText(normalText).split("\n").filter(Boolean);
  const invertedLines = cleanExtractedText(invertedText).split("\n").filter(Boolean);

  const seen = new Set(normalLines.map((line) => line.toLowerCase()));
  const extraLines = invertedLines.filter((line) => !seen.has(line.toLowerCase()));

  return [...normalLines, ...extraLines].join("\n").trim();
}

/**
 * Normalizes raw OCR output before it enters the analysis pipeline:
 * collapses whitespace/blank lines OCR tends to introduce around
 * detected text blocks.
 * @param {string} rawText
 * @returns {string}
 */
export function cleanExtractedText(rawText) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}
