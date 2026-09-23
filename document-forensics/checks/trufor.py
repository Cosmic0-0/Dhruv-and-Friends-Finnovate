"""Stage 3: TruFor forgery localization model.

Same interface as the other checks:

    def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult

The orchestrator (app/orchestrator.py) only calls this when steps 1-2
(checks/metadata_pdf.py, checks/ela.py) left the document's status
INCONCLUSIVE - it is not run when the cheap checks already resolved the
document cleanly or suspiciously. Images only; PDFs never reach this check
directly (a PDF's embedded images, if any, would need to be extracted
first - out of scope for the initial integration, see README).

Integrates github.com/grip-unina/TruFor (grip-unina, GRIP-UNINA / Univ.
Federico II of Naples) to localize tampered regions in an image. Runs
entirely locally via PyTorch - no third-party API call, no network access
at inference time.

Real integration, not a stub: the inference-only model code (matching
TruFor's own `test_docker` Docker image, the smallest dependency set they
ship - no mmcv/mmsegmentation/mmcls, which are training-only deps of their
conda env and are never imported by this path) is vendored under
../vendor/trufor/ with one renamed package (see that directory's own
docstring in trufor_model/cmx/builder_np_conf.py for why). Pretrained
weights (grip.unina.it, MD5 7bee48f3476c75616c3c5721ab256ff8) are NOT
committed - they're a 260MB download, and this repo's existing
document-forensics/.gitignore already excludes `*.pth` and `models/` for
exactly this reason. Fetch them once, out of band, before running this
check for real:

    curl -o /tmp/TruFor_weights.zip \\
        https://www.grip.unina.it/download/prog/TruFor/TruFor_weights.zip
    unzip -p /tmp/TruFor_weights.zip weights/trufor.pth.tar \\
        > vendor/trufor/weights/trufor.pth

`run()` degrades to CheckStatus.INCONCLUSIVE (never CLEAN, never a crash)
if the weights file isn't present at vendor/trufor/weights/trufor.pth (or
the path in $TRUFOR_WEIGHTS_PATH) - the same "model unavailable is not the
same as clean" posture the rest of this service takes toward the LLM
pipeline elsewhere in this repo. Same posture for any unexpected inference
error.

Thresholds on the model's own 0-1 "integrity score" (`det`, see below) are
a first-pass calibration against TruFor's four bundled demo images
(test_docker/images/ upstream: 2 pristine, 2 tampered) - see
tests/test_trufor.py - not a tuned operating point on a held-out set.
"""

from __future__ import annotations

import io
import logging
import os
import sys
import threading
from pathlib import Path

from app.models import CheckName, CheckResult, CheckStatus, Confidence, Indicator

logger = logging.getLogger(__name__)

_VENDOR_DIR = Path(__file__).resolve().parent.parent / "vendor" / "trufor"
_WEIGHTS_ENV_VAR = "TRUFOR_WEIGHTS_PATH"
_DEFAULT_WEIGHTS_PATH = _VENDOR_DIR / "weights" / "trufor.pth"

# Long edge cap before inference: mit_b2's attention cost grows with token
# count, and this runs on CPU in this sandbox (no GPU) - 1024px keeps a
# single request in the low single-digit seconds on a modern CPU core
# (measured against the upstream demo images) instead of risking a slow
# request on a phone-camera-resolution upload during a live demo.
_MAX_LONG_EDGE = 1024

# First-pass thresholds on `det` (TruFor's own sigmoid "integrity score",
# 0=pristine-looking, 1=tampered-looking) - see module docstring. The gap
# between the two is deliberate: this check only escalates to a verdict
# when the score is unambiguous, otherwise it leaves the document
# INCONCLUSIVE for checks/layout.py (stage 4) to try next, rather than
# forcing a low-confidence call.
_SUSPICIOUS_THRESHOLD = 0.5
_CLEAN_THRESHOLD = 0.3
_HIGH_CONFIDENCE_THRESHOLD = 0.85

_model_lock = threading.Lock()
_model = None


