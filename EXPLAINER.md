# FraudLens AI architecture

This document explains the system as it exists now. The authoritative response
shapes live in [`docs/API-CONTRACT.md`](./docs/API-CONTRACT.md); signal weights and
decision rules live in code.

## System overview

```text
Web PWA / Chrome extension / Outlook add-in
          |
          v
      Express API
          |
          v
 normalize and extract entities
          |
          +----------------------+----------------------+
          |                      |                      |
          v                      v                      v
 deterministic checks     community evidence     semantic model
 URLs, identity,          privacy-minimised       bounded enum codes
 lexicon, payment,        fingerprints/waves      and exact quotes
 template artifacts
          |                      |                      |
          +----------------------+----------------------+
                                 |
                                 v
                    signal validation and dedupe
                                 |
                                 v
                 deterministic risk engine and policy
                                 |
                                 v
                  verdict, trace, actions, optional
                    journey and campaign metadata
```

The model is an enrichment source. It does not calculate the score or make the
final decision. If Ollama and the hosted fallback are both unavailable, the API
still returns the findings that deterministic checks can support and marks the
semantic status as unavailable.

## Analysis flow

All text paths eventually call `backend/src/services/pipeline/runPipeline`. A
PDF/DOCX upload to `/api/analyze/document` also does (see "Document forensics"
below): its structural findings join the deterministic evidence through
`extraSignals`. An image upload to `/api/documents` does not; it returns
forensic indicators only.

1. Normalize text and compute a non-reversible input hash.
2. Extract the claimed institution from the shared registry.
3. Run deterministic detectors for URLs, identity consistency, lexicon phrases,
   prompt injection, template artifacts, payment context, email context, and link
   hygiene.
4. Evaluate matching community events without treating the current analysis as
   evidence for itself.
5. Ask the semantic model for allowed manipulation codes, exact evidence quotes,
   and optional sender/scam-stage metadata.
6. Reject off-enum signals and evidence that cannot be found in the message.
7. Deduplicate corroborating signals and score them with the versioned risk engine.
8. Apply decision and intervention policies, then optionally record
   privacy-minimised campaign/community observations.

The response includes both the compatibility fields (`verdict`, `riskScore`,
`signals`, `suggestedAction`) and the newer decision architecture (`risk`,
`decision`, `trace`, `actions`, and `analysis`).

## Document forensics

There are two document routes. They take different file types and make
different kinds of claim; `docs/DOCUMENT-FORENSICS.md` compares them.

| Route | Files | Where it runs | Output |
|---|---|---|---|
| `POST /api/analyze/document` | PDF, DOCX | Node: `backend/src/services/document-forensics/` | `DOC-*` signals and a normal verdict |
| `POST /api/documents` | PDF, PNG, JPEG, WEBP | Node stores the bytes (`document-store/`) and OCRs images; the optional Python service `document-forensics/` runs the checks, called through `document-forensics-client/` | Indicators with a confidence label, never a verdict |

The web app's `/document` page uses only the first route. The second is
reachable through the API only.

### PDF/DOCX: `POST /api/analyze/document`

`POST /api/analyze/document` checks a PDF or Word (.docx) file that feels off,
such as a bank form, statement, invoice or payment confirmation. It looks at
how the **file itself** was made, not only what it says. Each finding is a
normal deterministic signal (DOC-01..08, ruleset `rs-1.4`). The result is
still one verdict from the same risk engine.

```text
upload (base64 JSON, <=10MB) -> magic-byte type check (never the file name)
  -> worker thread (256MB heap, 15s hard timeout; terminated on overrun)
       PDF:  pdf.js operator list + text layer + decoded pixels,
             pdf-lib object enumeration, raw revision/signature bytes
       DOCX: bounded ZIP reader -> named XML parts only
     => plain facts (no verdicts, no signals)
  -> main thread: detectors.js (facts -> DOC-* signals), sharp previews,
     text layer or OCR of the first 3 scanned pages
  -> redact() -> cut to 5000 characters -> runPipeline(text, { extraSignals })
```

The flagship case is a signature pasted onto a scan. The overlay has a
transparent background and hard, pixelated edges, and was stretched far beyond
the scan's resolution. The detectors see this as a raster image drawn over a
full-page scan. The overlay's effective dpi (pixels per placed inch) is compared
with the scan's, and its alpha channel gives `hardEdgeRatio`. The result
carries a small PNG preview of the pasted image for the "Document integrity"
panel.

**Library choice (spike, 2026-09-23).** `pdfjs-dist` 6.3.289 (legacy build,
pinned exactly) passed all three spike checks in Node:

