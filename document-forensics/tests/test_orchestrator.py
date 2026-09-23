"""Tests the cheapest-first ordering itself, not any one check's logic
(each check has its own test module once implemented - see
tests/test_metadata_pdf.py etc.). Every check function here is mocked, so
this suite runs in milliseconds and never touches PyTorch/transformers.

The "TruFor/layout are never invoked" assertions use sys.modules
injection (see _block_import) rather than just mock.patch, because a real
implementation of checks/trufor.py or checks/layout.py may import torch at
module level - mock.patch on an attribute can't prove the *module itself*
was never imported. Setting sys.modules["checks.trufor"] = None makes
Python raise ImportError the instant anything tries to import it, which is
what actually proves "steps 3/4 were never reached," not just documented.
"""

from __future__ import annotations

import sys
from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from app.models import CheckName, CheckResult, CheckStatus, Confidence, Indicator
from app import orchestrator
from checks import metadata_pdf, ela


@contextmanager
def _block_import(*module_names: str):
    """Makes `import <module_name>` raise ImportError for the duration of
    the block, proving the orchestrator never even attempts it."""
    originals = {name: sys.modules.get(name) for name in module_names}
    for name in module_names:
        sys.modules[name] = None  # type: ignore[assignment]
    try:
        yield
    finally:
        for name, original in originals.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original


def _clean(check: CheckName) -> CheckResult:
    return CheckResult(status=CheckStatus.CLEAN, indicators=[])


def _suspicious(check: CheckName) -> CheckResult:
    return CheckResult(
        status=CheckStatus.SUSPICIOUS,
        indicators=[Indicator(check=check, title="t", description="d", confidence=Confidence.HIGH)],
    )


def _inconclusive(check: CheckName) -> CheckResult:
    return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])


def test_clean_cheap_checks_never_reach_trufor_or_layout(monkeypatch):
    monkeypatch.setattr(metadata_pdf, "run", lambda *a, **k: _clean(CheckName.METADATA_PDF))
    monkeypatch.setattr(metadata_pdf, "find_signature_region", lambda *a, **k: None)
    monkeypatch.setattr(ela, "is_applicable", lambda *a, **k: True)
    monkeypatch.setattr(ela, "run", lambda *a, **k: _clean(CheckName.ERROR_LEVEL_ANALYSIS))

    with _block_import("checks.trufor", "checks.layout", "app.signature"):
        report = orchestrator.analyze(b"fake-bytes", "image/jpeg")

    assert report.checks_run == [CheckName.METADATA_PDF, CheckName.ERROR_LEVEL_ANALYSIS]
    skipped = {s.check: s.reason for s in report.checks_skipped}
    assert skipped[CheckName.TRUFOR] == "resolved_by_cheaper_checks"
    assert skipped[CheckName.LAYOUT_COMPARISON] == "resolved_by_cheaper_checks"
    assert report.summary == "no tampering indicators found"
    assert report.confidence is None
    assert report.signature is None


def test_suspicious_cheap_checks_also_skip_the_expensive_ones(monkeypatch):
    monkeypatch.setattr(metadata_pdf, "run", lambda *a, **k: _suspicious(CheckName.METADATA_PDF))
    monkeypatch.setattr(metadata_pdf, "find_signature_region", lambda *a, **k: None)
    monkeypatch.setattr(ela, "is_applicable", lambda *a, **k: False)

    with _block_import("checks.trufor", "checks.layout", "app.signature"):
        report = orchestrator.analyze(b"fake-bytes", "image/png")

    assert len(report.indicators) == 1
    assert report.confidence == Confidence.HIGH
    skipped = {s.check: s.reason for s in report.checks_skipped}
    assert skipped[CheckName.ERROR_LEVEL_ANALYSIS] == "not_applicable"
    assert skipped[CheckName.TRUFOR] == "resolved_by_cheaper_checks"


def test_inconclusive_cheap_checks_escalate_to_trufor(monkeypatch):
    monkeypatch.setattr(metadata_pdf, "run", lambda *a, **k: _inconclusive(CheckName.METADATA_PDF))
    monkeypatch.setattr(metadata_pdf, "find_signature_region", lambda *a, **k: None)
    monkeypatch.setattr(ela, "is_applicable", lambda *a, **k: True)
    monkeypatch.setattr(ela, "run", lambda *a, **k: _inconclusive(CheckName.ERROR_LEVEL_ANALYSIS))

    fake_trufor = MagicMock()
    fake_trufor.run.return_value = _suspicious(CheckName.TRUFOR)
    monkeypatch.setitem(sys.modules, "checks.trufor", fake_trufor)

    with _block_import("checks.layout", "app.signature"):
        report = orchestrator.analyze(b"fake-bytes", "image/jpeg")

    assert CheckName.TRUFOR in report.checks_run
    # TruFor resolved it (SUSPICIOUS), so layout must still be skipped.
    skipped = {s.check: s.reason for s in report.checks_skipped}
    assert skipped[CheckName.LAYOUT_COMPARISON] == "resolved_by_cheaper_checks"
    fake_trufor.run.assert_called_once()


