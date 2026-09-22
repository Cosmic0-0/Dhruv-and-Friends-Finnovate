# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Judging Priorities (derived from docs/JURY-EVALUATION.md)

- Reliability during the live demo is the single highest-weighted concern (part of
  the 35-mark Implementation & Functionality criterion, the largest bucket). The
  local-LLM-over-Tailscale architecture must have a working, tested fallback to a
  hosted API. The fallback path is NOT optional polish, treat it as a blocking
  requirement for demo readiness, not a stretch feature.
- Differentiators (Kreol language support, localized scam dataset, structured
  signal breakdown, domain/lookalike-URL matching, self-hosted inference) must be
  visibly demonstrated in the live demo, not just present in code. When implementing
  any of these features, also note in code comments or a demo-script file how it will
  be shown/explained live, since Innovation & Technical Excellence (25 marks)
  explicitly scores differentiation from other teams on the same challenge.
  scalability and real-world impact explicitly.
- Presentation coordination (15 marks) depends on a stable, rehearsed demo flow.
  Flag any feature that introduces live network or hardware dependency (e.g. calling
  out to a laptop-hosted model) as something that needs a pre-demo reliability test,
  not just a functionality test.

See `docs/JURY-EVALUATION.md` for the full rubric and `docs/BUILD-CHECKLIST.md` for
tasks grouped and weighted by these criteria.

## Commit attribution

Commits and PRs from this repo are attributed to the human pushing them only.
Do not add `Co-Authored-By: Claude` (or any other Claude/Anthropic attribution
line) to commit messages or PR descriptions for this project.

## Name policy

Kshitij's name is not to appear anywhere in this project — code, comments,
READMEs, commit messages/authorship, or PR descriptions — except in this
file (`CLAUDE.md`). When referring to that role elsewhere, describe the
area owned (e.g. "backend owner") instead of naming the person.

## Project

FraudLens AI — built for Finnovate Hackathon 2026 (Challenge 5, sponsored by Clarity).
Theme: FinTech & Innovation. 72-hour build.

Challenge question: How can AI help customers identify warning signs in suspicious
financial messages before they make a payment?

Core loop: a user submits a message (pasted text or screenshot) → the system analyzes
it for scam signals → returns a verdict with a structured breakdown of flagged signals
(not just a single score) → suggests a concrete next action (block sender, report to
bank fraud line, verify via official channel).

See "Role gating" below for the working-directory layout each role builds in.

## Scope boundaries (72-hour build)

**In scope for the hackathon window:**
1. Message analysis endpoint (paste text → verdict + structured signal breakdown + suggested action).
2. Localized scam pattern detection — reference dataset of real Mauritius-specific
   scam formats (bank impersonation SMS for MCB, SBM, Absa Mauritius, Bank One;
   telecom prize scams; mobile money fraud).
3. Kreol language support — scam messages and UI must work in Kreol, French, and
   English, including code-switched messages mixing all three in one text.
4. Structured signal breakdown as output — specific flags (sender mismatch, urgency
   language, lookalike URL, spoofed identity) as structured data, never a single
   opaque percentage.
5. Domain/lookalike-URL matching — links in messages checked against known
   legitimate local bank/telecom domains, via non-LLM logic.
6. Crowdsourced threat feed — users can report scam messages; flagged senders are
   tracked and surfaced on future matches ("this number reported N times").
7. Screenshot/OCR ingestion — upload a screenshot instead of pasting text.
8. Batch scan — submit multiple messages at once, get a scanned summary.

**Stretch (only after the core app is demo-stable):**
- Browser extension: reads the current tab's URL, checks it against the same
  backend domain-matching logic used for message links, shows a warning badge.
  Must reuse the core API — never duplicate detection logic in the extension.
  Scoped and built **after** the core app works end-to-end, not in parallel from
  hour zero.

## Tech stack

- **Backend**: Node.js, REST API.
- **Frontend**: Next.js, shipped as an installable PWA (manifest + service
  worker) so the same codebase covers both the web app and "mobile app" —
  no separate native/React Native codebase for the hackathon window.
- **Detection logic**: LLM-based analysis with structured JSON output (flagged
  signals, verdict, suggested action) + non-LLM domain-matching logic for URLs.
  The LLM runs **locally** (self-hosted inference, e.g. Ollama or similar) —
  model choice is TBD. Don't hardcode a cloud provider SDK/API key assumption
  in the analysis service; call it through a local inference endpoint
  (base URL + model name from env) so the model can be swapped later.
- **OCR**: for screenshot ingestion.
- **Database**: for crowdsourced sender/message reports and batch scan history.

## Role ownership

Each role owns its area end to end, including its own tests and demo data for that
area, unless noted otherwise.

