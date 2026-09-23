# FraudLens AI

FraudLens AI checks a suspicious message, link, website or email before you
pay, type a password, or hand over an OTP. It was built for Mauritius, in
English, French and Kreol Morisien, and it shows the evidence behind every
answer instead of asking you to trust a percentage.

Built for the Finnovate Web and AI Hackathon 2026.

## The problem

Phishing in Mauritius doesn't look like the phishing most security tools were
trained on. The SMS says your MCB account is blocked, in a mix of Kreol and
French, and links to `mcb-secure.top`. A WhatsApp voice note from "the bank"
asks for the code it just sent you. A fake MRA refund page asks for your card.
An invoice email to a small business arrives from a supplier's domain with one
letter changed, and the bank details have "recently been updated".

Generic scam filters miss most of this. They don't read Kreol, they don't know
that `mcb.mu` is real and `mcb.nu` isn't, and they grade a message with a
score nobody can explain to their grandmother. People end up checking scams
the only way they can, by asking someone they trust. Often that's after they've
already clicked.

## Three ways in, one engine

Scams reach people in three places, so FraudLens meets them in all three. Every
client calls the same backend. None of them carries its own copy of the
detection logic.

1. **The web app.** A phone-first PWA where you paste a message, drop a
   screenshot (OCR reads it) or upload a PDF or Word document. You get a
   verdict, the exact words and links that triggered it, and a short plan for
   what to do next. Before You Pay checks a payment request, and the scam
   sandbox lets you practise spotting a scam on clearly fictional examples.
2. **The browser extension.** It checks every site you open against the
   Mauritius institution registry, lookalike rules, phishing and malware
   lists, domain age and the site's certificate, and it tells you who the
   certificate was issued to. Scan This Page reads the page and its login and
   card forms, and the Security Report grades a site's security setup. The
   report shows the line of code behind each finding and says whether a site
   is badly built or actually hostile.
3. **The Outlook add-in.** It runs inside the email a workplace receives and
   looks for business email compromise. It flags supplier lookalike domains,
   changed bank details, a Reply-To that doesn't match the sender, and CEO
   requests from personal addresses.

Together they cover the SMS or WhatsApp message you paste, the link you open
and the email that lands at work.

## Why it works for Mauritius

**Kreol is a first-class language.** The lexicon has Kreol rules next to the
English and French ones, and it knows negation. "Partaz ou OTP ar nou" is a
request for your code and gets flagged. "Pa partaz ou OTP ar personn" is the
bank's own advice and doesn't. "Ou kont pou bloke si ou pa konfirm" reads as
the threat it is. The language model is grounded with a Kreol translation
memory in `data/kreol-dataset/`, where every row carries its review status.
Only rows a human reviewed feed the model, and unreviewed text is never
presented as reviewed. Messages that jump between Kreol, French and English in
one sentence are the normal case here, so they're treated as one.

**It knows the local domains.** `data/institution-registry.json` lists the
official domains of MCB, SBM, Absa, Bank One, my.t, Emtel and the MRA. A link
to `internet.mcb.mu` is recognised as MCB's own site. `mcb-secure.top`,
`mcb.nu` and `mсb.mu` (with a Cyrillic с) are caught as lookalikes, and the
explanation names the real domain. The domain parser understands `.mu`
suffixes like `gov.mu` and `com.mu`, and the extension looks up when each
domain was registered, so a site set up last week stands out. It also reads
every site's certificate and tells you who it was issued to. MCB's own site
carries an Extended Validation certificate naming The Mauritius Commercial Bank
Limited, and a scam copy can't get one in the bank's name. Global brands like
PayPal and Microsoft are covered too, because Mauritians get those scams as
well.

**The AI reads language and nothing more.** The language model identifies
tactics like urgency, threats or a request for an OTP, and it has to quote the
exact words from the message. A quote that isn't in the message gets thrown
out.
The score, the verdict and the advice come from a deterministic rule engine
with versioned rulesets, so the same message always gets the same answer and
every point can be traced. If the model is down, slow or wrong, the rules
still work. A live demo on bad Wi-Fi was a design constraint.

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
- A PWA frontend and a Manifest V3 Chrome extension for link checks, page scans,
  reports, and passive site-security reports.

## Repository layout

```text
backend/       Express API, deterministic detectors, LLM transport, OCR, SQLite
frontend/      Next.js 15 PWA and product UI
extension/     Chrome extension; calls the backend instead of duplicating detection
outlook-addin/ Outlook Office.js read-mode task pane; calls the backend as well
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

## Verify

```bash
cd backend && npm test
cd frontend && npm test
cd frontend && npm run typecheck
cd frontend && npm run build
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
- [`extension/README.md`](./extension/README.md) covers installation, permissions,
  privacy, and manual extension QA.

## Current deployment caveats

The application is still a hackathon prototype. It has no accounts or tenant
isolation, uses a shared SQLite database, and exposes aggregate campaign/trend
data publicly. The extension points at the deployed backend
(`https://api.159-195-245-28.sslip.io`). For local work, point `extension/config.js`
and the manifest's `host_permissions` back at `http://localhost:4000`.
Set `NEXT_PUBLIC_SITE_URL`, `BACKEND_URL`, `REPORTER_HASH_SECRET`, and a tested LLM
fallback before sharing a production URL.
