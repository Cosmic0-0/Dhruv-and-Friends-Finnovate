"""Runs the four checks cheapest-first, escalating only when a cheaper
check leaves the document genuinely INCONCLUSIVE, and aggregates their
indicators into one ForensicsReport. Never produces a verdict - see
models.py.

Heavy checks (trufor, layout) are imported lazily, inside analyze(), so
that importing this module - and running the cheap checks - never requires
PyTorch/transformers to be installed at all. That keeps "ordered
cheapest-first" true of the deployment footprint too, not just the request
path.
"""

from __future__ import annotations

from app.models import (
    CheckName,
    CheckStatus,
    Confidence,
    ForensicsReport,
    Indicator,
    SkippedCheck,
)

# checks/metadata_pdf.py and checks/ela.py are CPU-only with light deps
# (pikepdf, pdfplumber, Pillow) - safe to import eagerly.
from checks import metadata_pdf, ela

_CONFIDENCE_ORDER = {Confidence.LOW: 0, Confidence.MEDIUM: 1, Confidence.HIGH: 2}


def _combine_status(a: CheckStatus, b: CheckStatus) -> CheckStatus:
    """SUSPICIOUS from any check wins outright: a later check's silence
    doesn't erase an earlier one's finding. Otherwise CLEAN only holds if
    every check that ran was CLEAN; any INCONCLUSIVE keeps escalation open."""
    if CheckStatus.SUSPICIOUS in (a, b):
        return CheckStatus.SUSPICIOUS
    if CheckStatus.INCONCLUSIVE in (a, b):
        return CheckStatus.INCONCLUSIVE
    return CheckStatus.CLEAN


def _overall_confidence(indicators: list[Indicator]) -> Confidence | None:
    if not indicators:
        return None
    return max((i.confidence for i in indicators), key=lambda c: _CONFIDENCE_ORDER[c])


def analyze(file_bytes: bytes, mime_type: str, document_id: str | None = None) -> ForensicsReport:
    indicators: list[Indicator] = []
    checks_run: list[CheckName] = []
    checks_skipped: list[SkippedCheck] = []
    context: dict = {}

    # --- Stage 1: metadata/PDF forensics (CPU only, no model) -----------
    result1 = metadata_pdf.run(file_bytes, mime_type, context)
    indicators += result1.indicators
    checks_run.append(CheckName.METADATA_PDF)
    status = result1.status

    # --- Stage 2: Error Level Analysis (CPU only, no model) --------------
    if ela.is_applicable(mime_type, context):
        result2 = ela.run(file_bytes, mime_type, context)
        indicators += result2.indicators
        checks_run.append(CheckName.ERROR_LEVEL_ANALYSIS)
        status = _combine_status(status, result2.status)
    else:
        checks_skipped.append(SkippedCheck(check=CheckName.ERROR_LEVEL_ANALYSIS, reason="not_applicable"))

    # A non-JPEG image (PNG/WEBP) whose only cheap check so far is CLEAN
    # hasn't actually been resolved: metadata is mostly EXIF, and "no EXIF
    # on a PNG" is normal, not evidence either way - checks/metadata_pdf.py
    # correctly reports CLEAN for that, but CLEAN here means "nothing
    # applicable has actually looked," not "looked and found nothing."
    # Tracked separately from `status` (rather than overwriting it to
    # INCONCLUSIVE) so a genuine CLEAN from TruFor still combines cleanly
    # below instead of being permanently stuck INCONCLUSIVE by
    # _combine_status's "any INCONCLUSIVE keeps escalation open" rule.
    needs_evidence_before_resolving = (
        mime_type != "application/pdf" and not ela.is_applicable(mime_type, context) and status == CheckStatus.CLEAN
    )

    # --- Stage 3: TruFor - only if still inconclusive, images only ------
    if (status == CheckStatus.INCONCLUSIVE or needs_evidence_before_resolving) and mime_type != "application/pdf":
        from checks import trufor  # lazy: only pulls in torch when actually needed

        result3 = trufor.run(file_bytes, mime_type, context)
        indicators += result3.indicators
        checks_run.append(CheckName.TRUFOR)
        status = _combine_status(status, result3.status)
    else:
        reason = "not_applicable" if mime_type == "application/pdf" else "resolved_by_cheaper_checks"
        checks_skipped.append(SkippedCheck(check=CheckName.TRUFOR, reason=reason))

    # --- Stage 4: layout/template comparison - only if still inconclusive
    if status == CheckStatus.INCONCLUSIVE:
        from checks import layout  # lazy: only pulls in transformers when actually needed

        result4 = layout.run(file_bytes, mime_type, context)
        indicators += result4.indicators
        checks_run.append(CheckName.LAYOUT_COMPARISON)
        status = _combine_status(status, result4.status)
    else:
        checks_skipped.append(SkippedCheck(check=CheckName.LAYOUT_COMPARISON, reason="resolved_by_cheaper_checks"))

    # --- Signature: separate, narrower claim, never gates the above -----
    signature = None
    region = metadata_pdf.find_signature_region(file_bytes, mime_type, context)
    if region is not None:
        from app.signature import run_signature_check  # lazy: only needed when a region was found

        signature = run_signature_check(file_bytes, mime_type, region)

    confidence = _overall_confidence(indicators)
    summary = "no tampering indicators found" if not indicators else f"{len(indicators)} tampering indicator(s) found"

    return ForensicsReport(
        document_id=document_id,
        mime_type=mime_type,
        confidence=confidence,
        summary=summary,
        indicators=indicators,
        signature=signature,
        checks_run=checks_run,
        checks_skipped=checks_skipped,
    )
