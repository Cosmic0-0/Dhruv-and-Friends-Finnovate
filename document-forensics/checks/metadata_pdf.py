"""Stage 1: metadata/PDF forensics. CPU only, no model.

Scope (see document-forensics/README.md "Implementation status"):
  - Images: EXIF inspection (Pillow's Image.getexif()) - missing/stripped
    EXIF, an image-editor Software tag, and inconsistent capture/modify
    timestamps, all as low/medium-confidence indicators only. A photo with
    no EXIF at all is common (most messaging apps and many exporters strip
    it) and is deliberately never treated as strong evidence on its own.
  - PDFs (pikepdf): the incremental-update chain (how many revisions, and
    whether the declared creation/modification metadata is consistent with
    that chain), plus embedded font-list consistency.
  - PDFs (pdfplumber): mismatches between the text layer and the visible
    page - a text run positioned entirely off the rendered page, or a page
    with images but no extractable text while sibling pages in the same
    document have one.
  - Also owns the signature-region heuristic (find_signature_region) -
    CPU-only image analysis, same cost class as everything else here. The
    internal stroke-consistency check itself lives in app/signature.py.
"""

from __future__ import annotations

import io
import re

import pdfplumber
import pikepdf
from PIL import ExifTags, Image

from app.models import CheckName, CheckResult, CheckStatus, Confidence, Indicator

_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

# Substrings (lowercased) of an EXIF Software tag that name an image
# editor rather than a camera/scanner firmware string. Deliberately a
# short, obvious list - this is a hint, not an exhaustive detector.
_EDITOR_SOFTWARE_MARKERS = (
    "photoshop",
    "gimp",
    "paint.net",
    "lightroom",
    "snapseed",
    "pixlr",
    "affinity photo",
    "illustrator",
    "picsart",
    "canva",
)

_TAG_SOFTWARE = 0x0131
_TAG_DATETIME = 0x0132
_TAG_DATETIME_ORIGINAL = 0x9003
_TAG_DATETIME_DIGITIZED = 0x9004
_EXIF_DATE_RE = re.compile(r"^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$")
_PDF_DATE_RE = re.compile(r"^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})")

# A gap larger than this between two EXIF timestamps is flagged as weak
# evidence; an order *inversion* (modified before captured) is flagged
# regardless of gap size, since that ordering cannot happen honestly.
_EXIF_GAP_SECONDS = 30 * 24 * 3600


def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult:
    if mime_type in _IMAGE_MIME_TYPES:
        return _run_image(file_bytes, mime_type, context)
    if mime_type == "application/pdf":
        return _run_pdf(file_bytes, context)
    # Nothing in this service's document-store ever sniffs to anything
    # else, but if it did, guessing CLEAN would be dishonest - we simply
    # don't have a check for it.
    return CheckResult(status=CheckStatus.INCONCLUSIVE)


def find_signature_region(file_bytes: bytes, mime_type: str, context: dict):
    """Returns a cropped, grayscale PIL.Image of a candidate signature
    region, or None. See app/models.py's SignatureReport: this stays a
    narrow, honestly-labeled heuristic, never identity verification."""
    if mime_type in _IMAGE_MIME_TYPES:
        return _find_signature_region_image(file_bytes)
    if mime_type == "application/pdf":
        return _find_signature_region_pdf(file_bytes)
    return None


# --------------------------------------------------------------------------
# Shared status rule
# --------------------------------------------------------------------------


def _status_from_indicators(indicators: list[Indicator]) -> CheckStatus:
    """CLEAN only when nothing was found at all. SUSPICIOUS when at least
    one indicator is confident enough (MEDIUM/HIGH) to stand on its own.
    INCONCLUSIVE when everything found is LOW confidence only - a genuine
    "noticed something, not sure" case, which is exactly what should let
    the orchestrator escalate to a more expensive check rather than settle
    for a weak signal."""
    if not indicators:
        return CheckStatus.CLEAN
    if any(i.confidence in (Confidence.MEDIUM, Confidence.HIGH) for i in indicators):
        return CheckStatus.SUSPICIOUS
    return CheckStatus.INCONCLUSIVE


