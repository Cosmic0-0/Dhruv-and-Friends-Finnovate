"""Stage 4: layout/template comparison (Donut or LayoutLMv3-base).

STUB - see document-forensics/README.md "Implementation status". Same
interface as the other checks:

    def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult

The orchestrator only calls this when the document is still INCONCLUSIVE
after steps 1-3 - the most expensive check runs last and only when nothing
cheaper already resolved the document.

Runs structured, layout-aware extraction via a local HuggingFace
transformers model and compares the result against a small, explicitly
extensible set of known-legitimate templates (see fixtures/templates/ -
start with 2-3 common bank-statement/letterhead layouts). Flags structural
deviations (logo placement, field layout, font) from the matched template
type, not just text mismatches. Entirely local inference - no third-party
API, no network access at inference time.
"""

from __future__ import annotations

from app.models import CheckResult, CheckStatus


def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult:
    raise NotImplementedError("checks/layout.py: layout/template comparison not yet implemented")
