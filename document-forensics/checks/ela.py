"""Stage 2: Error Level Analysis. CPU only, no model.

STUB - see document-forensics/README.md "Implementation status". Same
interface as checks/metadata_pdf.py:

    def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult

Scope for the real implementation:
  - Re-save the image at a fixed JPEG quality (Pillow) and diff against the
    original to surface regions with inconsistent compression history - a
    region pasted in from a different source (or from a screenshot/re-save)
    carries a different error-level signature than the rest of the image.
  - Only meaningful on images with real JPEG history. Skip (return a CLEAN
    or better an explicit "not applicable" - see the orchestrator's
    is_ela_applicable()) for:
      - PNG/WEBP input with no JPEG generation in its history.
      - Born-digital PDFs with no JPEG history at all (context should carry
        whatever checks/metadata_pdf.py determined about this - read
        context.get("has_jpeg_recompression_history")).
  - For a PDF that DOES contain embedded JPEG images (e.g. a scanned page),
    run ELA on the extracted image(s), not on a rasterized re-render of the
    whole page.
"""

from __future__ import annotations

from app.models import CheckResult, CheckStatus


def is_applicable(mime_type: str, context: dict) -> bool:
    """Whether ELA can say anything meaningful about this document at all -
    used by the orchestrator to skip it outright (recorded in
    checks_skipped) rather than running it and reporting a vacuous CLEAN."""
    raise NotImplementedError("checks/ela.py: applicability check not yet implemented")


def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult:
    raise NotImplementedError("checks/ela.py: error level analysis not yet implemented")
