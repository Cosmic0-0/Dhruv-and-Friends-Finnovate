"""Stage 3: TruFor forgery localization model.

STUB - see document-forensics/README.md "Implementation status". Same
interface as the other checks:

    def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult

The orchestrator (app/orchestrator.py) only calls this when steps 1-2
(checks/metadata_pdf.py, checks/ela.py) left the document's status
INCONCLUSIVE - it is not run when the cheap checks already resolved the
document cleanly or suspiciously. Images only; PDFs never reach this check
directly (a PDF's embedded images, if any, would need to be extracted
first - out of scope for the initial integration, see README).

Integrates github.com/grip-unina/TruFor to localize tampered regions in an
image. Runs entirely locally via PyTorch - no third-party API call, no
network access at inference time (only at first-time weight download,
which must happen out of band, not on a live request).
"""

from __future__ import annotations

from app.models import CheckResult, CheckStatus


def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult:
    raise NotImplementedError("checks/trufor.py: TruFor integration not yet implemented")
