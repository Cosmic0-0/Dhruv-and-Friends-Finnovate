/**
 * Client-side screenshot compression before upload: downscale so the longest
 * edge is at most 1600px and re-encode as JPEG ~0.8. A raw phone screenshot
 * is several MB and makes server-side OCR crawl. Canvas only, no dependency.
 * This only shrinks the image; the text is read by the backend's OCR service.
 */

export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.8;
/** Refuse absurd files before decoding them into memory (the upload limit applies after compression). */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export type ImageErrorCode = "not_image" | "too_large" | "unreadable";

export class ImageError extends Error {
  // Plain field (not a constructor parameter property) so Node's type stripping can run the tests.
  code: ImageErrorCode;
  constructor(code: ImageErrorCode) {
    super(code);
    this.code = code;
  }
}

/** Target size fitting `max` on the longest edge; never upscales. Pure, unit-tested. */
export function fitWithin(width: number, height: number, max: number = MAX_EDGE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new ImageError("unreadable");
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface CompressedImage {
  blob: Blob;
  /** `data:image/jpeg;base64,…`, which the screenshot endpoint accepts as-is. */
  dataUrl: string;
  width: number;
  height: number;
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  // createImageBitmap applies EXIF orientation (photos taken sideways on a phone).
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageError("unreadable");
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError("unreadable"));
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) throw new ImageError("not_image");
  if (file.size > MAX_SOURCE_BYTES) throw new ImageError("too_large");

  const decoded = await decode(file);
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("unreadable");
    // JPEG has no transparency: paint white first so transparent PNG areas don't turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new ImageError("unreadable");
    return { blob, dataUrl: await blobToDataUrl(blob), width, height };
  } finally {
    decoded.close();
  }
}
