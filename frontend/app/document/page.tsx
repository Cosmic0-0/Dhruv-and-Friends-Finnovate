import DocumentCheck from "@/components/document/DocumentCheck";

export const metadata = {
  title: "Check a document",
  description: "Check a PDF or Word file for signs of forgery, such as pasted-on signatures or text typed onto a scan, before you act on it.",
  alternates: { canonical: "/document" },
};

/**
 * Document forensics entry point: a PDF/DOCX goes to
 * POST /api/analyze/document and the result opens on the normal /result
 * screen with its "Document integrity" panel. The heading and copy live in
 * DocumentCheck (a client component), which reads the current language.
 */
export default function DocumentPage() {
  return (
    <main>
      <DocumentCheck />
    </main>
  );
}
