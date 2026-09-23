"""Stage 2: Error Level Analysis. CPU only, no model.

    def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult

Technique (classic ELA): re-save the decoded image at a fixed JPEG quality
and diff it against the version we just decoded. A region that was already
sitting at (or near) that quality's compression fixed-point barely changes
on re-save - low error level. A region with a *different* compression
history (pasted in from a lower-quality source, a screenshot, a
re-encode-of-a-re-encode) is further from that fixed point and moves more -
high error level. The tell is a spatial contrast between the two, not the
absolute error level itself (a uniformly-high-error image, e.g. one that
started at a much lower quality than our resave target, is still clean -
it's just consistently over-compressed everywhere).

Applicability: only meaningful when the pixels we're diffing actually have
JPEG generation history.
  - image/jpeg: always applicable - the input bytes are themselves a JPEG.
  - image/png, image/webp, and anything else: not applicable. We do not
    attempt to detect "was this PNG re-saved from a JPEG at some point" -
    out of scope (see module docstring in the task/README); a plain
    PNG/WEBP is treated as having no JPEG history.
  - application/pdf: depends on whether the PDF has embedded JPEG (DCTDecode)
    images anywhere in it - a born-digital PDF (vector/text only, or
    Flate-encoded raster) has no JPEG generation history to analyze, while a
    scanned page usually does. checks/metadata_pdf.py is stage 1 and already
    parses the PDF for other reasons, so it is expected to set
    context["has_jpeg_recompression_history"] for stage 2 to read here.
    is_applicable() only receives mime_type + context (no file bytes), so if
    that key is missing - because metadata_pdf.py hasn't landed yet, or uses
    a different key name - we cannot independently verify it at this point
    and must pick a default. We default to NOT applicable (False) when the
    key is missing or None: this is the conservative choice against
    fabricating a signal. Running ELA on a PDF that turns out to have no
    embedded JPEGs produces a vacuous pass at best; skipping it (recorded as
    "not_applicable" by the orchestrator) costs nothing, since a born-digital
    PDF's own stage-1 checks already cover it. run() defends this further:
    even when is_applicable() said True, if no embedded JPEG images are
    actually found, run() reports INCONCLUSIVE rather than a false CLEAN.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, ImageChops, ImageStat

from app.models import CheckName, CheckResult, CheckStatus, Confidence, Indicator

# JPEG quality ELA re-saves at. 90 is the standard ELA default: high enough
# that a region already near this quality (the common case for an untouched
# photo saved once at a normal quality) shows very little movement, while a
# region with different/lower-quality history still shows a clear delta.
_RESAVE_QUALITY = 90

# Block grid granularity for spatial analysis. Fixed pixel size (not a
# fraction of image size) so the "cluster vs. scattered" comparison below
# means the same thing regardless of resolution.
_BLOCK_SIZE = 16
_MIN_BLOCKS_FOR_ANALYSIS = 16  # e.g. at least a 4x4 grid

# A block's error level must clear both of these to count as an outlier:
# - _OUTLIER_Z stddevs above the image's own mean block error (relative -
#   adapts to how noisy/compressed the image is overall), and
# - _OUTLIER_FLOOR absolute mean-abs-difference (0-255 scale) so we don't
#   flag noise in an already near-zero-variance clean image where even a
#   tiny absolute wobble is many "standard deviations".
_OUTLIER_Z = 2.5
_OUTLIER_FLOOR = 6.0

# If almost none of the image stands out, there's no localized anomaly.
_MIN_SUSPICIOUS_FRACTION = 0.01
# If a large fraction of the image "stands out", this heuristic can no
# longer distinguish a pasted region from a generally high-detail/noisy
# image - genuinely inconclusive, not a confident finding either way.
_MAX_SUSPICIOUS_FRACTION = 0.40
# A pasted region should be spatially compact. If the outlier blocks are
# scattered across a bounding box much larger than their own count, that
# looks like generic texture/noise rather than one pasted region.
_MAX_BOUNDING_BOX_SLACK = 3.0


@dataclass
class _BlockStats:
    total_blocks: int
    outlier_count: int
    outlier_fraction: float
    mean_error: float
    stddev_error: float
    bbox: tuple[int, int, int, int] | None  # (min_row, min_col, max_row, max_col)


def is_applicable(mime_type: str, context: dict) -> bool:
    """Whether ELA can say anything meaningful about this document at all -
    used by the orchestrator to skip it outright (recorded in
    checks_skipped) rather than running it and reporting a vacuous CLEAN."""
    if mime_type == "image/jpeg":
        return True
    if mime_type == "application/pdf":
        # See module docstring: missing/None key -> default False.
        return bool(context.get("has_jpeg_recompression_history"))
    return False


def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult:
    if mime_type == "application/pdf":
        return _run_on_pdf(file_bytes)
    return _run_on_jpeg_bytes(file_bytes, evidence_prefix="")


def _run_on_jpeg_bytes(jpeg_bytes: bytes, evidence_prefix: str) -> CheckResult:
    try:
        original = Image.open(io.BytesIO(jpeg_bytes))
        original.load()
        original = original.convert("RGB")
    except Exception:
        # Not decodable as an image at all - nothing ELA can say.
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    stats = _compute_block_stats(original)
    if stats is None:
        # Image too small for a meaningful block grid.
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    return _classify(stats, evidence_prefix)


def _run_on_pdf(file_bytes: bytes) -> CheckResult:
    import pikepdf

    try:
        pdf = pikepdf.open(io.BytesIO(file_bytes))
    except Exception:
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    jpeg_streams: list[tuple[str, bytes]] = []
    try:
        for page_index, page in enumerate(pdf.pages):
            try:
                images = page.get_images()
            except Exception:
                continue
            for name, raw in images.items():
                try:
                    pdf_image = pikepdf.PdfImage(raw)
                    filters = pdf_image.filters or []
                except Exception:
                    continue
                # pikepdf reports filter names with their PDF-syntax leading
                # slash (e.g. "/DCTDecode"), so match on substring rather
                # than assuming either form.
                if not any("DCTDecode" in str(f) for f in filters):
                    continue  # not actually JPEG-compressed - e.g. Flate/CCITT
                try:
                    # DCTDecode's raw stream bytes ARE a JPEG bitstream - no
                    # PIL decode/re-encode round trip needed to get at the
                    # genuine original compression history.
                    jpeg_streams.append((f"page {page_index + 1} image {name}", raw.read_raw_bytes()))
                except Exception:
                    continue
    finally:
        pdf.close()

    if not jpeg_streams:
        # is_applicable() said this PDF has JPEG history, but we couldn't
        # find any embedded JPEG stream - a disagreement, not evidence of
        # cleanliness. Don't fabricate a CLEAN from nothing actually checked.
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    combined_indicators: list[Indicator] = []
    statuses: list[CheckStatus] = []
    for label, jpeg_bytes in jpeg_streams:
        result = _run_on_jpeg_bytes(jpeg_bytes, evidence_prefix=f"{label}: ")
        statuses.append(result.status)
        combined_indicators.extend(result.indicators)

    if CheckStatus.SUSPICIOUS in statuses:
        overall = CheckStatus.SUSPICIOUS
    elif all(s == CheckStatus.CLEAN for s in statuses):
        overall = CheckStatus.CLEAN
    else:
        overall = CheckStatus.INCONCLUSIVE

    return CheckResult(status=overall, indicators=combined_indicators)


def _compute_block_stats(original: Image.Image) -> _BlockStats | None:
    buffer = io.BytesIO()
    original.save(buffer, format="JPEG", quality=_RESAVE_QUALITY)
    buffer.seek(0)
    resaved = Image.open(buffer).convert("RGB")

    diff = ImageChops.difference(original, resaved)

    width, height = original.size
    cols = width // _BLOCK_SIZE
    rows = height // _BLOCK_SIZE
    if cols * rows < _MIN_BLOCKS_FOR_ANALYSIS:
        return None

    block_errors: list[list[float]] = []
    flat_errors: list[float] = []
    for row in range(rows):
        row_errors: list[float] = []
        for col in range(cols):
            box = (
                col * _BLOCK_SIZE,
                row * _BLOCK_SIZE,
                (col + 1) * _BLOCK_SIZE,
                (row + 1) * _BLOCK_SIZE,
            )
            block = diff.crop(box)
            # Average of the per-channel means - a single scalar "how much
            # did this block move on re-save" score.
            channel_means = ImageStat.Stat(block).mean
            score = sum(channel_means) / len(channel_means)
            row_errors.append(score)
            flat_errors.append(score)
        block_errors.append(row_errors)

    total = len(flat_errors)
    mean_error = sum(flat_errors) / total
    variance = sum((e - mean_error) ** 2 for e in flat_errors) / total
    stddev_error = variance ** 0.5

    threshold = max(mean_error + _OUTLIER_Z * stddev_error, _OUTLIER_FLOOR)

    outlier_positions = [
        (row, col)
        for row in range(rows)
        for col in range(cols)
        if block_errors[row][col] > threshold
    ]

    bbox = None
    if outlier_positions:
        min_row = min(r for r, _ in outlier_positions)
        max_row = max(r for r, _ in outlier_positions)
        min_col = min(c for _, c in outlier_positions)
        max_col = max(c for _, c in outlier_positions)
        bbox = (min_row, min_col, max_row, max_col)

    return _BlockStats(
        total_blocks=total,
        outlier_count=len(outlier_positions),
        outlier_fraction=len(outlier_positions) / total,
        mean_error=mean_error,
        stddev_error=stddev_error,
        bbox=bbox,
    )


def _classify(stats: _BlockStats, evidence_prefix: str) -> CheckResult:
    if stats.outlier_count == 0 or stats.outlier_fraction < _MIN_SUSPICIOUS_FRACTION:
        # No block stands out from the image's own error-level baseline -
        # the textbook "roughly uniform error level" clean reading.
        return CheckResult(status=CheckStatus.CLEAN, indicators=[])

    if stats.outlier_fraction > _MAX_SUSPICIOUS_FRACTION:
        # Too much of the image stands out to call this a localized paste -
        # could be a generally high-detail/noisy image. Can't tell either
        # way with this technique alone.
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    min_row, min_col, max_row, max_col = stats.bbox
    bbox_area = (max_row - min_row + 1) * (max_col - min_col + 1)
    is_compact = bbox_area <= _MAX_BOUNDING_BOX_SLACK * stats.outlier_count

    if not is_compact:
        # Outliers exist but are scattered, not clustered into one region -
        # more consistent with generic texture/noise than a single paste.
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    evidence = (
        f"{evidence_prefix}block grid rows {min_row}-{max_row}, cols {min_col}-{max_col} "
        f"({stats.outlier_count}/{stats.total_blocks} blocks, "
        f"{stats.outlier_fraction:.1%}) show error level > "
        f"{_OUTLIER_Z}σ above the image mean ({stats.mean_error:.1f} ± "
        f"{stats.stddev_error:.1f} on a 0-255 scale) after a quality-{_RESAVE_QUALITY} resave."
    )
    indicator = Indicator(
        check=CheckName.ERROR_LEVEL_ANALYSIS,
        title="Localized error-level anomaly",
        description=(
            "A contiguous region of the image shows a distinctly different JPEG "
            "error-level signature than the rest of the image, consistent with "
            "content pasted in from a different compression history."
        ),
        confidence=Confidence.MEDIUM,
        evidence=evidence,
    )
    return CheckResult(status=CheckStatus.SUSPICIOUS, indicators=[indicator])
