"""Signature-specific handling: internal consistency only.

Owned by the same implementation as checks/metadata_pdf.py (CPU-only image
analysis, no model, same cost class). Called by orchestrator.analyze() only
when metadata_pdf.find_signature_region() found a candidate region.

Only checks internal consistency of the signature stroke itself
(stroke-width irregularity suggesting tracing or a digital overlay) - never
claims to identify or match the signer, since there is no reference
signature on file to compare against. See app/models.py's SignatureReport
docstring: this output must stay clearly labeled as weaker/separate from
the rest of the report so it can't be misread as identity verification.
"""

from __future__ import annotations

import statistics

from PIL import Image

from app.models import CheckName, Confidence, Indicator, SignatureReport

_MIN_CROP_DIM = 6
_MIN_INK_FRACTION = 0.01
_MIN_STROKE_SAMPLES = 12
# Below this coefficient of variation, stroke width is suspiciously
# constant across the whole region - a real pen stroke varies with
# pressure and speed; a traced, stamped, or pasted mark tends not to.
# Calibrated against synthetic strokes, not real handwriting samples (none
# were available) - a genuinely simple heuristic, not a tuned detector.
_LOW_CV_THRESHOLD = 0.30


def run_signature_check(file_bytes: bytes, mime_type: str, region) -> SignatureReport:
    # `region` is already a decoded, cropped grayscale PIL.Image of the
    # candidate signature area - produced by
    # checks/metadata_pdf.py's find_signature_region(), which owns the
    # image-vs-PDF handling and the crop extraction. This function only
    # ever looks at that crop; file_bytes/mime_type are accepted to match
    # the shared call signature (see app/orchestrator.py) but this
    # implementation doesn't need to re-decode either of them.
    if not isinstance(region, Image.Image):
        return SignatureReport(present=False, indicators=[])

    gray = region.convert("L") if region.mode != "L" else region
    width, height = gray.size
    if width < _MIN_CROP_DIM or height < _MIN_CROP_DIM:
        return SignatureReport(present=False, indicators=[])

    mask, ink_fraction = _binarize(gray)
    if ink_fraction < _MIN_INK_FRACTION:
        # Nothing that looks like ink in the candidate region - the outer
        # heuristic's guess didn't pan out on closer inspection.
        return SignatureReport(present=False, indicators=[])

    widths = _stroke_width_samples(mask, width, height)
    if len(widths) < _MIN_STROKE_SAMPLES:
        # A real mark is present but too small/thin to measure stroke
        # width variance reliably - say nothing rather than guess.
        return SignatureReport(present=True, indicators=[])

    mean_width = statistics.mean(widths)
    if mean_width <= 0:
        return SignatureReport(present=True, indicators=[])
    stdev_width = statistics.pstdev(widths)
    coefficient_of_variation = stdev_width / mean_width

    indicators: list[Indicator] = []
    if coefficient_of_variation < _LOW_CV_THRESHOLD:
        indicators.append(
            Indicator(
                check=CheckName.SIGNATURE_CONSISTENCY,
                title="Unusually uniform stroke width in signature region",
                description=(
                    "Line width across this signature-like region varies very little. "
                    "A natural pen stroke has pressure-driven width variation; a "
                    "suspiciously constant width can indicate tracing or a pasted/digital "
                    "overlay. This checks internal consistency only, not who signed it."
                ),
                confidence=Confidence.MEDIUM,
                evidence=(
                    f"stroke width samples={len(widths)}, mean={mean_width:.2f}px, "
                    f"stdev={stdev_width:.2f}px, coefficient_of_variation={coefficient_of_variation:.2f}"
                ),
            )
        )

    return SignatureReport(present=True, indicators=indicators)


def _binarize(gray: Image.Image):
    # Same simple, mean-relative fixed threshold as
    # checks/metadata_pdf.py's band scan - deliberately not a proper Otsu
    # implementation, just "darker than most of this crop".
    hist = gray.histogram()
    total = gray.width * gray.height
    if total == 0:
        return gray, 0.0
    mean = sum(i * c for i, c in enumerate(hist)) / total
    threshold = max(60, min(200, mean * 0.75))
    ink_pixels = sum(hist[: int(threshold)])
    mask = gray.point(lambda p: 255 if p < threshold else 0)
    return mask, ink_pixels / total


def _stroke_width_samples(mask: Image.Image, width: int, height: int) -> list[int]:
    # Approximate, not a true skeleton/distance-transform measurement (no
    # numpy/scipy in this service's dependencies - see requirements-base.txt):
    # a run's length in one scan direction reflects a stroke's *length* if
    # the stroke runs that way, and its *width* if it runs the other way.
    # Capping run length at half the crop's shorter side discards the
    # length-like runs and keeps width-like samples from both scan
    # directions - a coarse but dependency-free proxy for local stroke
    # thickness, good enough to distinguish "constant" from "varies a lot".
    pixels = mask.load()
    cap = max(2, int(min(width, height) * 0.5))
    samples: list[int] = []

    for y in range(height):
        run = 0
        for x in range(width):
            if pixels[x, y]:
                run += 1
            else:
                if 0 < run <= cap:
                    samples.append(run)
                run = 0
        if 0 < run <= cap:
            samples.append(run)

    for x in range(width):
        run = 0
        for y in range(height):
            if pixels[x, y]:
                run += 1
            else:
                if 0 < run <= cap:
                    samples.append(run)
                run = 0
        if 0 < run <= cap:
            samples.append(run)

    return samples
