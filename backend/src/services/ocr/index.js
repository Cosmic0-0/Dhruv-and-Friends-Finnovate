import { createWorker } from "tesseract.js";

/**
 * Extracts and cleans text from a screenshot image buffer.
 * @param {Buffer} imageBuffer
 * @returns {Promise<string>}
 */
export async function extractTextFromImage(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("extractTextFromImage: imageBuffer must be a non-empty Buffer");
  }

  // No dedicated Tesseract pack for Kreol Morisyen; eng+fra covers its Latin-script
  // text well enough for OCR since the language layer (services/nlp) handles it downstream.
  const worker = await createWorker("eng+fra");
  try {
    const {
      data: { text },
    } = await worker.recognize(imageBuffer);
    return cleanExtractedText(text);
  } finally {
    await worker.terminate();
  }
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
