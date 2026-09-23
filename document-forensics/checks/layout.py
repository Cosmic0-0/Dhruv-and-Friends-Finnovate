"""Stage 4: layout/template comparison (Donut or LayoutLMv3-base).

See document-forensics/README.md "Implementation status" - this replaces
that stub. Same interface as the other checks:

    def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult

The orchestrator only calls this when the document is still INCONCLUSIVE
after steps 1-3 - the most expensive check runs last and only when nothing
cheaper already resolved the document.

Model choice: Donut (naver-clova-ix/donut-base-finetuned-docvqa), not
LayoutLMv3. LayoutLMv3 needs OCR + bounding boxes as a separate
preprocessing step (another model, another set of moving parts); Donut is a
single end-to-end image-to-text model, which is what makes it tractable
here. Plain "donut-base" is pretrained only (a synthetic reading-order
objective) and produces empty/degenerate output without task-specific
fine-tuning - confirmed by hand before choosing the docvqa checkpoint - so
this uses the DocVQA fine-tune and asks it fixed, template-agnostic
questions (see _FIELD_QUESTIONS) to get short natural-language field values.

Important honesty note about scope: Donut's DocVQA head returns text
answers, not bounding boxes. It genuinely cannot tell you where on the page
a field sits. So "field layout"/"logo placement" deviation detection here is
deliberately split into two independent halves:
  - WHAT the document claims to be (institution name, document title) -
    Donut, genuine local model inference, used only to pick which known
    template this document should be compared against.
  - WHERE ink actually sits on the page (logo box, title band, ...) -
    plain deterministic Pillow pixel-density measurement over the
    fractional regions each template declares, compared against that
    template's expected density range. This is the part that actually
    catches "logo moved/missing" or "title block resized" - a model
    that only reads text end-to-end can't see that, so it isn't asked to.

Entirely local inference - no third-party API, no network access at
inference time (only at first-time weight download, which must happen out
of band, not on a live request - see _load_model()'s local_files_only=True
and the HF_HUB_OFFLINE/TRANSFORMERS_OFFLINE env vars it sets).
"""

from __future__ import annotations

import io
import json
import os
import re
from pathlib import Path
from typing import Optional

# Heavy imports at module level are fine here: the orchestrator already
# imports this module lazily (`from checks import layout`, inside
# analyze(), only once stages 1-3 leave a document INCONCLUSIVE) - see
# app/orchestrator.py and README.md "Deployment footprint follows the same
# principle". Importing checks.layout itself is the lazy boundary; nothing
# above this needs torch/transformers installed.
import torch
from PIL import Image
from transformers import DonutProcessor, VisionEncoderDecoderModel

from app.models import CheckName, CheckResult, CheckStatus, Confidence, Indicator

_MODEL_NAME = "naver-clova-ix/donut-base-finetuned-docvqa"

# Offline at inference time is a hard requirement (see README.md and the
# task's no-network test), not just a preference - set both before the
# first from_pretrained() call, and still pass local_files_only=True
# explicitly on each call as belt-and-suspenders.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "templates"

# Fixed, template-agnostic questions used to identify what a document claims
# to be, before any template-specific comparison happens. Donut's DocVQA
# fine-tune is a small, zero-shot-brittle model - phrasing matters more
# than it should (tried and rejected several before landing on these two;
# see tests/test_layout.py's fixture images for what they were validated
# against).
_FIELD_QUESTIONS = {
    "institution_name": "What is the name of the bank shown in the logo?",
    "document_title": "What is the title of this document?",
}

_processor: Optional[DonutProcessor] = None
_model: Optional[VisionEncoderDecoderModel] = None


def _load_model() -> tuple[DonutProcessor, VisionEncoderDecoderModel]:
    """Loads (and caches) the Donut DocVQA checkpoint from the local HF
    cache. Never hits the network: local_files_only=True makes this raise
    rather than fall back to a download if the weights aren't already
    present from the one-time, out-of-band setup step."""
    global _processor, _model
    if _model is None:
        _processor = DonutProcessor.from_pretrained(_MODEL_NAME, local_files_only=True)
        _model = VisionEncoderDecoderModel.from_pretrained(_MODEL_NAME, local_files_only=True)
        _model.eval()
    return _processor, _model


def _ask(processor: DonutProcessor, model: VisionEncoderDecoderModel, image: Image.Image, question: str) -> str:
    prompt = f"<s_docvqa><s_question>{question}</s_question><s_answer>"
    decoder_input_ids = processor.tokenizer(prompt, add_special_tokens=False, return_tensors="pt").input_ids
    pixel_values = processor(image, return_tensors="pt").pixel_values
    with torch.no_grad():
        outputs = model.generate(pixel_values, decoder_input_ids=decoder_input_ids, max_length=64)
    decoded = processor.batch_decode(outputs)[0]
    parsed = processor.token2json(decoded)
    return str(parsed.get("answer", "")).strip()


