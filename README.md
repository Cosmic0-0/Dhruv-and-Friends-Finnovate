# FraudLens AI

FraudLens AI helps people in Mauritius assess suspicious financial messages
before they pay, disclose credentials, or follow a link. It combines a
deterministic, auditable risk engine with bounded language-model analysis and
returns the evidence behind each decision.

The product supports English, French, and Kreol Morisien, including
code-switched messages. It accepts pasted text and screenshots, checks links
against a local institution registry, provides a structured action plan, and
can connect repeated observations into privacy-minimised scam campaigns.

## What is implemented

- Single-message analysis with a deterministic score, level, decision trace,
  and suggested actions.
- Browser-side redaction for pasted text and server-side redaction after OCR.
- Screenshot OCR, batch scanning, conversation analysis, and a Before You Pay
  flow for payment context.
- Kreol/French/English lexicon checks plus reviewed Kreol prompt grounding.
- Lookalike-domain, claimed-identity, template-artifact, community-wave, and
  payment-context checks.
- Scam Journey, ScamDNA campaign graphs, Fraud Replay, and a bounded educational
  scam sandbox.
- Document checks: PDF/DOCX structural forensics with a normal verdict, and an
  API-only image route that returns forgery indicators from an optional
  Python service, never a verdict.
- A PWA frontend and a Manifest V3 Chrome extension for link checks, page scans,
  reports, and passive site-security reports.

## Repository layout

```text
backend/       Express API, deterministic detectors, LLM transport, OCR, SQLite
frontend/      Next.js 15 PWA and product UI
extension/     Chrome extension; calls the backend instead of duplicating detection
outlook-addin/ Outlook Office.js read-mode task pane; calls the backend as well
document-forensics/
               Optional local Python service for image forgery indicators
data/          Institution registry, reviewed language data, QA payloads, demo seeds
docs/          API contract, demo checklist, judging rubric, and team workflow
```

## Run locally

The backend and frontend are separate Node projects. Use Node 22; the frontend
test suite relies on Node's native TypeScript execution.

```bash
cd backend
npm install
cp .env.example .env
npm run dev   # http://localhost:4000/health
```

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The frontend runs at `http://localhost:3000` and proxies `/api/*` to the backend
at `http://localhost:4000`. Configure Ollama and the hosted fallback as described
in [`backend/README.md`](./backend/README.md). The deterministic pipeline still
returns an assessment when semantic analysis is unavailable.

Optionally, to run the Outlook read-mode task pane against the same backend:

```bash
cd outlook-addin
npm install
npm run dev   # https://localhost:3001
```

Optionally, for forgery indicators on `POST /api/documents`, run the Python
service in `document-forensics/` (Python 3.12; see its
[README](./document-forensics/README.md) for Windows and Unix commands). The
backend works without it: that route then reports the forensics step as
unavailable. The PDF/DOCX document check does not use it.

## Verify

```bash
cd backend && npm test
cd frontend && npm test
cd frontend && npm run typecheck
cd frontend && npm run build
cd outlook-addin && npm test && npm run build && npm run validate
cd extension && npm test
cd document-forensics && python -m pytest   # inside its Python 3.12 virtualenv
```

`npm run lint` is not currently a usable check because ESLint has not been
configured; it opens Next.js's interactive setup prompt. This is tracked as a
project gap rather than presented as a passing check.

## Documentation

- [`EXPLAINER.md`](./EXPLAINER.md) describes the current architecture and its
  known limitations.
- [`docs/API-CONTRACT.md`](./docs/API-CONTRACT.md) is the authoritative API
  request/response contract.
- [`checklist.md`](./checklist.md) tracks security and launch readiness.
- [`docs/BUILD-CHECKLIST.md`](./docs/BUILD-CHECKLIST.md) tracks demo readiness
  against the hackathon rubric.
- [`docs/DOCUMENT-FORENSICS.md`](./docs/DOCUMENT-FORENSICS.md) explains the two
  document paths, what each claims, and what each stores.
- [`document-forensics/README.md`](./document-forensics/README.md) covers the
  optional Python service.
- [`extension/README.md`](./extension/README.md) covers installation, permissions,
  privacy, and manual extension QA.

## Current deployment caveats

The application is still a hackathon prototype. It has no accounts or tenant
isolation, uses a shared SQLite database, and exposes aggregate campaign/trend
data publicly. The extension is configured for localhost and must have both its
API/frontend origins and `host_permissions` updated for a deployed environment.
Set `NEXT_PUBLIC_SITE_URL`, `BACKEND_URL`, `REPORTER_HASH_SECRET`, and a tested LLM
fallback before sharing a production URL.
