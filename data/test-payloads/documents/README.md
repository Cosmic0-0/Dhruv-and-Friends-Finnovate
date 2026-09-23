# Document forensics fixtures

Files for testing and demonstrating `POST /api/analyze/document` (see
`docs/API-CONTRACT.md`). They are generated. Do not edit them by hand;
regenerate them from `backend/`:

```bash
npm run fixtures:documents
```

The generator is `backend/scripts/make-document-fixtures.js`. It uses the builders in
`backend/src/services/document-forensics/fixture-builders.js`. The unit tests
build the same files in memory, so the tests never depend on these copies.

**Everything here is fictional.** "Northbridge Savings Bank" does not exist,
and "A. Sample" is not a person. The MCB-branded form says "SAMPLE - FICTIONAL
TEST DOCUMENT - NOT ISSUED BY MCB" on the page. MCB is used only because the
forged-institution rule needs a registry institution to be claimed. The
"macro" is inert placeholder bytes. The remote template points at a reserved
`.invalid` host, so it can never resolve.

## Expected results

The verdicts below come from the deterministic score (ruleset `rs-1.4`) with
the AI language pass off. When the AI pass is on, it can add inferred signals
and move a verdict up. For example, the forged form can show CRITICAL.

| File | What it is | Expected findings | Expected verdict |
|---|---|---|---|
| `legit-scan.pdf` | A scanned MCB funds-transfer form. The signature is part of the scan, there is an invisible OCR text layer, and the producer is a scanner. | none (PAY-01 from the text only) | LOW (8) |
| `forged-signature.pdf` | The same form scanned **without** a signature. A 116x44 px PNG signature with a hard-edged transparent background is stretched to 2.4 x 0.9 in on top: about 48 dpi on a 150 dpi scan, 3.1x lower. It was then re-saved as one incremental update by "iLovePDF". | DOC-04 `transparent_overlay` (with preview), DOC-01 iLovePDF, DOC-02 `incremental_update`, PAY-01, DX-1 | HIGH (66), `do_not_pay` |
| `edited-amount.pdf` | A scanned Northbridge statement. A box was painted over the closing balance, and "MUR 125,000.00" was typed on top in Helvetica. | DOC-05 (evidence: `MUR 125,000.00`) | ELEVATED (20) |
| `clean-native.pdf` | An ordinary text statement from a word processor, with consistent metadata and compressed object streams. | none | LOW (0) |
| `macro.docx` | A Word letter (macro-enabled content type) with a `vbaProject.bin` part. The part holds placeholder bytes, not real code. | DOC-07 `macro` | ELEVATED (30) |
| `external-template.docx` | A Word letter whose settings load a template from `https://templates.example.invalid/letterhead.dotm`. | DOC-07 `external_template` | ELEVATED (30) |
| `clean.docx` | An ordinary Word letter. | none | LOW (0) |
| `encrypted.pdf` | A PDF that needs a password to open. | none | 400 `document is password-protected` |

In the forged form, the incremental update rewrites only the document
information. That is what re-saving tools do to the metadata. The pasted
signature itself sits in the base revision. The detection does not depend on
which revision holds it.

## Manual checks

- To check "unsupported", rename any `.txt` file to `.pdf`: the type comes from the file's bytes, not its name.
- To check "too large", upload any file over 10 MB. The web app refuses it before uploading. The API returns 400, or 413 when the request body itself is over 14 MB.
