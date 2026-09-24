import type { AnalyzeScreenshotPayload } from "./types";

// Mirrors the backend's exact 5MB decoded limit (docs/API-CONTRACT.md,
// POST /api/analyze/screenshot). This is a client-side sanity check only -
// the backend is the real gate, including the magic-byte type sniff.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class ScreenshotInputError extends Error {}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ScreenshotInputError("That file could not be read. Try a different image."));
    reader.readAsDataURL(file);
  });
}

/**
 * Turns a user-picked file into the screenshot request body. Only a shallow
 * sanity check happens here (declared MIME type and raw byte size) so an
 * obviously wrong pick fails fast without a round trip; the backend sniffs
 * the actual bytes and enforces the real limit.
 */
export async function buildScreenshotPayload(file: File): Promise<AnalyzeScreenshotPayload> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new ScreenshotInputError("Choose a PNG, JPEG, or WEBP image.");
  if (file.size > MAX_IMAGE_BYTES) throw new ScreenshotInputError("That image is larger than 5MB. Choose a smaller screenshot.");
  const image = await readAsDataUrl(file);
  return { image };
}
