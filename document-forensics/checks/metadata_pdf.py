"""Stage 1: metadata/PDF forensics. CPU only, no model.

STUB - see document-forensics/README.md "Implementation status". Each
check module exposes exactly one function:

    def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult

`context` is a plain dict the orchestrator threads through every check in
order; a check may read what an earlier check wrote and may write its own
keys for later checks to read (e.g. this check should set
context["has_jpeg_recompression_history"] so checks/ela.py can decide
whether ELA is meaningful at all - see that module's own docstring).

Scope for the real implementation:
  - Images: EXIF inspection (Pillow's Image.getexif() /
    piexif) - inconsistent/missing/stripped EXIF, timestamp anomalies.
  - PDFs (pikepdf): incremental-update chain length and what changed
    between revisions, embedded font list consistency, creation vs.
    modification metadata.
  - PDFs (pdfplumber): mismatches between the actual text layer and
    rendered glyph positions - the classic tell for a text box pasted over
    a scanned letterhead (a real text run whose bounding box doesn't align
    with anything on the rendered page, or a page with images but zero
    extractable text where the surrounding pages have a text layer).
  - Also owns the signature-region heuristic + stroke-width/pressure
    internal-consistency check (see app/models.py's SignatureReport) - it's
    CPU-only image analysis, same cost class as everything else here, and
    a natural companion to this check's PDF/image handling.
"""

from __future__ import annotations

from app.models import CheckResult, CheckStatus


def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult:
    raise NotImplementedError("checks/metadata_pdf.py: metadata/PDF forensics not yet implemented")


def find_signature_region(file_bytes: bytes, mime_type: str, context: dict):
    """Returns a bounding box / crop for a candidate signature region, or
    None. Deliberately separate from `run()`'s return value - see
    app/models.py's SignatureReport for why this must stay a narrower,
    clearly-labeled claim than the rest of the report."""
    raise NotImplementedError("checks/metadata_pdf.py: signature-region detection not yet implemented")