- (a) text items carry their font;
- (b) the operator list exposes the transformation matrix, image paints
  (including inside form XObjects), text render mode, glyph Unicode and fill
  colour;
- (c) decoded images arrive with an SMask merged into an alpha channel.

It also decodes every image filter (JPEG, Flate, JPX, JBIG2, CCITT), so real
scanner output works. Three 300-dpi A4 scans parsed in about 1.9s inside a
worker capped at 256MB heap. `pdf-lib` is used only to enumerate objects:
JavaScript, launch actions, attachments and form submissions are often packed
in compressed object streams that a raw byte scan cannot see. The spike found
an obfuscated `/J#61vaScript` action this way. Revision sections and
digital-signature ranges are read from the raw bytes. DOCX files are unzipped
by a small central-directory reader and fflate's streaming inflater with a
running output cap. fflate's one-shot `unzipSync` grows its buffer past
an entry's declared size, so it could not enforce a zip-bomb limit by itself.

pdf.js runs hardened: no font-face or system fonts, no XFA, no canvas, capped
image size, and resource tables read from the installed package, never the
network.

**Privacy.** The file must reach the server, as screenshots do. It is parsed in
memory, and its text and previews are never stored. A PDF's original bytes are
stored in SQLite, the same way `/api/documents` stores uploads (see "OCR,
privacy, and storage" below); a DOCX is not stored. The LLM receives only the
redacted text, never the file, its images or the forensic facts. The response
returns tool names and dates from the metadata. Author and "last saved by"
fields are read only to match against the editing-tool list, and are never
returned.

**False-positive guards.**

- Word, LibreOffice, scanners and PDF libraries are never "editing tools".
- A linearized file's second revision section is normal.
- Adding a signature, or appending long-term-validation data after one, is not
  an edit.
- A full-page image under lots of real text is a designed page, not a scan.
- Compact (MRC) scanner layers are not overlays.
- OCR'd scans legitimately carry invisible text.
- Bold/italic of the same font family is not a font outlier.
- Every weak signal alone stays LOW, and none reaches HIGH without a payment,
  impersonation or claimed-institution fact.

The fixtures in `data/test-payloads/documents/` demonstrate each case.

### Images: `POST /api/documents`

This route is for a photographed document, such as a phone photo of a bank
statement, which the PDF/DOCX route does not accept.

```text
upload (base64 JSON, <=15MB decoded) -> magic-byte type check (PDF/PNG/JPEG/WEBP)
  -> store the original bytes in SQLite (document-store)
  -> in parallel:
       OCR of the stored image (images only) -> redact()
       POST to the Python service (document-forensics/, default 127.0.0.1:8081)
  -> 201 { documentId, mimeType, byteLength, receivedAt, extractedText, forensics }
```

The Python service runs up to four checks, cheapest first, and only moves to
a more expensive one when the earlier checks were inconclusive: metadata and
PDF structure, error-level analysis (ELA), TruFor forgery localisation, then
a Donut layout comparison against known templates. TruFor and Donut are
local models.

The response never contains a verdict, a risk score or signals, and this
route does not call `runPipeline()`. The service reports indicators, each
with a confidence label, and says "no tampering indicators found" when it
has none, never "authentic" or "verified". A signature check reports only
the internal consistency of the signature strokes; it never identifies a
signer. This route stays conservative because the ML checks' false-positive
behaviour on real documents is not well understood yet.

The Python service is optional. When it is down, slow or failing, the upload
still succeeds and `forensics.status` is `"unavailable"`.
`GET /health/document-forensics` reports whether it is reachable.

## Model transport

`backend/src/services/analysis/llmClient.js` supports three modes:

- `local`: Ollama only.
- `fallback`: one configured hosted provider only.
- `auto`: Ollama first, then Anthropic, OpenAI, or OpenRouter when configured.

Requests use deterministic sampling where the provider supports it. Ollama is
called with JSON output and thinking disabled. Provider errors, timeouts, invalid
JSON, unknown codes, and ungrounded evidence are contained by the semantic layer
instead of failing the full analysis.

The hosted fallback is an operational dependency, not a theoretical checkbox.
Free-tier model latency has previously varied enough to threaten a live demo.
Run `npm run test:fallback` on the actual demo machine shortly before presenting.

## Deterministic evidence

- The institution registry supplies official names, aliases, and domains.
- Domain matching accepts official apex domains and subdomains, and flags
  typosquats or brand labels on unrelated domains.
- The multilingual lexicon detects explicit urgency, threats, payment requests,
  credential requests, channel switching, and other high-value phrases while
  handling selected negation and legitimate-notification cases.
- Identity consistency compares the claimed organization with linked domains and
  structured payment recipients.
- Payment context lets the Before You Pay flow add recipient mismatch and active
  coaching signals that cannot be inferred reliably from message text alone.
- Email context lets the Outlook add-in supply sender, Reply-To, Return-Path,
  authentication, attachment, and link metadata. These fields are evaluated by
  deterministic code and are not sent to the LLM.
- Template-artifact checks catch unrendered mail-merge syntax.
- Community evidence requires distinct pseudonymous reporters, excludes official
  identities and redaction placeholders, and cannot raise a strong floor without
  independent technical evidence.

The risk engine emits a trace so every point or floor can be explained. Semantic
evidence is capped, and strong decisions require deterministic corroboration.

## Language support

The semantic prompt supports English, French, and Kreol Morisien. For relevant
Kreol input, `kreolGrounding.js` retrieves a small set of reviewed corpus and
translation-memory entries. Draft or rejected entries are not used by default.

Language support is broader than prompt grounding: the deterministic lexicon also
contains language-specific patterns. Changes to Kreol data must preserve its
review status and provenance; generated text must never be relabelled as human
reviewed.

## OCR, privacy, and storage

Pasted text is redacted in the browser before it is sent. The local mapping is
kept with the result so placeholders can be restored for display. Screenshot bytes
must reach the backend for OCR; the server redacts the extracted text before the
analysis pipeline sees it.

The OCR route accepts PNG, JPEG, and WEBP content up to 5 MB after decoding and
checks magic bytes. Tesseract runs in memory. OCR text is returned to the user for
review before the normal text-analysis request is made.

SQLite (`DATABASE_URL`, default `backend/fraudlens.db`) stores:

- Uploaded documents, as original bytes (`documents` table). `POST
  /api/documents` stores every accepted PDF, PNG, JPEG or WEBP upload with its
  client-supplied file name, MIME type, size, SHA-256 and receive time. `POST
  /api/analyze/document` stores PDF uploads the same way, without a file name.
  These can be bank statements or identity documents. They are stored
  unencrypted, no route returns them, and nothing deletes them.
- Sender report counts keyed on the reported identifier (`reports`). A
  phone-shaped identifier is stored as its normalised digits.
- Privacy-minimised report events (fingerprints of redacted text and an HMAC
  pseudonym of the reporter's IP) and risk audit rows. These are deleted
  after `COMMUNITY_EVENT_RETENTION_DAYS` (default 90) and
  `COMMUNITY_AUDIT_RETENTION_DAYS` (default 180), checked at startup and
  every 6 hours.
- Campaign graph observations (`scam_dna*`): scam type, claimed identity,
  observed sender identifiers and lookalike domains.
- Organisation email observations, indicators and analyst outcome labels
  (`org_*`), keyed on HMAC pseudonyms of addresses and of the analyst's IP.
  A purge function exists but nothing calls it, so these rows are kept.
- Batch summary counts and cached domain registration dates.

Raw message text and raw reporter IP addresses are not stored. Apart from the
community events and audit rows, nothing has a retention period.

The prototype has no accounts or tenant isolation. Campaigns, trends, and sender
report counts should be treated as public demo data. Do not add user history APIs
until an authentication and ownership model exists.

## Product surfaces

The Next.js frontend provides:

- Check: paste/type or screenshot intake and the main result view.
- Document check: upload a PDF or Word file. The result screen adds a
  "Document integrity" panel with the file's facts, its findings in plain
  words, and previews of images found pasted onto a scan.
- Before You Pay: structured payment-context questions.
- Conversation: per-message analysis with the furthest observed journey stage.
- Batch: up to 50 messages with aggregate results and observed campaign groups.
- Replay: a staged explanation of the evidence already returned by the backend.
- Network: a React Flow graph for stored ScamDNA observations.
- Sandbox: a bounded, fictional scam sequence grounded in backend playbooks.
- Learn, Trends, Settings, recent checks, simple mode, and shareable safety cards.

Results and recent checks are browser-local. The backend does not provide user
accounts or personal history synchronization.

The Chrome extension calls the same backend for URL, text, report, and site
security checks. It does not contain its own fraud classifier. Page scanning is an
explicit user action. The extension is currently configured for
`http://localhost:4000` and `http://localhost:3000`; deployment requires updating
`extension/config.js` and the manifest `host_permissions` together.

The Outlook read-mode task pane sends the open message body and bounded metadata
to the same `/api/analyze` route. It does not scan the mailbox, download attachment
contents, or add a separate scoring system. Production deployment requires HTTPS,
an exact `OUTLOOK_ADDIN_ORIGINS` allowlist, and a production-rendered manifest; see
`outlook-addin/README.md`.

## Reliability and security boundaries

- API routes enforce message, batch, image and document limits and have per-IP
  rate limits. A body over a route's size limit gets a generic JSON 413.
- Uploaded documents are parsed only inside a worker thread with a heap limit
  and a hard timeout, at most two at a time. ZIP entry counts and declared sizes
  are checked before anything is inflated, and each inflated part has a hard
  output cap.
- Helmet supplies API security headers. Production HTTP is redirected when the
  deployment proxy supplies `x-forwarded-proto`.
- Site-security scans reject private/reserved destinations and revalidate network
  targets to reduce SSRF risk.
- Prompt-injection language is treated as a detectable signal, never as an
  instruction to the model.
- The sandbox validates finite types/stages, limits turns and line length, rejects
  links/contact details/markup, and falls back to scripted examples.
- Public trends mask phone-shaped identifiers to their last four digits.

`app.set("trust proxy", 1)` assumes exactly one trusted deployment proxy. A direct
public deployment with no proxy can let clients influence forwarded-IP handling,
so the setting must match the real topology before production use.

## Known limitations

- There is no authentication, per-user authorization, or tenant isolation.
- SQLite and in-process rate limiting suit a single demo instance, not horizontal
  scaling without a shared store and database plan.
- Semantic `scamType` and `stage` are optional and have been omitted by the local
  model in prior live checks. Journey, Replay, campaign, and network UI therefore
  may have no data even when the core verdict is correct. Re-evaluate this against
  the configured demo model rather than assuming unit tests prove model behavior.
- The hosted fallback must be tested with a real key; mocked tests only prove
  routing and validation.
- The extension has extensive automated syntax/logic coverage only through shared
  backend tests and manual steps; it still needs a load-unpacked browser smoke test.
- Outlook support depends on what each client exposes through Office.js. Missing
  authentication headers remain unknown rather than being treated as failures.
- ESLint is not configured. `npm run lint` prompts interactively and is not a CI
  check.
- The project does not declare/enforce Node 22, although frontend tests require it.
- Accessibility and responsive behavior need a final real-browser pass across the
  result, screenshot, document, batch, conversation, network, and extension flows.
- Document forensics finds warning signs, not proof. On both paths, metadata
  can be stripped or forged, and a forgery that was printed and scanned again
  leaves no structural trace.
- PDF/DOCX path (`/api/analyze/document`, Node):
  - It has no error-level analysis and no ML forgery model. Those exist only
    in the Python service used by `/api/documents`, which this route does
    not call.
  - PDF annotations and XFA forms are not inspected.
  - Legitimate e-signing tools can also place transparent signature images on a
    scan, which is why that finding alone is ELEVATED ("verify first"), not HIGH.
  - For PDFs with permissions-only encryption, the active-content scan is
    best-effort.
  - Only the first 10 pages are inspected, and at most 3 scanned pages are OCR'd.
- Image path (`/api/documents`, Python service):
  - ELA only applies to images with JPEG compression history; it is skipped
    for others.
  - TruFor has produced false positives on synthetic, non-photographic input.
    Its pretrained weights are licensed for nonprofit use only.
  - The layout comparison knows only the few templates in
    `document-forensics/tests/fixtures/templates/`.
  - The checks are calibrated against a handful of fixtures, not tuned on
    real-world documents.
  - There is no web UI for this route yet.

## Verification baseline

As of 2026-09-23 in the current worktree:

- Backend: 469 tests pass when localhost binding is allowed (run on Node
  24.18, the version installed on the build machine; the project targets 22).
- Backend: the 84-case deterministic eval (`npm run eval`) gives identical
  results under rs-1.3 and rs-1.4, and `npm run test:fallback` passes.
- Frontend: all 10 test files (95 tests) pass.
- Frontend: `npm run typecheck` passes.
- Frontend: `npm run build` passes and generates all 17 app routes.
- Outlook add-in: run `npm test`, `npm run build`, and `npm run validate` in
  `outlook-addin/`; the live fixture smoke test additionally requires the backend.
- Frontend lint: unavailable until ESLint is configured.

These checks validate code paths and contracts. They do not replace a real-model
run, OCR sample, browser interaction pass, extension smoke test, or fallback test
on the machine used for the demo.
