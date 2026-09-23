"""Shared response contract for every check in the pipeline.

Every check module (checks/*.py) returns a CheckResult; the orchestrator
concatenates their `indicators` and aggregates their `status` values into
the top-level ForensicsReport. Nothing in this file, and nothing any check
produces, is allowed to be a verdict ("forged"/"authentic") - only
indicators with a confidence label. See ../README.md.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Confidence(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class CheckStatus(str, Enum):
    """A single check's own read on the document - never shown to the
    caller directly, only used by the orchestrator to decide whether a more
    expensive check is worth running."""

    CLEAN = "clean"  # nothing found, and the check is confident in that
    SUSPICIOUS = "suspicious"  # found something, confident in that
    INCONCLUSIVE = "inconclusive"  # neither - escalate to the next check


class CheckName(str, Enum):
    METADATA_PDF = "metadata_pdf"
    ERROR_LEVEL_ANALYSIS = "error_level_analysis"
    TRUFOR = "trufor"
    LAYOUT_COMPARISON = "layout_comparison"
    SIGNATURE_CONSISTENCY = "signature_consistency"


class Indicator(BaseModel):
    check: CheckName
    title: str
    description: str = Field(..., description="One-line explanation of what was found and why it matters.")
    confidence: Confidence
    evidence: Optional[str] = Field(None, description="A specific, quotable fact backing this indicator (a byte offset, an EXIF field, a region), not a restatement of the title.")


class CheckResult(BaseModel):
    status: CheckStatus
    indicators: list[Indicator] = Field(default_factory=list)


class SkippedCheck(BaseModel):
    check: CheckName
    reason: str


class SignatureReport(BaseModel):
    """Deliberately separate from `indicators`: this is a weaker, narrower
    claim (internal stroke consistency only) that must never be read as
    identity verification - there is no reference signature to compare
    against. See checks/metadata_pdf.py's signature helpers."""

    present: bool
    note: str = (
        "Signature analysis checks only internal consistency (stroke width/pressure) "
        "of the signature region itself. It does not identify or match a signer, "
        "and is not identity verification."
    )
    indicators: list[Indicator] = Field(default_factory=list)


class ForensicsReport(BaseModel):
    document_id: Optional[str] = None
    mime_type: str
    # Overall CONFIDENCE in the indicators found, never a verdict. "none" is
    # its own value, not the absence of a field, so a caller can't collapse
    # "confidently found nothing" and "didn't look" into the same falsy state.
    confidence: Confidence | None = None
    summary: str = Field(..., description='"no tampering indicators found" when indicators is empty; never "authentic" or "verified".')
    indicators: list[Indicator] = Field(default_factory=list)
    signature: Optional[SignatureReport] = None
    checks_run: list[CheckName] = Field(default_factory=list)
    checks_skipped: list[SkippedCheck] = Field(default_factory=list)
    scanned_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
