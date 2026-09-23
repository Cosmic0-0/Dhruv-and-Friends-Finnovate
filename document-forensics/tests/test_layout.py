"""Tests for checks/layout.py (stage 4: Donut structured extraction +
template comparison).

This is a REAL integration, not a mock: naver-clova-ix/donut-base-finetuned-
docvqa is downloaded once, out of band, into the local HF cache before these
tests run (see README.md's setup instructions) - not part of this test run.
Tests that call layout.run() end-to-end therefore load and run that model
for real, entirely from local disk. What they must never do is reach the
network to do it - test_no_network_calls_during_run proves that at the
transport level, not by trusting local_files_only alone.

If the model weights are not present in the local cache (e.g. CI without
the one-time download step), the model-loading tests are skipped rather
than failed - this suite is meant to prove the real path works when it can
run, not to require a multi-hundred-MB download on every CI run.
"""

from __future__ import annotations

import io
from pathlib import Path

import httpx
import pytest
from PIL import Image, ImageDraw, ImageFont

from app.models import CheckStatus
from checks import layout

_CANVAS = (900, 1200)


def _font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def _make_mcb_statement(logo_box: tuple[int, int, int, int] = (40, 30, 260, 110)) -> bytes:
    """A synthetic MCB-statement-shaped page: logo box (default position
    matches mcb_bank_statement.json's expected "logo" region), title to its
    right, a couple of body lines below. Moving `logo_box` off its default
    is how the deviation test constructs a "wrong logo position" document
    cheaply, per the task's own suggestion, without needing a real scanned
    document or an image-editing dependency."""
    img = Image.new("RGB", _CANVAS, "white")
    draw = ImageDraw.Draw(img)
    draw.rectangle(logo_box, outline="black", width=3)
    draw.text((logo_box[0] + 20, logo_box[1] + 25), "MCB", fill="black", font=_font(34))
    draw.text((380, 50), "STATEMENT OF ACCOUNT", fill="black", font=_font(30))
    draw.text((40, 180), "Account Holder: John Doe", fill="black", font=_font(22))
    draw.text((40, 220), "Account Number: 000123456789", fill="black", font=_font(22))
    draw.text((40, 260), "Statement Period: 01/08/2026 - 31/08/2026", fill="black", font=_font(22))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_blank_page() -> bytes:
    img = Image.new("RGB", _CANVAS, "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _model_available() -> bool:
    try:
        layout._load_model()
        return True
    except Exception:
        return False


requires_model = pytest.mark.skipif(
    not _model_available(), reason="donut-base-finetuned-docvqa not present in local HF cache"
)


def test_unsupported_mime_type_is_inconclusive_without_touching_the_model():
    result = layout.run(b"%PDF-1.4 fake", "application/pdf", {})
    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []


def test_unreadable_bytes_are_inconclusive_not_an_error():
    result = layout.run(b"not-an-image", "image/png", {})
    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []


def test_templates_directory_loads_all_fixture_templates():
    templates = layout._load_templates()
    ids = {t["template_id"] for t in templates}
    assert {"mcb_bank_statement", "sbm_bank_statement", "generic_mu_bank_letterhead"} <= ids


def test_ink_density_is_a_deterministic_pixel_measurement_not_a_model_call():
    img = Image.new("L", (100, 100), "white")
    ImageDraw.Draw(img).rectangle((0, 0, 49, 99), fill="black")
    density = layout._ink_density(img.convert("RGB"), [0.0, 0.0, 1.0, 1.0])
    assert 0.45 < density < 0.55  # left half is black, right half is white


@requires_model
def test_no_matching_template_is_inconclusive():
    result = layout.run(_make_blank_page(), "image/png", {})
    assert result.status == CheckStatus.INCONCLUSIVE
    assert result.indicators == []


@requires_model
def test_clean_document_matching_template_has_no_indicators():
    result = layout.run(_make_mcb_statement(), "image/png", {})
    assert result.status == CheckStatus.CLEAN
    assert result.indicators == []


@requires_model
def test_logo_moved_off_template_position_is_flagged():
    # Same document, logo box moved from the expected top-left header band
    # (mcb_bank_statement.json's "logo" region) down to the bottom-right
    # corner - an "obvious structural deviation" constructed cheaply with
    # Pillow, per the task's own suggestion.
    deviated_bytes = _make_mcb_statement(logo_box=(650, 1050, 870, 1130))
    result = layout.run(deviated_bytes, "image/png", {})
    assert result.status == CheckStatus.SUSPICIOUS
    assert result.indicators
    assert any("logo" in indicator.title.lower() for indicator in result.indicators)


@requires_model
def test_no_network_calls_during_run(monkeypatch):
    """The one required test: proves layout.run() makes zero network calls
    for an already-cached model, at the actual HTTP transport level (not by
    trusting local_files_only=True's word for it). huggingface_hub (used by
    transformers' from_pretrained) is on httpx, not requests, in the
    version pinned by requirements-base.txt/requirements-layout.txt -
    patching httpx.Client.send and the sync transport's handle_request
    catches every outbound call regardless of which layer issues it."""
    calls = []

    original_send = httpx.Client.send

    def _spy_send(self, request, *args, **kwargs):
        calls.append(str(request.url))
        return original_send(self, request, *args, **kwargs)

    original_handle_request = httpx.HTTPTransport.handle_request

    def _spy_handle_request(self, request):
        calls.append(str(request.url))
        return original_handle_request(self, request)

    monkeypatch.setattr(httpx.Client, "send", _spy_send)
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", _spy_handle_request)

    result = layout.run(_make_mcb_statement(), "image/png", {})

    assert calls == []
    assert result.status in (CheckStatus.CLEAN, CheckStatus.SUSPICIOUS, CheckStatus.INCONCLUSIVE)
