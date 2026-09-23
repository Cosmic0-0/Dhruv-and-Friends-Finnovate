# Document forensics

Two complementary passive document-forensics paths, for different file
types, with deliberately different output philosophies. Neither is a
duplicate of the other; see `docs/API-CONTRACT.md` for their exact request/
response shapes.

## `POST /api/analyze/document` — PDF/DOCX, deterministic verdict

Structural warning signs in a PDF or Word file (a signature pasted onto a
scan, text typed onto a scan, a change after digital signing, editing-tool
metadata, hidden text, active content) plus the document's own text,
through the same `runPipeline()` every other route uses. The `DOC-*`
findings are ordinary signals scored by `rs-1.4`, alongside every other
detector in this app — this path **does** produce one deterministic
verdict (`safe`/`suspicious`/`scam`), the same architecture as a
URL-lookalike or impersonation signal.

**2026-09-23: `FLOOR-DOC-FORGED-INSTITUTION` was removed.** It forced a hard
`high`/`scam` verdict when a pasted-image or typed-on-scan signal appeared
alongside a claimed institution, with no human review. That's a strong,
automated claim for a heuristic structural detector to make on its own —
concretely, this repo's separate image-forensics ML path (below) produced a
real false positive during testing (a synthetic, genuinely clean test image
flagged as tampered), which is the direct evidence behind removing the
floor rather than merely documenting a theoretical risk. `DOC-*` signals
still score real points via their own weights and the `DX-1` interaction
(combined with an actual impersonation/payment signal) — they just never
force the verdict on their own. See `docs/API-CONTRACT.md`'s
`/api/analyze/document` section for the current rule table.

## `POST /api/documents` — images, indicators only, no verdict

For file types the PDF/DOCX path above doesn't cover: a phone photo of a
document, not a proper scan-to-PDF (plus PDF metadata-only checks as a
secondary case). Stores the exact original bytes
(`backend/src/services/document-store/`) and runs them through
`document-forensics/`, a local Python microservice, cheapest-first through
four checks, returning **indicators with a confidence label — never a
verdict**. This is intentionally a different, more conservative posture
than the PDF/DOCX path above: the checks here lean on ML models (TruFor,
Donut) whose false-positive behavior on real-world documents isn't as well
understood as this app's existing deterministic rule engine, so the output
stops at "here's what looks off" rather than feeding a score.

### What this produces

A `ForensicsReport`: an overall confidence (`low`/`medium`/`high`, or
absent — confidence *in the indicators found*, not a score of how "fake" a
document is), a list of indicators (each naming which check found it, a
one-line explanation, and its own confidence), which checks ran vs. were
skipped and why, and a separate `signature` field when a signature-like
region was found. "No tampering indicators found" is the exact wording when
the list is empty.

### What this does not claim, ever

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
  `indicators` list means the checks that ran didn't find anything - it
  does not mean the document was confirmed genuine. The response text
  never uses "authentic," "verified," or "genuine."

### The four checks, cheapest-first

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
   any commercial use of this feature. Known to false-positive on
   non-photographic/synthetic input (observed directly during this
   feature's testing) - the reason `/api/analyze/document`'s equivalent
   floor rule was removed, see above.
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

There is currently no frontend entry point for this path (Caelum's
`/document` page only calls `/api/analyze/document`) - it's reachable via
the API only, pending a UI for standalone image uploads.

## Security

There is no public endpoint that returns a stored document's raw bytes -
see `docs/API-CONTRACT.md`'s `/api/documents` section. A stored document
can contain a bank statement or an ID, and this backend has no per-user
auth layer.
