# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

FraudLens AI — built for Finnovate Hackathon 2026 (Challenge 5, sponsored by Clarity).
Theme: FinTech & Innovation. 72-hour build.

Challenge question: How can AI help customers identify warning signs in suspicious
financial messages before they make a payment?

Core loop: a user submits a message (pasted text or screenshot) → the system analyzes
it for scam signals → returns a verdict with a structured breakdown of flagged signals
(not just a single score) → suggests a concrete next action (block sender, report to
bank fraud line, verify via official channel).

The repository is currently empty (initial commit only) — this file defines the
target architecture and conventions for the build, to be filled in as code lands.

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
- **Frontend**: Next.js.
- **Detection logic**: LLM-based analysis with structured JSON output (flagged
  signals, verdict, suggested action) + non-LLM domain-matching logic for URLs.
- **OCR**: for screenshot ingestion.
- **Database**: for crowdsourced sender/message reports and batch scan history.

## Role ownership

Each role owns its area end to end, including its own tests and demo data for that
area, unless noted otherwise.

| Owner | Area | Responsibilities |
|---|---|---|
| Kshitij | Backend + browser extension (stretch, droppable under time pressure) | API design, prompt design and structured output schema, domain/lookalike-URL matching logic, database schema for reports and batch history, browser extension scaffolding (Manifest V3, content script) once the API is stable |
| Joshua | Kreol language support | Kreol scam dataset, prompt tuning for Kreol/French/English code-switching, validating AI explanations read correctly in Kreol |
| Oleg | UI | Main app frontend (input, verdict display, flagged-signal view, batch scan results), extension badge/warning UI once the backend endpoint is live |
| Dhruv | OCR ingestion + batch scan | Screenshot upload, OCR extraction pipeline, batch scan feature (multi-message upload and summary view) |
| Caellum | Test payloads and QA | Scam message test set across English, French, and Kreol (Kreol set coordinated with Joshua), sender-reputation seed data for the crowdsourced feed demo, edge-case testing, demo script for final judging |

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
