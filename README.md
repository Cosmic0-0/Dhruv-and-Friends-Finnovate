# FraudLens AI

Built for **Finnovate Hackathon 2026** (Challenge 5, sponsored by Clarity).
Theme: FinTech & Innovation. 72-hour build.

**Challenge:** How can AI help customers identify warning signs in suspicious
financial messages before they make a payment?

A user submits a message (pasted text or screenshot) and gets back a verdict
with a structured breakdown of flagged signals (sender mismatch, urgency
language, lookalike URL, spoofed identity, ...) — not just a single opaque
score — plus a concrete next action (block sender, report to bank fraud line,
verify via official channel).

Full scope, API contract, and coding conventions live in [`CLAUDE.md`](./CLAUDE.md).
Security/production-readiness checklist lives in [`checklist.md`](./checklist.md).

## Structure

```
backend/    Node.js REST API — detection logic, domain matching, DB
frontend/   Next.js UI
extension/  Browser extension (stretch goal, built after the core app works)
data/       Scam datasets, test payloads, seed data
```

Each directory is gated to one team member — see `CLAUDE.md` → Role gating
for the full breakdown and who owns what.

## Getting started

Backend and frontend are separate Node projects; install and run each from
its own directory.

```bash
cd backend && npm install && npm run dev   # http://localhost:4000/health
cd frontend && npm install && npm run dev  # http://localhost:3000
```

The LLM used for message analysis runs **locally** (model TBD — see
`backend/.env.example` for the `LLM_BASE_URL` / `LLM_MODEL` config); there's
no cloud LLM API key to set up.

## Team

| Owner | Area |
|---|---|
| the backend owner | Backend + browser extension (stretch) |
| Joshua | Kreol language support |
| Oleg | UI |
| Dhruv | OCR ingestion + batch scan |
| Caellum | Test payloads and QA |

See `CLAUDE.md` for detailed responsibilities per role.
