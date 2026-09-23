// Magic-byte type detection for uploaded documents. The client's file name
// and MIME type are never trusted (see checklist.md "Restrict file uploads");
// only the bytes decide what gets parsed.

export const CFB_MAGIC = Object.freeze([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function startsWith(bytes, magic) {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

/**
 * "pdf" (%PDF-), "zip" (a possible DOCX - confirmed later from its
 * [Content_Types].xml), "cfb" (legacy Office / password-encrypted Office), or null.
 * @param {Uint8Array} bytes
 */
export function sniffDocumentType(bytes) {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (startsWith(bytes, CFB_MAGIC)) return "cfb";
  return null;
}

/**
 * Password-protected .docx files are not ZIPs: Office wraps the encrypted
 * package in a compound file whose directory names an "EncryptedPackage"
 * stream (stored as UTF-16LE).
 */
export function isEncryptedOfficeFile(bytes) {
  const needle = Buffer.from("EncryptedPackage", "utf16le");
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).includes(needle);
}

export class DocumentInspectError extends Error {
  /** @param {"unsupported"|"encrypted"|"unreadable"} code */
  constructor(code, detail) {
    super(`document ${code}${detail ? `: ${detail}` : ""}`);
    this.name = "DocumentInspectError";
    this.code = code;
  }
}
