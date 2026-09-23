"""Fixture-based tests for checks/ela.py - same "small number of fixed,
deterministic, offline fixtures" convention used elsewhere in this repo
(see backend/src/services/site-security/index.test.js's header comment):
no network, no model downloads, everything here runs from bytes on disk or
built in-memory with Pillow/pikepdf.

tests/fixtures/ela_clean.jpg and tampered.jpg are pre-generated (not built
at test time) so the "tampered" fixture's construction - splicing a block of
never-before-JPEG-compressed random noise into an already-twice-quality-90
-compressed background, then saving once more at quality 90 - is fixed and
reviewable rather than regenerated (and potentially drifting) on every run.
ela_clean.jpg is this check's own baseline fixture, distinct from
fixtures/clean.jpg (stage 1's EXIF-bearing fixture, reused from
backend/src/services/document-store/fixtures/clean.jpg) - the two checks
need different properties from a "clean" JPEG (EXIF content vs. compression
history), so they don't share one file.
The PDF-with-embedded-JPEG case is built in-memory instead: it's just
tampered.jpg's bytes wrapped in a minimal PDF image XObject, so there is no
value in also checking in a redundant binary for it.
"""

from __future__ import annotations

from pathlib import Path

import pikepdf
import pytest

from app.models import CheckStatus
from checks import ela

FIXTURES = Path(__file__).parent / "fixtures"


def _read(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _pdf_with_embedded_jpeg(jpeg_bytes: bytes, size: int = 256) -> bytes:
    """Minimal one-page PDF whose sole content is `jpeg_bytes` embedded as
    a DCTDecode image XObject - a stand-in for a scanned page."""
    pdf = pikepdf.Pdf.new()
    page = pdf.add_blank_page(page_size=(size, size))
    image_stream = pikepdf.Stream(pdf, jpeg_bytes)
    image_stream.Type = pikepdf.Name("/XObject")
    image_stream.Subtype = pikepdf.Name("/Image")
    image_stream.Width = size
    image_stream.Height = size
    image_stream.BitsPerComponent = 8
    image_stream.ColorSpace = pikepdf.Name("/DeviceRGB")
    image_stream.Filter = pikepdf.Name("/DCTDecode")
    page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary({"/Im0": image_stream}))
    page.Contents = pikepdf.Stream(pdf, f"q {size} 0 0 {size} 0 0 cm /Im0 Do Q".encode())
    import io

    out = io.BytesIO()
    pdf.save(out)
    pdf.close()
    return out.getvalue()


# --- is_applicable() --------------------------------------------------


def test_jpeg_is_always_applicable():
    assert ela.is_applicable("image/jpeg", {}) is True


@pytest.mark.parametrize("mime_type", ["image/png", "image/webp", "application/octet-stream"])
def test_non_jpeg_image_types_are_not_applicable(mime_type):
    assert ela.is_applicable(mime_type, {}) is False


def test_pdf_with_no_jpeg_history_is_not_applicable():
    assert ela.is_applicable("application/pdf", {"has_jpeg_recompression_history": False}) is False


def test_pdf_with_jpeg_history_is_applicable():
    assert ela.is_applicable("application/pdf", {"has_jpeg_recompression_history": True}) is True


def test_pdf_with_missing_context_key_defaults_to_not_applicable():
    # metadata_pdf.py (a different, parallel check) is expected to set this
    # key; if it hasn't landed yet, or used a different key name, we must
    # not assume applicability - see checks/ela.py's module docstring.
    assert ela.is_applicable("application/pdf", {}) is False
    assert ela.is_applicable("application/pdf", {"some_other_key": True}) is False


# --- run() on plain JPEG images ----------------------------------------


def test_clean_jpeg_reports_no_suspicious_indicator():
    result = ela.run(_read("ela_clean.jpg"), "image/jpeg", {})
    assert result.status in (CheckStatus.CLEAN, CheckStatus.INCONCLUSIVE)
    assert result.status != CheckStatus.SUSPICIOUS
    assert result.indicators == []


def test_tampered_jpeg_flags_the_pasted_region():
    result = ela.run(_read("tampered.jpg"), "image/jpeg", {})
    assert result.status == CheckStatus.SUSPICIOUS
    assert len(result.indicators) == 1
    indicator = result.indicators[0]
    assert indicator.confidence is not None
    # Evidence should point at the actual anomalous block region, not just
    # restate the title (see app/models.py's Indicator.evidence docstring).
    assert "block grid" in indicator.evidence


def test_unreadable_bytes_are_inconclusive_not_a_crash():
    result = ela.run(b"not a real jpeg", "image/jpeg", {})
    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []


def test_tiny_image_is_inconclusive():
    # Too small for a meaningful block grid (_MIN_BLOCKS_FOR_ANALYSIS).
    import io

    from PIL import Image

    tiny = Image.new("RGB", (8, 8), color=(128, 64, 32))
    buf = io.BytesIO()
    tiny.save(buf, format="JPEG", quality=90)
    result = ela.run(buf.getvalue(), "image/jpeg", {})
    assert result.status == CheckStatus.INCONCLUSIVE


# --- run() on PDFs -------------------------------------------------------


def test_pdf_with_embedded_tampered_jpeg_is_flagged():
    pdf_bytes = _pdf_with_embedded_jpeg(_read("tampered.jpg"))
    result = ela.run(pdf_bytes, "application/pdf", {"has_jpeg_recompression_history": True})
    assert result.status == CheckStatus.SUSPICIOUS
    assert len(result.indicators) == 1
    # Evidence should identify which embedded image, not just the region.
    assert "image" in result.indicators[0].evidence


def test_pdf_with_embedded_clean_jpeg_is_not_flagged():
    pdf_bytes = _pdf_with_embedded_jpeg(_read("ela_clean.jpg"))
    result = ela.run(pdf_bytes, "application/pdf", {"has_jpeg_recompression_history": True})
    assert result.status != CheckStatus.SUSPICIOUS


def test_born_digital_pdf_is_not_applicable():
    # No file-bytes inspection needed for is_applicable() - it only sees
    # mime_type + context, which is exactly the point: metadata_pdf.py
    # (stage 1) is expected to have already made this determination.
    assert ela.is_applicable("application/pdf", {"has_jpeg_recompression_history": False}) is False


def test_pdf_run_is_inconclusive_when_no_embedded_jpeg_is_actually_found():
    # Defends against a context flag that disagrees with reality (e.g. a
    # differently-scoped "has JPEG history" determination upstream): run()
    # must not fabricate a CLEAN from a document it couldn't actually check.
    pdf_bytes = _read("born_digital.pdf")
    result = ela.run(pdf_bytes, "application/pdf", {"has_jpeg_recompression_history": True})
    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []


def test_corrupt_pdf_bytes_are_inconclusive_not_a_crash():
    result = ela.run(b"%PDF-1.4 not a real pdf", "application/pdf", {"has_jpeg_recompression_history": True})
    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []
