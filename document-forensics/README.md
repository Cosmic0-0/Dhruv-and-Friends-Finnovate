# document-forensics

A local Python microservice, separate from `backend/` (Node) and `frontend/`
(Next.js) for the same reason those two are separate projects: different
language, different dependency footprint. Called by the Node backend over
localhost HTTP after it stores a document's original bytes
(`backend/src/services/document-store/`) - the same "another local process
over HTTP" pattern the backend already uses for Ollama. Never called from a
browser, never exposed publicly, never calls a third-party API.

## What this does and does not claim

Passive document forensics: a set of cheap-to-expensive checks that surface
**indicators** with a **confidence label** - never a verdict. Nothing this
service produces says "forged" or "authentic." This is the same pattern
`scanForErrorSignatures()` already uses in
`backend/src/services/site-security/checks.js` for the SQL/OS-command
error-string scan: a possible weakness, not a confirmed one, and it says so
in the finding text itself.

Specifically, this service never claims:
- **Identity verification.** The signature-consistency check only looks at
  internal stroke-width/pressure consistency of the signature region
  itself - there is no reference signature to compare against, so it never
  identifies or matches a signer. See `app/signature.py`.
- **Legal authentication.** "No tampering indicators found" is the honest
  response when nothing is found - never "authentic" or "verified." See
  `app/models.py`'s `ForensicsReport.summary`.

See `docs/DOCUMENT-FORENSICS.md` (repo root) for the product-facing version
of this.

## Architecture: cheapest-first, escalate only when needed

`app/orchestrator.py` runs four checks in a fixed order, and only reaches a
more expensive one when the cheaper ones left the document genuinely
**inconclusive** - not just "didn't find anything" (that's `clean`, and it
stops there):

1. **`checks/metadata_pdf.py`** - EXIF / PDF incremental-update chain /
   text-layer-vs-rendered-glyph mismatch. CPU only, no model. Also owns the
   signature-region heuristic (`find_signature_region`) and the internal
   stroke-consistency check (`app/signature.py`).
2. **`checks/ela.py`** - Error Level Analysis (Pillow re-save + diff).
   CPU only, no model. Skipped outright (not run as a vacuous pass) for
   documents with no JPEG compression history to analyze.
3. **`checks/trufor.py`** - [TruFor](https://github.com/grip-unina/TruFor)
   forgery localization. Local PyTorch inference. Only runs when 1-2 left
   the document inconclusive, and only on images (never PDFs directly).
4. **`checks/layout.py`** - Donut/LayoutLMv3-base structured extraction,
   compared against a small, extensible set of known-legitimate templates
   (`tests/fixtures/templates/`). Local `transformers` inference. Only runs
   when 1-3 are still inconclusive.

A `suspicious` result from any check wins outright and still skips the
checks after it - escalation only happens to *resolve* uncertainty, not to
pile on more findings once something's already been found.

Signature handling is a parallel, narrower track: if
`find_signature_region()` finds a candidate region, `app/signature.py` runs
independently of the four-stage escalation above and its result goes in the
response's separate `signature` field, never mixed into `indicators`.

## Deployment footprint follows the same principle

`checks/trufor.py` and `checks/layout.py` are imported **lazily**, inside
`orchestrator.analyze()`, specifically so that running the cheap checks (or
just importing this service) never requires PyTorch or `transformers` to be
installed. Their dependencies live in their own requirements files
(`requirements-trufor.txt`, `requirements-layout.txt`), not
`requirements-base.txt`.

## Running locally

Use **Python 3.12** - PyTorch (needed for stages 3-4) regularly lags behind
the newest CPython release; 3.12 is the safe choice on a machine that also
has a newer interpreter installed as `python3`. This project has no root
package the way `backend/`/`frontend/` avoid one; each service manages its
own virtualenv.

```bash
cd document-forensics
python3.12 -m venv .venv
./.venv/bin/pip install -r requirements-base.txt

# Only if you're working on (or want to actually run) stage 3:
./.venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
./.venv/bin/pip install -r requirements-trufor.txt
# One-time weight download - see checks/trufor.py's module docstring for
# the exact commands and MD5. Not committed (260MB); *.pth is gitignored.

# Only if you're working on (or want to actually run) stage 4:
./.venv/bin/pip install -r requirements-layout.txt
# First run downloads naver-clova-ix/donut-base-finetuned-docvqa (~2.5GB)
# into the shared ~/.cache/huggingface - one-time, out of band.

./.venv/bin/python -m pytest        # unit tests - fast, no model downloads
./.venv/bin/python -m app.main      # or: ./.venv/bin/uvicorn app.main:app --port 8081
```

Install `torch`/`torchvision` together in one `pip install` call, not two
separate ones - installing them separately can resolve a version pair whose
native extensions don't actually match (`RuntimeError: operator
torchvision::nms does not exist`), even though each install individually
reports success.

## Implementation status

All four checks are real, local-model implementations, not stubs - every
one is independently verified end-to-end against real weights, not just
mocked. `./.venv/bin/python -m pytest` is 55 tests, all passing, with all
four checks' dependencies installed.

| Stage | Module | Status |
|---|---|---|
| 1. Metadata/PDF forensics + signature region | `checks/metadata_pdf.py`, `app/signature.py` | done - EXIF, pikepdf incremental-update chain, pdfplumber text-layer/glyph mismatch, stroke-width signature check. CPU only, no model. |
| 2. Error Level Analysis | `checks/ela.py` | done - Pillow re-save/diff, block-level outlier clustering. CPU only, no model. |
| 3. TruFor | `checks/trufor.py`, `vendor/trufor/` | done - real vendored inference code + real pretrained weights (not committed; one-time download, see the module's docstring). **Nonprofit-use-only license** (GRIP-UNINA) - see `vendor/trufor/LICENSE.txt` before any commercial use of this repo. |
| 4. Layout/template comparison | `checks/layout.py` | done - Donut (`donut-base-finetuned-docvqa`) identifies what a document claims to be; a separate deterministic Pillow ink-density measurement (not the model - it has no bounding-box output) checks logo/field placement against `tests/fixtures/templates/*.json`. |
| Orchestrator, response contract, FastAPI app | `app/orchestrator.py`, `app/models.py`, `app/main.py` | done, tested (`tests/test_orchestrator.py`) |

Each module's docstring documents its own scope and honest limitations
(calibration basis, what a heuristic is/isn't proven against, etc.) - read
the module before relying on its output, this is a first pass calibrated
against a handful of fixtures, not a tuned production detector.
own test module (`tests/test_<check>.py`) plus fixtures.
