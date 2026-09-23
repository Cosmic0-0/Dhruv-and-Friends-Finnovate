"""Signature-specific handling: internal consistency only.

STUB - owned by the same implementation as checks/metadata_pdf.py (it's
CPU-only image analysis, no model, same cost class). Called by
orchestrator.analyze() only when metadata_pdf.find_signature_region()
found a candidate region.

Must only check internal consistency of the signature stroke itself
(stroke-width/pressure irregularity suggesting tracing or a digital
overlay) - never claim to identify or match the signer, since there is no
reference signature on file to compare against. See app/models.py's
SignatureReport docstring: this output must stay clearly labeled as
weaker/separate from the rest of the report so it can't be misread as
identity verification.
"""

from __future__ import annotations

from app.models import SignatureReport


def run_signature_check(file_bytes: bytes, mime_type: str, region) -> SignatureReport:
    raise NotImplementedError("app/signature.py: signature internal-consistency check not yet implemented")