def _extract_fields(image: Image.Image) -> dict[str, str]:
    processor, model = _load_model()
    return {key: _ask(processor, model, image, question) for key, question in _FIELD_QUESTIONS.items()}


def _load_templates(directory: Path = _TEMPLATES_DIR) -> list[dict]:
    """One JSON file per template, loaded from tests/fixtures/templates/ -
    adding a template is dropping in a new file, no code change. Files are
    read in sorted-name order so a more specific template can be made to
    take priority over a generic one by filename alone (see
    generic_mu_bank_letterhead.json's notes)."""
    if not directory.is_dir():
        return []
    templates = []
    for path in sorted(directory.glob("*.json")):
        with path.open("r", encoding="utf-8") as f:
            templates.append(json.load(f))
    return templates


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def _text_matches(candidate: str, accepted: list[str]) -> bool:
    normalized_candidate = _normalize(candidate)
    if not normalized_candidate:
        return False
    return any(
        _normalize(a) in normalized_candidate or normalized_candidate in _normalize(a)
        for a in accepted
    )


def _matches_template(fields: dict[str, str], template: dict) -> bool:
    """A template matches when both of its declared expected_fields are
    satisfied. An empty expected list (see generic_mu_bank_letterhead.json's
    institution_name) is auto-satisfied - that field is deliberately not
    part of what makes that template distinctive."""
    expected = template.get("expected_fields", {})
    for field_name, accepted_values in expected.items():
        if accepted_values and not _text_matches(fields.get(field_name, ""), accepted_values):
            return False
    return True


def _best_matching_template(fields: dict[str, str], templates: list[dict]) -> Optional[dict]:
    for template in templates:
        if _matches_template(fields, template):
            return template
    return None


def _ink_density(image: Image.Image, bbox_fraction: list[float]) -> float:
    """Fraction of darker-than-midtone pixels in a fractional-coordinate
    region of the page - a genuinely deterministic (non-model) measure of
    "is there a mark here at all", used to catch a missing/moved/resized
    logo or title block. Not OCR, not font analysis - just ink coverage."""
    width, height = image.size
    x0, y0, x1, y1 = bbox_fraction
    box = (int(x0 * width), int(y0 * height), int(x1 * width), int(y1 * height))
    region = image.convert("L").crop(box)
    total = region.width * region.height
    if total == 0:
        return 0.0
    histogram = region.histogram()
    dark_pixels = sum(histogram[:128])
    return dark_pixels / total


def _check_regions(image: Image.Image, template: dict) -> list[Indicator]:
    indicators = []
    for region in template.get("expected_regions", []):
        density_range = region.get("expected_ink_density")
        bbox = region.get("bbox")
        if not density_range or not bbox:
            continue
        density = _ink_density(image, bbox)
        low, high = density_range
        if density < low or density > high:
            indicators.append(
                Indicator(
                    check=CheckName.LAYOUT_COMPARISON,
                    title=f"Structural deviation in '{region.get('name', 'region')}' from {template['display_name']}",
                    description=(
                        f"{region.get('description', 'This region')} is expected to have ink "
                        f"coverage between {low:.2f} and {high:.2f} for the matched template "
                        f"({template['display_name']}); this document measured {density:.2f}, "
                        "suggesting a missing, moved, or resized element."
                    ),
                    confidence=Confidence.MEDIUM,
                    evidence=(
                        f"template={template['template_id']} region={region.get('name')} "
                        f"bbox={bbox} ink_density={density:.3f} expected=[{low:.2f}, {high:.2f}]"
                    ),
                )
            )
    return indicators


_SUPPORTED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult:
    # This check only understands rasterized page images. A PDF would need
    # rendering to an image first (pdf2image/poppler) - out of scope for
    # this integration (see README's stated scope for stage 4), so an
    # unsupported mime type is honestly INCONCLUSIVE rather than a
    # fabricated finding either way.
    if mime_type not in _SUPPORTED_MIME_TYPES:
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    try:
        image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    except Exception:
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    templates = _load_templates()
    if not templates:
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    fields = _extract_fields(image)
    template = _best_matching_template(fields, templates)
    if template is None:
        # Not a document type we have a known-legitimate template for at
        # all - genuinely inconclusive, not a finding either way.
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    indicators = _check_regions(image, template)
    status = CheckStatus.SUSPICIOUS if indicators else CheckStatus.CLEAN
    return CheckResult(status=status, indicators=indicators)