def _weights_path() -> Path:
    override = os.environ.get(_WEIGHTS_ENV_VAR)
    return Path(override) if override else _DEFAULT_WEIGHTS_PATH


def _load_model():
    """Builds the vendored TruFor model and loads its checkpoint, once per
    process. Returns None (never raises) if the weights aren't present -
    callers treat that exactly like any other "model unavailable" case.

    Imports torch and the vendored model code lazily, inside this
    function rather than at module level, so that merely importing
    checks/trufor.py (which the orchestrator does eagerly once escalation
    is already decided, but which tests/test_orchestrator.py's
    `_block_import` proves never happens before that point) doesn't
    require torch to be installed a moment before it's actually needed.
    """
    global _model
    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model

        weights = _weights_path()
        if not weights.is_file():
            logger.warning("TruFor weights not found at %s; skipping (leaves document INCONCLUSIVE)", weights)
            return None

        vendor_str = str(_VENDOR_DIR)
        if vendor_str not in sys.path:
            sys.path.insert(0, vendor_str)

        import torch
        from trufor_config import _C as trufor_cfg
        from trufor_model.cmx.builder_np_conf import myEncoderDecoder

        cfg = trufor_cfg.clone()
        cfg.defrost()
        cfg.merge_from_file(str(_VENDOR_DIR / "trufor.yaml"))
        cfg.freeze()

        model = myEncoderDecoder(cfg=cfg)
        checkpoint = torch.load(str(weights), map_location="cpu", weights_only=False)
        model.load_state_dict(checkpoint["state_dict"])
        model.eval()

        _model = model
        return _model


def _load_and_resize(file_bytes: bytes):
    from PIL import Image

    image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    width, height = image.size
    scale = min(1.0, _MAX_LONG_EDGE / max(width, height))
    if scale < 1.0:
        image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.BILINEAR)
    return image


def run(file_bytes: bytes, mime_type: str, context: dict) -> CheckResult:
    model = _load_model()
    if model is None:
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    import numpy as np
    import torch
    import torch.nn.functional as F

    try:
        image = _load_and_resize(file_bytes)
        arr = np.array(image)
        rgb = torch.tensor(arr.transpose(2, 0, 1), dtype=torch.float)[None] / 256.0

        with torch.no_grad():
            pred, conf, det, _npp = model(rgb)

        pred = torch.squeeze(pred, 0)
        pred = F.softmax(pred, dim=0)[1]
        det_score = torch.sigmoid(det).item()
        frac_flagged = (pred > 0.5).float().mean().item()
        peak = pred.max().item()
    except Exception:
        # Same posture as a missing model: an inference failure (corrupt
        # image, unexpected tensor shape, out-of-memory on a huge upload)
        # must not take down the pipeline or read as a false CLEAN.
        logger.exception("TruFor inference failed; leaving document INCONCLUSIVE")
        return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])

    if det_score >= _SUSPICIOUS_THRESHOLD:
        confidence = Confidence.HIGH if det_score >= _HIGH_CONFIDENCE_THRESHOLD else Confidence.MEDIUM
        indicator = Indicator(
            check=CheckName.TRUFOR,
            title="TruFor forgery localization flagged a region",
            description=(
                "TruFor's forgery-localization model found image regions with an anomaly "
                "signature consistent with local tampering (e.g. splicing or inpainting)."
            ),
            confidence=confidence,
            evidence=(
                f"TruFor integrity score {det_score:.2f} (suspicious threshold {_SUSPICIOUS_THRESHOLD:.2f}); "
                f"{frac_flagged * 100:.1f}% of pixels exceed the localization map's 0.50 anomaly threshold, "
                f"peak {peak:.2f}."
            ),
        )
        return CheckResult(status=CheckStatus.SUSPICIOUS, indicators=[indicator])

    if det_score <= _CLEAN_THRESHOLD:
        return CheckResult(status=CheckStatus.CLEAN, indicators=[])

    return CheckResult(status=CheckStatus.INCONCLUSIVE, indicators=[])
