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

All text paths eventually call `backend/src/services/pipeline/runPipeline`:

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

SQLite stores aggregate report counts, privacy-minimised report events and audit
rows, batch summaries, cached domain ages, and campaign graph observations. Raw
message text and raw reporter IP addresses are not stored in those tables.

The prototype has no accounts or tenant isolation. Campaigns, trends, and sender
report counts should be treated as public demo data. Do not add user history APIs
until an authentication and ownership model exists.

## Product surfaces

The Next.js frontend provides:

- Check: paste/type or screenshot intake and the main result view.
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

- API routes enforce message, batch, and image limits and have per-IP rate limits.
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
  result, screenshot, batch, conversation, network, and extension flows.

## Verification baseline

As of 2026-09-23 in the current worktree:

- Backend: 160 tests pass when localhost binding is allowed.
- Frontend: all 9 test files pass under Node 22.
- Frontend: `npm run typecheck` passes.
- Frontend: `npm run build` passes and generates all 16 app routes.
- Outlook add-in: run `npm test`, `npm run build`, and `npm run validate` in
  `outlook-addin/`; the live fixture smoke test additionally requires the backend.
- Frontend lint: unavailable until ESLint is configured.

These checks validate code paths and contracts. They do not replace a real-model
run, OCR sample, browser interaction pass, extension smoke test, or fallback test
on the machine used for the demo.
