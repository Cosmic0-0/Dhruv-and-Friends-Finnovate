// Dispatches an untrusted upload to the right parser by its magic bytes
// alone. Runs inside the document worker (worker.js).

import { inspectDocx } from "./docx.js";
import { inspectPdf } from "./pdf.js";
import { DocumentInspectError, isEncryptedOfficeFile, sniffDocumentType } from "./sniff.js";

/** @param {Uint8Array} bytes */
export async function inspectDocument(bytes) {
  switch (sniffDocumentType(bytes)) {
    case "pdf":
      return inspectPdf(bytes);
    case "zip":
      return inspectDocx(bytes);
    case "cfb":
      // Legacy .doc, or a password-protected Office file (not a ZIP at all).
      throw new DocumentInspectError(isEncryptedOfficeFile(bytes) ? "encrypted" : "unsupported");
    default:
      throw new DocumentInspectError("unsupported");
  }
}
