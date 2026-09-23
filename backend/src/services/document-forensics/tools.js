// Consumer editing and design tools whose name in a document's producer /
// creator metadata is a weak warning sign (DOC-01) on a document that claims
// to be official: bank forms, statements and payment confirmations come out
// of the issuer's own systems, not out of an online PDF editor.
//
// Review policy for this list: only tools a member of the public uses to
// EDIT an existing document or to design one from scratch. Never add office
// suites (Word, LibreOffice, Pages), scanner firmware or print drivers
// (Canon, HP, Xerox, "Microsoft: Print To PDF") or PDF libraries that real
// document systems use (iText, PDFBox, pdf-lib, Aspose, wkhtmltopdf) - they
// produce most legitimate documents, so flagging them would be noise.
export const CONSUMER_EDITING_TOOLS = Object.freeze([
  { name: "Canva", pattern: /\bcanva\b/i },
  { name: "iLovePDF", pattern: /\bilovepdf\b/i },
  { name: "Smallpdf", pattern: /\bsmallpdf\b/i },
  { name: "Sejda", pattern: /\bsejda\b/i },
  { name: "PDFescape", pattern: /\bpdf\s?escape\b/i },
  { name: "PDF24", pattern: /\bpdf24\b/i },
  { name: "PDF Candy", pattern: /\bpdf\s?candy\b/i },
  { name: "Soda PDF", pattern: /\bsoda\s?pdf\b/i },
  { name: "PDF2Go", pattern: /\bpdf2go\b/i },
  { name: "Online2PDF", pattern: /\bonline2pdf\b/i },
  { name: "DocHub", pattern: /\bdochub\b/i },
  { name: "pdfFiller", pattern: /\bpdf\s?filler\b/i },
  { name: "Adobe Photoshop", pattern: /\bphotoshop\b/i },
  { name: "GIMP", pattern: /\bgimp\b/i },
  { name: "Paint.NET", pattern: /\bpaint\.net\b/i },
  { name: "Photopea", pattern: /\bphotopea\b/i },
  { name: "Pixlr", pattern: /\bpixlr\b/i },
]);

/** Names of the listed tools mentioned in a metadata value (empty when none). */
export function matchEditingTools(value) {
  if (typeof value !== "string" || value === "") return [];
  return CONSUMER_EDITING_TOOLS.filter((t) => t.pattern.test(value)).map((t) => t.name);
}
