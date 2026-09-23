import CheckDocumentScreen from "@/components/document/CheckDocumentScreen";

export const metadata = {
  title: "Check a document",
  description: "Check a PDF or Word file for signs of forgery, such as pasted-on signatures or text typed onto a scan, before you act on it.",
  alternates: { canonical: "/document" },
};

/**
 * Document forensics entry point (Check Document.dc.html): a PDF/DOCX goes to
 * POST /api/analyze/document and the result renders inline - see
 * components/document/CheckDocumentScreen.tsx.
 */
export default function DocumentPage() {
  return (
    <main>
      <CheckDocumentScreen />
    </main>
  );
}
