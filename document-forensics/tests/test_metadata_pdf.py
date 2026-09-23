"""Fixture-based tests for checks/metadata_pdf.py: a small number of
deterministic, offline fixtures (tests/fixtures/), not live documents or
network calls - the same convention
backend/src/services/site-security/index.test.js documents for its own
fixture suite. Two fixtures are reused from Part 1's ingestion work
(backend/src/services/document-store/fixtures/) rather than rebuilt here;
the rest are purpose-built for the checks in this module (see
tests/fixtures/ and the generator notes in each test below).
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image

from app.models import CheckStatus, Confidence
from checks import metadata_pdf

FIXTURES = Path(__file__).parent / "fixtures"


def _read(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


# --------------------------------------------------------------------------
# Images
# --------------------------------------------------------------------------


def test_clean_jpeg_with_genuine_camera_exif_is_clean():
    # clean.jpg carries real Make/Model/DateTimeOriginal EXIF tags and no
    # editor Software tag - reused from
    # backend/src/services/document-store/fixtures/clean.jpg.
    context: dict = {}
    result = metadata_pdf.run(_read("clean.jpg"), "image/jpeg", context)

    assert result.status == CheckStatus.CLEAN
    assert result.indicators == []
    assert context["has_jpeg_recompression_history"] is True


def test_jpeg_edited_with_photoshop_and_impossible_timestamp_order_is_suspicious():
    # edited_exif.jpg's Software tag names Photoshop and its EXIF DateTime
    # (modified) predates DateTimeOriginal (captured) - an ordering that
    # cannot happen honestly.
    result = metadata_pdf.run(_read("edited_exif.jpg"), "image/jpeg", {})

    assert result.status == CheckStatus.SUSPICIOUS
    titles = {i.title for i in result.indicators}
    assert "Image-editor software tag present" in titles
    assert "Modification timestamp predates capture timestamp" in titles
    assert all(i.confidence in (Confidence.MEDIUM, Confidence.HIGH) for i in result.indicators if i.title in titles)


def test_jpeg_missing_exif_is_only_a_low_confidence_indicator():
    # A clean photo with no EXIF at all is common (many export/share paths
    # strip it) - it must never read as a confident finding on its own.
    blank = Image.new("RGB", (64, 64), color=(255, 255, 255))
    buf = io.BytesIO()
    blank.save(buf, format="JPEG")

    result = metadata_pdf.run(buf.getvalue(), "image/jpeg", {})

    assert result.status == CheckStatus.INCONCLUSIVE
    assert len(result.indicators) == 1
    assert result.indicators[0].confidence == Confidence.LOW


def test_png_without_exif_is_not_flagged_at_all():
    # PNG isn't a camera/scanner format the way JPEG conventionally is, so
    # missing EXIF there carries no signal - the docstring's "clean photo
    # with no EXIF is common" case, taken to its logical conclusion.
    blank = Image.new("RGB", (64, 64), color=(255, 255, 255))
    buf = io.BytesIO()
    blank.save(buf, format="PNG")

    result = metadata_pdf.run(buf.getvalue(), "image/png", {})

    assert result.status == CheckStatus.CLEAN
    assert result.indicators == []


def test_unparseable_image_bytes_are_inconclusive_not_clean():
    result = metadata_pdf.run(b"not an image", "image/jpeg", {})

    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []


# --------------------------------------------------------------------------
# PDFs
# --------------------------------------------------------------------------


def test_clean_single_revision_pdf_is_clean():
    # clean.pdf: one revision, matching CreationDate/ModDate, a single
    # consistently-declared font, text within the visible page.
    context: dict = {}
    result = metadata_pdf.run(_read("clean.pdf"), "application/pdf", context)

    assert result.status == CheckStatus.CLEAN
    assert result.indicators == []
    assert context["has_jpeg_recompression_history"] is False


def test_incremental_update_pdf_is_low_confidence_not_suspicious():
    # incremental_update.pdf (reused from
    # backend/src/services/document-store/fixtures/incremental-update.pdf)
    # has exactly one incremental update after its initial save - the
    # README is explicit that this alone ("zero incremental updates is not
    # suspicious by itself") must not read as a confident finding, since
    # adding a signature this way is completely normal.
    result = metadata_pdf.run(_read("incremental_update.pdf"), "application/pdf", {})

    assert result.status == CheckStatus.INCONCLUSIVE
    assert len(result.indicators) == 1
    assert result.indicators[0].confidence == Confidence.LOW
    assert "incremental update" in result.indicators[0].title.lower()


def test_mismatched_text_layer_pdf_is_suspicious():
    # mismatched_text_layer.pdf is purpose-built (pikepdf, hand-assembled)
    # with three pages: page 1 has normal in-bounds text; page 2 has an embedded
    # image and zero extractable text; page 3 has an embedded image plus
    # a text run positioned far outside the visible page - the classic
    # pasted-text-box-over-a-scan tell.
    result = metadata_pdf.run(_read("mismatched_text_layer.pdf"), "application/pdf", {})

    assert result.status == CheckStatus.SUSPICIOUS
    titles = {i.title for i in result.indicators}
    assert "Text positioned outside the visible page area" in titles
    assert "Page has an embedded image but no extractable text" in titles

    offpage = next(i for i in result.indicators if i.title == "Text positioned outside the visible page area")
    assert offpage.confidence == Confidence.HIGH
    assert "page 3" in offpage.evidence

    image_only = next(i for i in result.indicators if i.title == "Page has an embedded image but no extractable text")
    assert image_only.confidence == Confidence.MEDIUM
    assert "page 2" in image_only.evidence


def test_unparseable_pdf_bytes_are_inconclusive_not_clean():
    result = metadata_pdf.run(b"%PDF-1.4 not really a pdf", "application/pdf", {})

    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []


def test_unsupported_mime_type_is_inconclusive():
    result = metadata_pdf.run(b"whatever", "text/plain", {})

    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []


# --------------------------------------------------------------------------
# Signature-region heuristic
# --------------------------------------------------------------------------


def test_find_signature_region_returns_none_for_a_blank_image():
    blank = Image.new("L", (300, 400), color=255)
    buf = io.BytesIO()
    blank.save(buf, format="PNG")

    assert metadata_pdf.find_signature_region(buf.getvalue(), "image/png", {}) is None


def test_find_signature_region_returns_none_for_a_dense_printed_bottom_band():
    from PIL import ImageDraw

    # Evenly-spaced horizontal rules across the full width, filling the
    # bottom band, approximate a block of printed text lines rather than
    # a compact handwritten mark.
    dense = Image.new("L", (300, 400), color=255)
    draw = ImageDraw.Draw(dense)
    for y in range(310, 395, 6):
        draw.line((10, y, 290, y), fill=0, width=4)
    buf = io.BytesIO()
    dense.save(buf, format="PNG")

    assert metadata_pdf.find_signature_region(buf.getvalue(), "image/png", {}) is None


def test_find_signature_region_finds_a_scribble_in_the_bottom_band():
    from PIL import ImageDraw

    scribble = Image.new("L", (300, 400), color=255)
    draw = ImageDraw.Draw(scribble)
    draw.line(
        [(40, 370), (70, 340), (90, 375), (120, 335), (150, 372), (180, 345), (200, 368)],
        fill=0,
        width=3,
    )
    buf = io.BytesIO()
    scribble.save(buf, format="PNG")

    region = metadata_pdf.find_signature_region(buf.getvalue(), "image/png", {})

    assert isinstance(region, Image.Image)
    assert region.width > 0 and region.height > 0


def test_find_signature_region_returns_none_for_a_born_digital_pdf():
    # clean.pdf has no embedded images at all, so the PDF signature
    # heuristic (which only looks for a scanned/pasted image stamp) has
    # nothing to find - the normal, unremarkable case.
    assert metadata_pdf.find_signature_region(_read("clean.pdf"), "application/pdf", {}) is None


def test_find_signature_region_finds_a_small_embedded_image_near_the_bottom_of_a_pdf():
    # pdf_with_image_signature.pdf has a single small embedded image
    # placed near the bottom of its only page - the shape of a
    # scanned/pasted signature stamp.
    region = metadata_pdf.find_signature_region(_read("pdf_with_image_signature.pdf"), "application/pdf", {})

    assert isinstance(region, Image.Image)


def test_find_signature_region_ignores_a_full_page_pdf_image():
    # mismatched_text_layer.pdf's embedded images span almost the entire
    # page (180x180 on a 200x200 page) - too big to be a signature stamp,
    # so the heuristic must not mistake a full-page scan for one.
    assert metadata_pdf.find_signature_region(_read("mismatched_text_layer.pdf"), "application/pdf", {}) is None
