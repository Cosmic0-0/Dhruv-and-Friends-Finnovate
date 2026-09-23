"""Tests for app/signature.py's internal stroke-consistency check.

Deterministic, offline synthetic images (drawn with PIL.ImageDraw), not
real handwriting samples or live documents - same "fixed fixture" spirit
as tests/test_metadata_pdf.py, but here the "fixture" is a small, exact
pixel pattern rather than a binary file, since what's under test is a
pure pixel-measurement algorithm, not document parsing.

Also asserts the constraint app/models.py's SignatureReport and this
module's own docstring both make explicit: this check never claims to
identify or match a signer, only internal consistency of one region.
"""

from __future__ import annotations

from PIL import Image, ImageDraw

from app.models import CheckName, Confidence
from app.signature import run_signature_check


def _draw(width: int, height: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("L", (width, height), color=255)
    return image, ImageDraw.Draw(image)


def test_a_single_constant_width_stroke_is_flagged_as_suspiciously_uniform():
    # One straight, perfectly constant-width line - the signature-overlay
    # tell this check exists for (tracing, stamping, or a pasted/digital
    # mark all tend to produce this).
    region, draw = _draw(200, 60)
    draw.line([(10, 30), (190, 30)], fill=0, width=6)

    report = run_signature_check(b"", "image/png", region)

    assert report.present is True
    assert len(report.indicators) == 1
    indicator = report.indicators[0]
    assert indicator.check == CheckName.SIGNATURE_CONSISTENCY
    assert indicator.confidence == Confidence.MEDIUM
    assert "uniform" in indicator.title.lower()


def test_a_stroke_with_natural_width_variation_is_not_flagged():
    # Width swings from 1px to 9px along the path - the pressure variation
    # a real pen stroke has and a traced/stamped mark typically lacks.
    region, draw = _draw(200, 60)
    widths = [1, 6, 2, 8, 1, 7, 2, 9, 1]
    points = [
        (10, 10), (30, 40), (50, 15), (70, 45), (90, 12),
        (110, 42), (130, 18), (150, 44), (170, 20), (190, 40),
    ]
    for i in range(len(points) - 1):
        draw.line([points[i], points[i + 1]], fill=0, width=widths[i % len(widths)])

    report = run_signature_check(b"", "image/png", region)

    assert report.present is True
    assert report.indicators == []


def test_a_blank_region_reports_not_present_with_no_indicators():
    # find_signature_region()'s outer heuristic can guess wrong; a region
    # that turns out to have no ink at all must say so honestly rather
    # than force a verdict.
    region, _ = _draw(40, 20)

    report = run_signature_check(b"", "image/png", region)

    assert report.present is False
    assert report.indicators == []


def test_a_region_too_small_to_measure_reports_not_present():
    region, draw = _draw(4, 4)
    draw.point((1, 1), fill=0)

    report = run_signature_check(b"", "image/png", region)

    assert report.present is False
    assert report.indicators == []


def test_non_image_region_is_handled_without_crashing():
    # find_signature_region() only ever returns a PIL.Image or None, but
    # this must degrade safely rather than raise if that contract is ever
    # violated (e.g. by a future refactor).
    report = run_signature_check(b"", "image/png", (10, 10, 50, 30))

    assert report.present is False
    assert report.indicators == []


def test_report_never_claims_identity_verification():
    region, draw = _draw(200, 60)
    draw.line([(10, 30), (190, 30)], fill=0, width=6)

    report = run_signature_check(b"", "image/png", region)

    note = report.note.lower()
    assert "does not identify" in note or "not identity verification" in note
    for indicator in report.indicators:
        assert "signer" not in indicator.description.lower() or "not" in indicator.description.lower()