def test_trufor_is_never_run_against_a_pdf_even_when_inconclusive(monkeypatch):
    monkeypatch.setattr(metadata_pdf, "run", lambda *a, **k: _inconclusive(CheckName.METADATA_PDF))
    monkeypatch.setattr(metadata_pdf, "find_signature_region", lambda *a, **k: None)
    monkeypatch.setattr(ela, "is_applicable", lambda *a, **k: False)

    fake_layout = MagicMock()
    fake_layout.run.return_value = _inconclusive(CheckName.LAYOUT_COMPARISON)
    monkeypatch.setitem(sys.modules, "checks.layout", fake_layout)

    with _block_import("checks.trufor", "app.signature"):
        report = orchestrator.analyze(b"fake-bytes", "application/pdf")

    skipped = {s.check: s.reason for s in report.checks_skipped}
    assert skipped[CheckName.TRUFOR] == "not_applicable"
    assert CheckName.LAYOUT_COMPARISON in report.checks_run


def test_signature_check_only_runs_when_a_region_is_found(monkeypatch):
    monkeypatch.setattr(metadata_pdf, "run", lambda *a, **k: _clean(CheckName.METADATA_PDF))
    # ELA genuinely applicable and CLEAN here (not just metadata CLEAN with
    # ELA inapplicable) - this test is about signature-check invocation,
    # not about the CLEAN-resolution rule covered by the tests below.
    monkeypatch.setattr(ela, "is_applicable", lambda *a, **k: True)
    monkeypatch.setattr(ela, "run", lambda *a, **k: _clean(CheckName.ERROR_LEVEL_ANALYSIS))
    monkeypatch.setattr(metadata_pdf, "find_signature_region", lambda *a, **k: (10, 10, 50, 30))

    from app.models import SignatureReport

    fake_signature_module = MagicMock()
    fake_signature_module.run_signature_check.return_value = SignatureReport(present=True, indicators=[])
    monkeypatch.setitem(sys.modules, "app.signature", fake_signature_module)

    with _block_import("checks.trufor", "checks.layout"):
        report = orchestrator.analyze(b"fake-bytes", "image/jpeg")

    assert report.signature is not None
    assert report.signature.present is True
    fake_signature_module.run_signature_check.assert_called_once()


def test_a_clean_but_uninformative_non_jpeg_image_escalates_to_trufor_instead_of_resolving(monkeypatch):
    # A PNG with no EXIF is normal, not evidence either way -
    # checks/metadata_pdf.py correctly reports CLEAN for that, and ELA
    # never applies to PNG. Neither is a check that actually looked at
    # this image and found it clean, so resolving CLEAN here would be
    # resolving on an absence of evidence, not evidence of absence. This
    # is the exact gap a tampered PNG could otherwise slip through
    # (verified live against a real tampered PNG during manual testing).
    monkeypatch.setattr(metadata_pdf, "run", lambda *a, **k: _clean(CheckName.METADATA_PDF))
    monkeypatch.setattr(metadata_pdf, "find_signature_region", lambda *a, **k: None)
    monkeypatch.setattr(ela, "is_applicable", lambda *a, **k: False)

    fake_trufor = MagicMock()
    fake_trufor.run.return_value = _suspicious(CheckName.TRUFOR)
    monkeypatch.setitem(sys.modules, "checks.trufor", fake_trufor)

    with _block_import("checks.layout", "app.signature"):
        report = orchestrator.analyze(b"fake-bytes", "image/png")

    assert CheckName.TRUFOR in report.checks_run
    fake_trufor.run.assert_called_once()
    assert len(report.indicators) == 1


def test_a_genuinely_clean_non_jpeg_image_still_resolves_clean_once_trufor_agrees(monkeypatch):
    # The fix above must not make every PNG permanently unresolvable -
    # once a check that IS applicable to it (TruFor) weighs in and agrees
    # nothing's wrong, the document is genuinely CLEAN.
    monkeypatch.setattr(metadata_pdf, "run", lambda *a, **k: _clean(CheckName.METADATA_PDF))
    monkeypatch.setattr(metadata_pdf, "find_signature_region", lambda *a, **k: None)
    monkeypatch.setattr(ela, "is_applicable", lambda *a, **k: False)

    fake_trufor = MagicMock()
    fake_trufor.run.return_value = _clean(CheckName.TRUFOR)
    monkeypatch.setitem(sys.modules, "checks.trufor", fake_trufor)

    with _block_import("checks.layout", "app.signature"):
        report = orchestrator.analyze(b"fake-bytes", "image/png")

    assert report.summary == "no tampering indicators found"
    skipped = {s.check: s.reason for s in report.checks_skipped}
    assert skipped[CheckName.LAYOUT_COMPARISON] == "resolved_by_cheaper_checks"


def test_a_clean_pdf_still_resolves_without_forcing_escalation(monkeypatch):
    # The new rule is scoped to non-PDF images only (see orchestrator.py's
    # comment) - a PDF's metadata check (pikepdf/pdfplumber) genuinely
    # examines PDF structure, unlike EXIF-on-a-PNG, so CLEAN there is a
    # real result, not an absence of evidence. TruFor is images-only
    # anyway, so this mostly guards against a future regression.
    monkeypatch.setattr(metadata_pdf, "run", lambda *a, **k: _clean(CheckName.METADATA_PDF))
    monkeypatch.setattr(metadata_pdf, "find_signature_region", lambda *a, **k: None)
    monkeypatch.setattr(ela, "is_applicable", lambda *a, **k: False)

    with _block_import("checks.trufor", "checks.layout", "app.signature"):
        report = orchestrator.analyze(b"fake-bytes", "application/pdf")

    assert report.summary == "no tampering indicators found"
    skipped = {s.check: s.reason for s in report.checks_skipped}
    assert skipped[CheckName.TRUFOR] == "not_applicable"