| Owner | Area | Responsibilities |
|---|---|---|
| Kshitij | Backend + browser extension (stretch, droppable under time pressure) | API design, prompt design and structured output schema, domain/lookalike-URL matching logic, database schema for reports and batch history, browser extension scaffolding (Manifest V3, content script) once the API is stable |
| Joshua | Kreol language support | Kreol scam dataset, prompt tuning for Kreol/French/English code-switching, validating AI explanations read correctly in Kreol |
| Oleg | UI | Main app frontend (input, verdict display, flagged-signal view, batch scan results), PWA manifest/service worker so the app installs on mobile, extension badge/warning UI once the backend endpoint is live |
| Dhruv | OCR ingestion + batch scan | Screenshot upload, OCR extraction pipeline, batch scan feature (multi-message upload and summary view) |
| Caellum | Test payloads and QA | Scam message test set across English, French, and Kreol (Kreol set coordinated with Joshua), sender-reputation seed data for the crowdsourced feed demo, edge-case testing, demo script for final judging |

## Role gating

Each top-level working directory is gated to one owner. Only touch a
directory outside your own when you're wiring up an agreed interface (e.g.
Oleg calling the `POST /api/analyze` contract) — don't edit someone else's
implementation files directly; flag it to them instead.

```
backend/
  src/
    routes/                    Kshitij  — API route handlers
    services/analysis/         Kshitij  — LLM prompt + structured output schema
    services/domain-matching/  Kshitij  — lookalike-URL / domain matching logic
    services/ocr/              Dhruv    — screenshot upload + OCR extraction
    services/batch/            Dhruv    — batch scan aggregation/summary
    db/                        Kshitij  — schema for reports + batch history
frontend/                      Oleg     — Next.js UI (input, verdict, batch views) + PWA manifest/service worker
extension/                     Kshitij  — browser extension (stretch, after core app is stable)
data/kreol-dataset/            Joshua   — Kreol/French/English scam samples
data/test-payloads/            Caellum  — cross-language scam test set
data/sender-reputation-seed/   Caellum  — seed data for the crowdsourced feed demo
```

`backend/` and `frontend/` are separate Node projects — each person runs
`npm install` inside their own directory, not at the repo root. Every gated
directory that isn't self-explanatory has its own `README.md` restating its
owner and scope.

Everyone except the backend owner works on their own branch (`joshua`,
`oleg`, `dhruv`, `caellum`) and opens a PR into `main`; the backend owner
merges. This is a convention, not an enforced GitHub rule — no branch
protection is configured, so it relies on everyone actually using their
branch instead of pushing straight to `main`.

## API Contract (PLACEHOLDER — must be agreed and locked before parallel work starts)

This is the first thing to fill in. Oleg (UI), Dhruv (OCR/batch), and the extension
work all build against this contract before backend logic is finished, so changes
here should be flagged to all owners.

### `POST /api/analyze` — message analysis

```
Request:
{
  "message": string,        // raw pasted text
  "language"?: string       // optional hint: "en" | "fr" | "kreol" | "mixed"
}

Response:
{
  "verdict": "safe" | "suspicious" | "scam",
  "signals": [
    {
      "type": string,        // e.g. "sender_mismatch" | "urgency_language" | "lookalike_url" | "spoofed_identity"
      "description": string,
      "severity": "low" | "medium" | "high"
    }
  ],
  "suggestedAction": string, // e.g. "block_sender" | "report_to_bank" | "verify_official_channel"
  "explanation": string      // human-readable summary, localized to input language
}
```

### `POST /api/batch-scan` — batch scan

```
Request:
{
  "messages": string[]      // multiple raw messages
}

Response:
{
  "results": [
    { "message": string, "verdict": ..., "signals": [...], "suggestedAction": ... }
  ],
  "summary": {
    "total": number,
    "scamCount": number,
    "suspiciousCount": number,
    "safeCount": number
  }
}
```

### `POST /api/report` — sender/message report

```
Request:
{
  "sender": string,          // phone number, short code, or identifier
  "message"?: string,
  "reportedBy"?: string
}

Response:
{
  "sender": string,
  "reportCount": number,     // total times this sender has been reported
  "recorded": boolean
}
```

**Status: UNLOCKED.** Fill in exact field names/types once backend work starts, then
treat this section as frozen for the remainder of the hackathon.

## Compliance checklist

`checklist.md` at the repo root tracks security hardening and
production-credibility items (SEO/meta tags, no exposed source maps, no
console errors, etc.). Claude Code should periodically re-check the current
state of the codebase against `checklist.md` — at minimum before any commit
that touches an API endpoint, auth, file uploads, or deployment config, and
whenever asked to review or ship the app — and report which items are now
satisfied, which regressed, and which are still open. Update the checkboxes
in `checklist.md` to reflect reality rather than letting it drift out of sync
with the code.

## Coding conventions

- Backend: standard Node.js REST conventions (Express or equivalent) — route
  handlers thin, detection/matching logic in separate modules, structured JSON
  responses matching the API Contract above exactly.
- Frontend: Next.js App Router idioms — server components for data fetching where
  possible, client components only where interactivity is required (input forms,
  verdict display).
- LLM output must always be validated/parsed against the structured schema before
  being returned to the frontend — never pass raw LLM text through as the verdict.
- Domain-matching logic (lookalike URLs) is non-LLM and must be deterministic and
  unit-testable independent of the LLM call path.
- Extension code (when started) imports/calls the core API — it must not
  reimplement domain-matching or scam-detection logic locally.
