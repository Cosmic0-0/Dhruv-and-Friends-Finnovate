# Document forensics

Passive tampering-indicator detection for uploaded documents (bank
statements, letterheads, IDs), separate from the message-checking feature
this app is built around. `POST /api/documents` (`docs/API-CONTRACT.md`)
stores a document's exact original bytes; `document-forensics/` (a local
Python microservice, see its own README for architecture) runs four checks
against those bytes, cheapest-first, and returns **indicators with a
confidence label** - never a verdict.

## What this produces

A `ForensicsReport`: an overall confidence (`none`/`low`/`medium`/`high` -
confidence *in the indicators found*, not a score of how "fake" a document
is), a list of indicators (each naming which check found it, a one-line
explanation, and its own confidence), which checks ran vs. were skipped and
why, and a separate `signature` field when a signature-like region was
found. "No tampering indicators found" is the exact wording when the list
is empty.

## What this does not claim, ever

- **No identity verification.** The signature-consistency check
  (`document-forensics/app/signature.py`) only measures stroke-width/
  pressure consistency of the signature region itself, against nothing -
  there is no reference signature on file to compare it to, so it can
  never identify or match a signer. Its output is a separate `signature`
  field in the response, never merged into the main `indicators` list, so
  it can't be misread as part of the document's overall assessment.
- **No legal authentication.** Nothing in this pipeline's output says
  "forged" or "authentic." This mirrors an existing pattern in this repo:
  `scanForErrorSignatures()` in `backend/src/services/site-security/
  checks.js` (the SQL/OS-command error-string scan) already reports "a
  possible weakness, not a confirmed vulnerability" rather than a yes/no
  verdict - this feature's indicator+confidence shape is the same idea
  applied to documents.
- **"No tampering indicators found" is not "verified."** An empty
  `indicators` list means the four checks that ran didn't find anything -
  it does not mean the document was confirmed genuine. The response text
  never uses "authentic," "verified," or "genuine."

## The four checks, cheapest-first

Each check only runs when the ones before it left the document genuinely
**inconclusive** (not just "found nothing") - see
`document-forensics/app/orchestrator.py` and its own tests for the exact
gating logic.

1. **Metadata/PDF forensics** (`checks/metadata_pdf.py`) - EXIF inspection
   for images; for PDFs, `pikepdf`-based incremental-update chain and
   embedded font-list checks, and `pdfplumber`-based text-layer-vs-page
   mismatch detection (the tell for a text box pasted over a scanned
   letterhead). CPU only, no model. Also owns the signature-region
   heuristic.
2. **Error Level Analysis** (`checks/ela.py`) - re-saves the image at a
   fixed JPEG quality and diffs against the original to surface regions
   with inconsistent compression history. CPU only, no model. Skipped
   (not run as a vacuous pass) for documents with no JPEG history.
3. **TruFor** (`checks/trufor.py`) - [github.com/grip-unina/TruFor](https://github.com/grip-unina/TruFor),
   a local PyTorch forgery-localization model, vendored under
   `document-forensics/vendor/trufor/`. Images only, and only when steps 1-2
   were inconclusive. **Its pretrained weights are licensed for nonprofit
   use only** - see `document-forensics/vendor/trufor/LICENSE.txt` before
   any commercial use of this feature.
4. **Layout/template comparison** (`checks/layout.py`) - a local Donut
   model (`naver-clova-ix/donut-base-finetuned-docvqa`) identifies what a
   document claims to be (institution, document type); a separate
   deterministic pixel-density measurement checks whether ink actually
   sits where that template expects (logo position, field layout) - not
   the model, which has no bounding-box output. Compared against a small,
   file-per-template set in `document-forensics/tests/fixtures/templates/`,
   deliberately easy to extend with more templates. Runs last, only when
   1-3 are all still inconclusive.

All four run entirely locally (PyTorch/transformers for stages 3-4) - no
third-party API call, no network access at inference time (see each
check's own `test_no_network_calls_during_run` test).

## Security

There is no public endpoint that returns a stored document's raw bytes -
see `docs/API-CONTRACT.md`'s `/api/documents` section. A stored document
can contain a bank statement or an ID, and this backend has no per-user
auth layer.
