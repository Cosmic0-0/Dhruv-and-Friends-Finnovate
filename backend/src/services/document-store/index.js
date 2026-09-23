import { randomUUID, createHash } from "node:crypto";
import { insertDocument, getDocument } from "../../db/index.js";
import { extractTextFromImage } from "../ocr/index.js";

/**
 * Byte-exact document ingestion. This is the fix for the root-cause problem
 * with the old screenshot-only pipeline: a screenshot is a re-render and
 * re-encode, which strips EXIF, strips JPEG compression history, and (for a
 * PDF) discards the file's internal structure entirely. Forgery forensics
 * (services/document-forensics, called separately) needs the exact bytes the
 * browser sent, so this module never decodes, re-renders, or re-compresses
 * what it stores - it only sniffs the type and computes a digest, both of
 * which read the buffer without altering it.
 */

// %PDF- header, plus the existing screenshot route's PNG/JPEG/WEBP
// signatures (kept here, independently, rather than importing the
// screenshot route's private sniffer - that route is a separate,
// already-shipped feature this work must not touch).
const SIGNATURES = [
  { mimeType: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mimeType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
];

export function sniffDocumentType(buffer) {
  for (const { mimeType, bytes } of SIGNATURES) {
    if (buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b)) return mimeType;
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Stores `buffer` exactly as received. Returns the stored record's metadata
 * (never the bytes themselves - callers that need the bytes back call
 * getStoredDocument, which is the same read path forensics uses, so there is
 * one code path proving "what's stored is what's read").
 * @param {{ buffer: Buffer, sourceChannel: string, originalFilename?: string }} input
 */
export function ingestDocument({ buffer, sourceChannel, originalFilename }) {
  const mimeType = sniffDocumentType(buffer);
  if (!mimeType) return { error: "unsupported_type" };

  const id = randomUUID();
  const receivedAt = new Date().toISOString();
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  insertDocument({
    id,
    receivedAt,
    sourceChannel,
    originalFilename: originalFilename ?? null,
    mimeType,
    byteLength: buffer.length,
    sha256,
    bytes: buffer,
  });

  return { id, receivedAt, sourceChannel, mimeType, byteLength: buffer.length, sha256 };
}

/** Reads a document back exactly as stored - the same bytes, unmodified. */
export function getStoredDocument(id) {
  return getDocument(id);
}

/**
 * Text/entity extraction, kept separate from ingestion and from forensics.
 * Reads the stored original (never a re-encoded copy) and OCRs it. PDFs are
 * out of scope here: their text layer (or lack of one, the classic
 * pasted-text-over-a-scan tell) is read by the metadata/PDF forensics check
 * (services/document-forensics, pdfplumber) rather than duplicated in Node.
 * @param {string} id
 * @returns {Promise<string | null>} null when the document has no OCR-able
 *   image content (e.g. it's a PDF) rather than throwing.
 */
export async function extractDocumentText(id) {
  const doc = getStoredDocument(id);
  if (!doc) throw new Error(`extractDocumentText: no document stored with id ${id}`);
  if (!IMAGE_MIME_TYPES.has(doc.mimeType)) return null;
  return extractTextFromImage(doc.bytes);
}