# --------------------------------------------------------------------------
# Images: EXIF inspection
# --------------------------------------------------------------------------


def _run_image(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult:
    context["has_jpeg_recompression_history"] = mime_type == "image/jpeg"

    try:
        image = Image.open(io.BytesIO(file_bytes))
        exif = image.getexif()
    except Exception:
        return CheckResult(status=CheckStatus.INCONCLUSIVE)

    indicators: list[Indicator] = []

    if not exif:
        if mime_type == "image/jpeg":
            indicators.append(
                Indicator(
                    check=CheckName.METADATA_PDF,
                    title="No EXIF metadata present",
                    description=(
                        "This JPEG carries no EXIF metadata at all. A genuine camera or "
                        "scanner photo usually has some, but EXIF is routinely stripped "
                        "by messaging apps and export tools, so this alone is weak evidence."
                    ),
                    confidence=Confidence.LOW,
                    evidence="Image.getexif() returned no tags",
                )
            )
        return CheckResult(status=_status_from_indicators(indicators), indicators=indicators)

    software = exif.get(_TAG_SOFTWARE)
    if isinstance(software, str) and any(marker in software.lower() for marker in _EDITOR_SOFTWARE_MARKERS):
        indicators.append(
            Indicator(
                check=CheckName.METADATA_PDF,
                title="Image-editor software tag present",
                description=(
                    "The EXIF Software field names an image editor rather than camera or "
                    "scanner firmware, meaning this file was processed after capture/scan."
                ),
                confidence=Confidence.MEDIUM,
                evidence=f"EXIF Software = \"{software}\"",
            )
        )

    try:
        sub_exif = exif.get_ifd(ExifTags.IFD.Exif)
    except Exception:
        sub_exif = {}

    original = _parse_exif_date(sub_exif.get(_TAG_DATETIME_ORIGINAL))
    digitized = _parse_exif_date(sub_exif.get(_TAG_DATETIME_DIGITIZED))
    modified = _parse_exif_date(exif.get(_TAG_DATETIME))

    if original and modified:
        delta = (modified - original).total_seconds()
        if delta < -60:
            indicators.append(
                Indicator(
                    check=CheckName.METADATA_PDF,
                    title="Modification timestamp predates capture timestamp",
                    description=(
                        "EXIF DateTime (modified) is earlier than DateTimeOriginal (captured), "
                        "an ordering that can't happen honestly and suggests the metadata "
                        "itself was edited."
                    ),
                    confidence=Confidence.MEDIUM,
                    evidence=f"DateTimeOriginal={original.isoformat()} DateTime={modified.isoformat()}",
                )
            )
        elif delta > _EXIF_GAP_SECONDS:
            indicators.append(
                Indicator(
                    check=CheckName.METADATA_PDF,
                    title="Large gap between capture and modification timestamps",
                    description=(
                        "EXIF DateTime is much later than DateTimeOriginal. Re-exports and "
                        "re-saves can legitimately do this, so this alone is weak evidence."
                    ),
                    confidence=Confidence.LOW,
                    evidence=f"DateTimeOriginal={original.isoformat()} DateTime={modified.isoformat()}",
                )
            )

    if original and digitized and abs((digitized - original).total_seconds()) > _EXIF_GAP_SECONDS:
        indicators.append(
            Indicator(
                check=CheckName.METADATA_PDF,
                title="Capture and digitization timestamps disagree",
                description=(
                    "EXIF DateTimeOriginal and DateTimeDigitized differ by an unusually "
                    "large margin for what should normally be the same or a near-identical "
                    "moment."
                ),
                confidence=Confidence.LOW,
                evidence=f"DateTimeOriginal={original.isoformat()} DateTimeDigitized={digitized.isoformat()}",
            )
        )

    return CheckResult(status=_status_from_indicators(indicators), indicators=indicators)


def _parse_exif_date(value):
    if not isinstance(value, str):
        return None
    match = _EXIF_DATE_RE.match(value.strip())
    if not match:
        return None
    from datetime import datetime

    year, month, day, hour, minute, second = (int(g) for g in match.groups())
    try:
        return datetime(year, month, day, hour, minute, second)
    except ValueError:
        return None


# --------------------------------------------------------------------------
# PDFs
# --------------------------------------------------------------------------


def _run_pdf(file_bytes: bytes, context: dict) -> CheckResult:
    indicators: list[Indicator] = []

    revision_count = _count_pdf_revisions(file_bytes)
    indicators += _revision_indicators(revision_count)

    try:
        pdf = pikepdf.open(io.BytesIO(file_bytes))
    except Exception:
        # The raw byte scan above still stands, but without a parseable
        # structure the rest of this check genuinely can't say anything.
        status = _status_from_indicators(indicators) if indicators else CheckStatus.INCONCLUSIVE
        return CheckResult(status=status, indicators=indicators)

    indicators += _check_pdf_timestamps(pdf, revision_count)
    indicators += _check_pdf_fonts(pdf)
    context["has_jpeg_recompression_history"] = _pdf_has_jpeg_images(pdf)
    indicators += _check_pdf_text_layer(file_bytes)

    return CheckResult(status=_status_from_indicators(indicators), indicators=indicators)


def _count_pdf_revisions(file_bytes: bytes) -> int:
    # Counting raw "%%EOF" markers is the same approach already relied on
    # by backend/src/services/document-store/index.test.js for this same
    # fixture family - simple, robust to pikepdf normalizing the file on
    # open, and good enough for a revision *count* (not a full diff of
    # what changed between revisions, which would need walking the xref
    # /Prev chain object-by-object).
    return file_bytes.count(b"%%EOF")


def _revision_indicators(revision_count: int) -> list[Indicator]:
    if revision_count >= 3:
        return [
            Indicator(
                check=CheckName.METADATA_PDF,
                title="Multiple incremental updates found",
                description=(
                    "This PDF has been incrementally updated (saved on top of a prior "
                    "revision, rather than fully rewritten) several times. One such update "
                    "is common and often benign (e.g. adding a digital signature); several "
                    "is more indicative of repeated undisclosed edits."
                ),
                confidence=Confidence.MEDIUM,
                evidence=f"{revision_count} revisions (%%EOF markers) found in the raw file",
            )
        ]
    if revision_count == 2:
        return [
            Indicator(
                check=CheckName.METADATA_PDF,
                title="One incremental update found",
                description=(
                    "This PDF has a single incremental update after its initial save. This "
                    "is a completely normal way to add a digital signature or annotation "
                    "and is not suspicious by itself."
                ),
                confidence=Confidence.LOW,
                evidence="2 revisions (%%EOF markers) found in the raw file",
            )
        ]
    return []


def _check_pdf_timestamps(pdf: pikepdf.Pdf, revision_count: int) -> list[Indicator]:
    try:
        docinfo = pdf.docinfo
    except Exception:
        return []

    creation = _parse_pdf_date(docinfo.get("/CreationDate")) if docinfo else None
    modified = _parse_pdf_date(docinfo.get("/ModDate")) if docinfo else None
    if not (creation and modified):
        return []

    delta = (modified - creation).total_seconds()
    if delta < -60:
        return [
            Indicator(
                check=CheckName.METADATA_PDF,
                title="PDF modification date predates creation date",
                description=(
                    "The document metadata's ModDate is earlier than its CreationDate, an "
                    "ordering that can't happen honestly and suggests the metadata was "
                    "edited directly."
                ),
                confidence=Confidence.MEDIUM,
                evidence=f"CreationDate={creation.isoformat()} ModDate={modified.isoformat()}",
            )
        ]
    if delta > 60 and revision_count <= 1:
        return [
            Indicator(
                check=CheckName.METADATA_PDF,
                title="Modification date differs with no incremental-save trail",
                description=(
                    "The metadata's ModDate differs from CreationDate, claiming an edit "
                    "happened, but the file has no incremental-update structure to show "
                    "what changed - consistent with the metadata being set directly rather "
                    "than reflecting a real edit history."
                ),
                confidence=Confidence.LOW,
                evidence=f"CreationDate={creation.isoformat()} ModDate={modified.isoformat()} revisions={revision_count}",
            )
        ]
    return []


def _parse_pdf_date(value):
    if value is None:
        return None
    text = str(value)
    match = _PDF_DATE_RE.match(text)
    if not match:
        return None
    from datetime import datetime

    year, month, day, hour, minute, second = (int(g) for g in match.groups())
    try:
        return datetime(year, month, day, hour, minute, second)
    except ValueError:
        return None


def _check_pdf_fonts(pdf: pikepdf.Pdf) -> list[Indicator]:
    # Keyed by BaseFont name (not by the per-page resource name, which is
    # normally reused independently on every page and means nothing on
    # its own): if the same font *name* is declared with a different
    # Subtype/FontDescriptor combination somewhere else in the document,
    # that's a mismatch worth a low-confidence note, not a confident claim
    # - legitimate documents occasionally embed the same font family two
    # different ways for different scripts.
    seen: dict[str, set] = {}
    try:
        for page in pdf.pages:
            fonts = page.get("/Resources", {}).get("/Font", {})
            for font_obj in dict(fonts).values():
                base_font = font_obj.get("/BaseFont")
                if base_font is None:
                    continue
                name = str(base_font)
                subtype = str(font_obj.get("/Subtype", ""))
                has_descriptor = "/FontDescriptor" in font_obj
                seen.setdefault(name, set()).add((subtype, has_descriptor))
    except Exception:
        return []

    indicators = []
    for name, signatures in seen.items():
        if len(signatures) > 1:
            indicators.append(
                Indicator(
                    check=CheckName.METADATA_PDF,
                    title="Inconsistent font declaration",
                    description=(
                        f"The font \"{name}\" is declared with {len(signatures)} different "
                        "definitions in this document, which can indicate content from "
                        "different sources or tools was combined into one file."
                    ),
                    confidence=Confidence.LOW,
                    evidence=f"font={name} distinct_definitions={len(signatures)}",
                )
            )
    return indicators


def _pdf_has_jpeg_images(pdf: pikepdf.Pdf) -> bool:
    try:
        for page in pdf.pages:
            for img in page.get_images().values():
                filt = img.get("/Filter")
                names = filt if isinstance(filt, pikepdf.Array) else [filt]
                if any(str(n) == "/DCTDecode" for n in names if n is not None):
                    return True
    except Exception:
        pass
    return False


def _check_pdf_text_layer(file_bytes: bytes) -> list[Indicator]:
    indicators: list[Indicator] = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages_info = []
            margin = 2  # points of tolerance around the page edge
            for index, page in enumerate(pdf.pages):
                text = (page.extract_text() or "").strip()
                images = page.images
                pages_info.append((index, text, images))

                for word in page.extract_words():
                    off_page = (
                        word["x1"] < -margin
                        or word["x0"] > page.width + margin
                        or word["bottom"] < -margin
                        or word["top"] > page.height + margin
                    )
                    if off_page:
                        indicators.append(
                            Indicator(
                                check=CheckName.METADATA_PDF,
                                title="Text positioned outside the visible page area",
                                description=(
                                    "This page's content stream contains a text run whose "
                                    "position places it entirely outside the visible page - "
                                    "the classic tell for a text layer that doesn't visually "
                                    "correspond to anything on the rendered page."
                                ),
                                confidence=Confidence.HIGH,
                                evidence=(
                                    f'page {index + 1}, word "{word["text"]}" at '
                                    f'({word["x0"]:.0f},{word["top"]:.0f})-({word["x1"]:.0f},{word["bottom"]:.0f}) '
                                    f"vs page size {page.width:.0f}x{page.height:.0f}"
                                ),
                            )
                        )
                        break  # one confirmed occurrence is enough evidence for this page

            has_real_text_elsewhere = any(len(text) > 20 for _, text, _ in pages_info)
            if has_real_text_elsewhere:
                for index, text, images in pages_info:
                    if images and not text:
                        indicators.append(
                            Indicator(
                                check=CheckName.METADATA_PDF,
                                title="Page has an embedded image but no extractable text",
                                description=(
                                    "This page contains an embedded image and no extractable "
                                    "text layer, while other pages in the same document do "
                                    "have one - consistent with a scanned or pasted page "
                                    "substituted into an otherwise born-digital document."
                                ),
                                confidence=Confidence.MEDIUM,
                                evidence=f"page {index + 1} has {len(images)} image(s) and 0 extractable characters",
                            )
                        )
    except Exception:
        return []
    return indicators


# --------------------------------------------------------------------------
# Signature region heuristic (images and PDFs)
# --------------------------------------------------------------------------


def _find_signature_region_image(file_bytes: bytes):
    # Heuristic, not a detector: a handwritten signature conventionally
    # sits near the bottom of a signed page/photo and, unlike a block of
    # printed text (dense, fairly uniform ink coverage row to row), shows
    # up as a comparatively sparse, irregular ink blob. This only looks at
    # overall ink coverage in the bottom band - it makes no attempt at
    # real handwriting detection and will be wrong on unusual layouts.
    try:
        image = Image.open(io.BytesIO(file_bytes)).convert("L")
    except Exception:
        return None

    width, height = image.size
    if width < 20 or height < 20:
        return None

    band_top = int(height * 0.75)
    band = image.crop((0, band_top, width, height))
    mask, ink_fraction = _binarize_band(band)
    if not (0.003 <= ink_fraction <= 0.20):
        # Blank band (nothing to see) or too dense (looks like printed
        # content, not a compact handwritten mark).
        return None

    bbox = mask.getbbox()
    if bbox is None:
        return None
    x0, y0, x1, y1 = bbox
    if x1 - x0 < 6 or y1 - y0 < 6:
        return None

    # Crop the original grayscale band (not the binary mask) so
    # run_signature_check has real tonal detail to measure from.
    return image.crop((x0, band_top + y0, x1, band_top + y1))


def _binarize_band(band: Image.Image):
    hist = band.histogram()
    total = band.width * band.height
    if total == 0:
        return band, 0.0
    mean = sum(i * c for i, c in enumerate(hist)) / total
    threshold = max(60, min(200, mean * 0.75))
    ink_pixels = sum(hist[: int(threshold)])
    mask = band.point(lambda p: 255 if p < threshold else 0)
    return mask, ink_pixels / total


def _find_signature_region_pdf(file_bytes: bytes):
    # Narrower still than the image heuristic: this service has no PDF
    # rasterizer, so it can only look for an embedded raster image sitting
    # in the bottom band of the *last* page - the common case of a
    # scanned/pasted signature stamp - and says nothing about a vector-
    # drawn signature or one on an earlier page. Finding no candidate is
    # the normal, unremarkable case for a born-digital PDF with no such
    # image, not evidence of anything.
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            if not pdf.pages:
                return None
            page_index = len(pdf.pages) - 1
            page = pdf.pages[page_index]
            band_top = page.height * 0.7
            candidates = [
                image
                for image in page.images
                if image["bottom"] >= band_top
                and image["width"] <= page.width * 0.6
                and image["height"] <= page.height * 0.35
            ]
    except Exception:
        return None

    if not candidates:
        return None
    target = max(candidates, key=lambda image: image["bottom"])

    try:
        pdf = pikepdf.open(io.BytesIO(file_bytes))
        images = pdf.pages[page_index].get_images()
        img_obj = images.get(f"/{target['name']}")
        if img_obj is None:
            return None
        crop = pikepdf.PdfImage(img_obj).as_pil_image()
    except Exception:
        return None

    return crop.convert("L") if crop.mode != "L" else crop
