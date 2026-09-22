# FraudLens AI — Explainer

A working reference for how the project actually fits together: what each
piece does, why it's built the way it is, and where the judging-relevant
differentiators live in the code. Written to stay accurate as the build
continues — see "Changelog" at the bottom for what's been added since this
was first written.

This is a reference document, not a directive. `CLAUDE.md` (repo root) is the
authoritative source for role ownership, scope boundaries and judging
priorities; this file explains the *system*, not the rules for changing it.

## Table of contents

1. [Project in one paragraph](#1-project-in-one-paragraph)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Backend deep dive](#3-backend-deep-dive)
   - 3.1 [Request flow through `POST /api/analyze`](#31-request-flow-through-post-apianalyze)
   - 3.2 [The LLM layer and its fallback](#32-the-llm-layer-and-its-fallback)
   - 3.3 [Kreol/French/English grounding](#33-kreolfrenchenglish-grounding)
   - 3.4 [The three deterministic (non-LLM) checks](#34-the-three-deterministic-non-llm-checks)
   - 3.5 [Screenshot / OCR ingestion](#35-screenshot--ocr-ingestion)
   - 3.6 [Batch scan](#36-batch-scan)
   - 3.7 [Crowdsourced reporting & the database](#37-crowdsourced-reporting--the-database)
   - 3.8 [Privacy: redaction](#38-privacy-redaction)
4. [API surface (summary)](#4-api-surface-summary)
5. [Frontend](#5-frontend)
6. [Reliability & the judging rubric](#6-reliability--the-judging-rubric)
7. [Security & privacy posture](#7-security--privacy-posture)
8. [Testing](#8-testing)
9. [Known gaps / open items](#9-known-gaps--open-items)
10. [SUGGESTIONS.md — what was integrated and what wasn't](#10-suggestionsmd--what-was-integrated-and-what-wasnt)
11. [P0 build log (this session)](#11-p0-build-log-this-session)
12. [Changelog](#12-changelog)

---

## 1. Project in one paragraph

FraudLens AI helps someone in Mauritius decide, before they act on a
suspicious financial message, whether it's a scam — and why. A user pastes a
message (or uploads a screenshot), and the system returns a verdict
(`safe`/`suspicious`/`scam`) backed by a **structured breakdown of specific
signals** (sender mismatch, urgency language, lookalike URL, spoofed
identity, ...), never a single opaque percentage. It understands
Kreol/French/English, including messages that switch between all three
mid-sentence, and it checks any link in the message against real Mauritius
bank/telecom/government domains deterministically — not via the LLM. Users
can report a scam sender, building a small crowdsourced reputation feed.

## 2. Architecture at a glance

```
┌─────────────────────┐        ┌──────────────────────────────────────┐
│ frontend/ (Next.js)  │  POST  │ backend/ (Node/Express REST API)      │
│ - paste text or      │──────▶│                                       │
│   upload screenshot  │  /api  │  routes/index.js                     │
│ - PWA (installable)  │        │   ├─ analyzeMessage()  (LLM)         │
│                       │◀──────│   ├─ checkUrls()       (deterministic)│
└─────────────────────┘  JSON   │   ├─ checkIdentityConsistency() (det.)│
                                 │   ├─ computeRiskCategories()  (det.) │
                                 │   ├─ attachDomainAges() (RDAP, best- │
                                 │   │   effort, non-blocking)          │
                                 │   └─ getReportCount() (SQLite)       │
                                 └──────────┬────────────────────────┬─┘
                                            │                        │
                                 ┌──────────▼─────────┐   ┌──────────▼─────────┐
                                 │ Ollama (local LLM)  │   │ Hosted fallback     │
                                 │ over Tailscale, or   │   │ (Anthropic/OpenAI/ │
                                 │ localhost in dev     │   │  OpenRouter)        │
                                 └─────────────────────┘   └─────────────────────┘
```

The core design decision that shapes everything else: **the LLM is one
input, not the only source of truth.** Every `/api/analyze`-family response
is the union of one LLM call and three independent, synchronous,
non-LLM checks that run whether or not the LLM succeeds (`checkUrls`,
`checkIdentityConsistency`, `computeRiskCategories`). This is why a lookalike
URL still gets flagged even during a total LLM outage (see
`backend/src/routes/index.js`'s batch-scan comment for the explicit design
note on this).

## 3. Backend deep dive

All backend code is ES modules under `backend/src/`, tested with Node's
built-in `node:test` (`npm test` inside `backend/`).

### 3.1 Request flow through `POST /api/analyze`

1. Validate `message` (non-empty string, ≤5000 chars) — 400 on failure.
2. Run `checkUrls(message)` — deterministic, synchronous, cheap.
3. Kick off `attachDomainAges()` (RDAP lookup, async, best-effort, 1.5s cap).
4. Call `analyzeMessage(message, language)` — the one LLM round trip.
5. Await the domain-age attach (it may already be done).
6. Append `checkUrls()`'s signals and `checkIdentityConsistency()`'s signal
   (if any) onto the LLM's `signals[]`.
7. Compute `riskCategories` from the *combined* signal set.
8. Look up `senderReports` if the LLM extracted a `sender`.
9. Respond `200` with the full result, or `502` (generic message, real error
   logged server-side only) if the LLM call itself failed.

### 3.2 The LLM layer and its fallback

`backend/src/services/analysis/llmClient.js` is the only place that knows
how to reach a model. Three modes via `LLM_MODE` env var:

- `local` — Ollama only, never falls back.
- `fallback` — hosted provider only, never tries Ollama.
- `auto` (default) — try Ollama first; on failure, fall through to whichever
  hosted provider is configured (`FALLBACK_PROVIDER`: `anthropic` | `openai`
  | `openrouter`).

**This fallback path is the CLAUDE.md-mandated, blocking demo-reliability
requirement** — see `docs/BUILD-CHECKLIST.md`. As of the last verified check
(2026-09-22), the situation is the *opposite* of what was originally
assumed: local Ollama (with `think:false` set) is the fast, reliable path
(~12s end-to-end); the free-tier OpenRouter fallback model has **mandatory**
reasoning mode that can't be disabled, and measured 19.5s–43.8s (one run
>35s) across five live runs of the same prompt. `LLM_TIMEOUT_MS` is set to
60000 to avoid hard failures, but a judge waiting up to a minute on a demo
check is a real presentation risk if Ollama/Tailscale drops mid-demo — this
is flagged, not silently accepted (`backend/src/services/analysis/llmClient.js`
comments, `docs/BUILD-CHECKLIST.md`).

`GET /health/llm` exists specifically as a **pre-demo** check of which
provider is currently live — it is explicitly documented as not part of the
live demo flow itself (don't call it in front of judges).

### 3.3 Kreol/French/English grounding

`backend/src/services/analysis/kreolGrounding.js` implements a small,
dependency-free retrieval step: it loads Joshua's reviewed Kreol scam corpus
and translation memory (`data/kreol-dataset/*.jsonl`) once at startup, and
for each incoming message does plain token-overlap (Jaccard) scoring to pull
the 3 most relevant example messages and 5 most relevant terminology pairs.
Those get spliced into the LLM system prompt as grounding context — never
presented to the user as evidence, only used so the model recognizes
code-switching patterns and preserves entities (URLs, OTPs, amounts)
verbatim instead of "helpfully" translating them away.

Trust tiers matter here: only `owner_reviewed`/`ported_reviewed` rows are
eligible by default; `draft_generated` rows need an explicit opt-in;
`rejected` rows are never eligible, ever. This is Joshua's dataset — this
module only reads it, never writes to it (see the file's own header comment
and `data/kreol-dataset/CLAUDE.md`).

Fully defensive: a missing/corrupt dataset file, or zero relevant matches,
degrades silently to an ungrounded prompt. It can never become a hard
dependency for the core analyze path (this is a direct requirement from
CLAUDE.md's reliability-first judging priority).

### 3.4 The three deterministic (non-LLM) checks

These exist so the product's core claims — "domain matching is
deterministic," "not just a single opaque LLM score" — are literally true in
code, independently testable, and immune to LLM flakiness.

- **`services/domain-matching`** (`checkUrls`) — extracts every URL-shaped
  substring from the message, and for each host not in
  `LEGIT_DOMAINS` (the known-real MCB/SBM/Absa/Bank One/my.t/Emtel/MRA
  domains), flags it if either (a) it's within Levenshtein distance 2 of a
  legit domain, or (b) one of its hostname *labels* exactly matches a known
  brand token (`mcb`, `sbm`, ...) without being that brand's real domain.
  Label-exact matching (not substring) deliberately avoids false positives
  like `mythology-store.com` matching `"myt"`.
- **`services/identity-consistency`** (`checkIdentityConsistency`) —
  extracts a claimed identity from brand tokens mentioned in the text, then
  checks it against (a) any linked domain and (b) any stated payment
  beneficiary. A mismatch on either produces one `IDENTITY_MISMATCH` signal.
  As of this session, the signal also carries structured
  `claimedIdentity`/`officialDomain`/`actualDomain`/`beneficiary` fields
  (previously only a prose `description`) — see §11.
- **`services/risk-categories`** (`computeRiskCategories`) — a pure function
  over the final combined `signals[]` array that buckets them into
  `identity_risk` / `behavioral_risk` / `payment_risk` / `technical_risk` /
  `verification_risk`, each rated `LOW`/`MEDIUM`/`HIGH` by the highest
  severity signal in that bucket. Purely additive alongside the existing
  single `riskScore` — never a replacement.

### 3.5 Screenshot / OCR ingestion

`POST /api/analyze/screenshot` runs `tesseract.js` (`eng+fra` — no dedicated
Kreol Morisyen pack exists, but it covers Kreol's Latin-script text
adequately) on a base64-decoded image (magic-byte-sniffed as PNG/JPEG/WEBP —
the client's claimed MIME type is never trusted), then redacts identifiers
server-side (§3.8, this is the *only* place server-side redaction happens —
typed text is redacted in the browser before it's ever sent), then runs the
exact same `analyzeMessage()` + deterministic-checks pipeline as
`/api/analyze`.

The frontend deliberately does **not** show this route's own verdict
directly: `extractedText` goes into an editable textarea so the user can
correct OCR misreads, then that (corrected) text goes through the normal
`/api/analyze` call like typed text. This is a considered design choice
(see `frontend/lib/types.ts`'s comment on `AnalyzeScreenshotResponse`), not
an oversight.

### 3.6 Batch scan

`POST /api/batch-scan` runs up to 50 messages through the same pipeline, but
a single message's LLM failure never fails the whole batch or returns a
non-2xx — it synthesizes a `verdict: "unknown"` result with
`analysisFailed: true`, keeping any deterministic signals (URL/identity
checks ran regardless). `summary.unanalyzedCount` tracks these separately
from `scamCount`/`suspiciousCount`/`safeCount` so a failed analysis can never
silently inflate a real verdict count.

### 3.7 Crowdsourced reporting & the database

SQLite (`better-sqlite3`), three tables: `reports` (sender → report count),
`batch_history` (aggregate counts per batch run), `domain_age_cache` (24h
TTL RDAP cache). Sender identifiers are normalized to a canonical
digits-only key assuming Mauritius's `230` country code for 8-digit local
numbers, so `"+230 5789 1234"` / `"+23057891234"` / `"57891234"` all
accumulate against one row — but the API always echoes back the raw string
the caller submitted, so this normalization is invisible to callers.

`POST /api/report` increments; the new (this session) `POST
/api/check-sender` looks the count up **without** incrementing — see §11.

### 3.8 Privacy: redaction

Two independent implementations of the same regex-based redaction logic —
`frontend/lib/redact.ts` (runs in the browser, before typed text ever
leaves the device) and `backend/src/services/redact/index.js` (runs
server-side, only for OCR-extracted text, since the raw image itself has to
reach the server). Both remove account/card numbers (last 4 kept), phone
numbers, and email local-parts, while deliberately *keeping* URLs, OTP-style
codes, and currency amounts, because scam detection needs them verbatim.
Personal names are explicitly not redacted (not reliably regex-detectable
across three languages). The two implementations are kept in sync by hand —
`backend/src/services/redact/index.js`'s header comment says so explicitly,
since `backend/` and `frontend/` are separate projects that share no code.

## 4. API surface (summary)

Full detail lives in `docs/API-CONTRACT.md` — treat that as the source of
truth, this is an index:

| Route | Purpose |
|---|---|
| `POST /api/analyze` | Core message analysis |
| `POST /api/analyze/screenshot` | OCR ingestion → same pipeline |
| `POST /api/batch-scan` | Up to 50 messages, per-message failure isolation |
| `POST /api/report` | Increment a sender's report count |
| `POST /api/check-sender` | **NEW (this session)** — read-only report-count lookup, no increment |
| `POST /api/check-url` | Non-LLM domain check only (built for the browser extension) |
| `GET /health/llm` | Pre-demo check of which LLM provider is currently live |

## 5. Frontend

*(To be filled in with the same level of detail as §3 once the frontend
conventions survey — copy/i18n system, navigation, existing `trends`/`learn`
pages, design tokens — comes back. See §11 for what's being built on top of
it this session.)*

The frontend (`frontend/`, Next.js App Router, shipped as an installable
PWA) is considerably more built-out than a bare "paste → score" tool
already: message analysis already renders as a structured, indexed findings
list (`components/result/sections.tsx`'s `WhySection`), not a bare
percentage; a severity-shaded risk band *and* an optional numeric risk meter
sit side by side (`components/result/parts.tsx`'s `VerdictBanner`); evidence
excerpts are already highlighted inline in the original message text
(`lib/highlight.ts` + `MessageCard`); a link-check panel already shows the
deterministic domain-matching result as structured data
(`LinkCheckPanel`); and screenshot upload is already fully wired into the
same check form, not a separate/disabled flow.

## 6. Reliability & the judging rubric

Per `CLAUDE.md`'s Judging Priorities section, reliability during the live
demo is the single highest-weighted concern. Concretely, in this codebase
that means:

- The LLM fallback path exists and works, but is currently the *less*
  reliable of the two paths (see §3.2) — this is tracked, not hidden, in
  `docs/BUILD-CHECKLIST.md`.
- All three deterministic checks run independent of LLM success — a total
  LLM outage still surfaces lookalike-URL and identity-mismatch signals.
- Kreol grounding degrades silently on any failure; it can never become a
  hard dependency of the core analyze path.
- `GET /health/llm` gives the team a pre-demo readiness check, deliberately
  kept out of the live demo flow itself.

## 7. Security & privacy posture

- `helmet()` sets standard security headers (CSP, HSTS, X-Frame-Options,
  etc.) on every response.
- Per-IP rate limiting on every route (`express-rate-limit`), tightest on
  `/api/report` (5/hour) specifically as bot protection for the
  crowdsourced feed's integrity.
- No raw error text ever reaches the client — every failure path returns a
  generic string; the real error is `console.error`-logged server-side only
  (the one intentional exception: batch-scan's per-message
  `explanation` on an individual failure, which is short, sanitized,
  user-facing-by-design copy, never a stack trace).
- Screenshot MIME type is verified by magic-byte sniffing, never trusted
  from the client.
- Personal identifiers (account numbers, phone numbers, email addresses)
  never reach the LLM or leave the device unredacted — see §3.8.
- No auth on any route yet (tracked as an open item, `docs/API-CONTRACT.md`
  Known Gaps) — there's no user/session concept in the app at all.
- `checklist.md` (repo root) is the living, periodically-rechecked security
  and production-credibility checklist (SEO/meta, no exposed source maps,
  console-clean, etc.) — Claude Code is expected to re-verify it against
  reality before any commit touching an API endpoint, auth, uploads, or
  deploy config (see `CLAUDE.md`'s "Compliance checklist" section).

## 8. Testing

Every backend service module (`analysis`, `domain-matching`,
`identity-consistency`, `risk-categories`, `ocr`, `redact`, `batch`,
`domain-age`) has a co-located `*.test.js` using `node:test` — run with
`npm test` inside `backend/`. `backend/src/services/domain-matching/
test-payloads.test.js` cross-checks `checkUrls()` against all of Caellum's
QA payloads in both directions (every expected `lookalike_url` fires, no
false positives). `backend/src/routes/index.test.js` spins up a real
Express server per test and hits it over HTTP, with `fetch` routed to a mock
LLM response so it never depends on a real Ollama instance.

Frontend tests (`frontend/lib/*.test.ts`, `node --test`) cover the API
client's error classification and exact-URL pinning, the evidence-highlight
segmenter, redaction, and several other pure `lib/` modules.
`/api/analyze/screenshot` has no automated HTTP-level test yet — verified
manually against a real generated PNG instead (see `docs/API-CONTRACT.md`
Known Gaps).

## 9. Known gaps / open items

Pulled from `docs/BUILD-CHECKLIST.md`, `checklist.md`, and
`docs/API-CONTRACT.md`'s Known Gaps section — check those files directly for
the authoritative, up-to-date state:

- Fallback provider works but is slow/unreliable under the free-tier model's
  mandatory reasoning mode (§3.2) — not yet resolved.
- Vulnerable-user protection mode — not yet built.
- Crowdsourced threat feed has no seeded demo data yet.
- Scalability story — needs to be prepared as a verbal talking point, not
  code.
- No batch-scan UI page exists yet (backend is complete and tested; there's
  simply no frontend route for it).
- `/api/report`'s `message`/`reportedBy` fields are accepted but not
  persisted — if the crowdsourced feed needs to show reported message
  content later, this will need to change.
- `suggestedAction` is a free-form string, not an enforced enum.
- No auth on any route.

## 10. SUGGESTIONS.md — what was integrated and what wasn't

`SUGGESTIONS.md` (repo root) is a research pass over 12 external
scam/fraud-detection projects, organized by owner area. Its headline finding
already stood before this session started: none of the reviewed external
projects handle code-switched Kreol/French/English text or local-domain
lookalike-URL matching for a specific country's banks — FraudLens's
differentiators were already ahead of everything reviewed there.

Relevant to this session's P0 work specifically:
- Its §1 note ("rank/label which signal mattered most... could be a trivial
  frontend change: sort by severity, highlight the top one") is
  structurally what the "Evidence Provenance" work below does, generalized
  from severity-only to grouping by the existing `source` field.
- Its §4 note on `ScamShield`'s accessibility patterns (large fonts,
  plain-language, pre-written safety scripts) maps directly onto the
  still-open "vulnerable-user protection mode" checklist item — not part of
  this session's P0 scope, but the next natural target once P0 lands.
- Its explicit non-recommendations (payment-pause+trusted-contact approval,
  location-aware news feed, live call-audio monitoring) are deliberately
  **not** being pulled into this session's build either — noted there as
  "worth mentioning verbally as future direction," which still holds.

## 11. P0 build log (this session)

*(Updated as work lands — see §12 Changelog for a dated summary.)*

### Backend — additive API changes

All changes below are backward-compatible: existing fields are unchanged,
only new optional fields/routes were added. `docs/API-CONTRACT.md` and
`frontend/lib/types.ts` were updated in lockstep.

- **`lookalike_url` signals** (`backend/src/services/domain-matching/index.js`)
  now also carry `domain` (the actual detected host) and `officialDomain`
  (the specific legitimate domain it was compared against), so the frontend
  can render a direct "claims to point to X / actually points to Y"
  comparison without re-parsing the `description` prose string.
- **`IDENTITY_MISMATCH` signals**
  (`backend/src/services/identity-consistency/index.js`) now also carry
  `claimedIdentity`, `officialDomain`, and — only when that specific
  mismatch reason applies — `actualDomain` and/or `beneficiary`.
- **New route `POST /api/check-sender`** — read-only counterpart to
  `POST /api/report`; looks up a report count without incrementing it.
  Built for the "Before You Pay" flow, which needs to show "this recipient
  has been reported N times" for a user-typed identifier without that
  lookup itself inflating the count.

### Coordination note

A second Claude Code session (`uom-hackathon-6e`) is concurrently doing a
frontend-only visual-polish pass (markup/Tailwind only, no logic changes) on
the same repo, based on the user's separate request. File ownership for this
session's P0 work was confirmed directly with that session to avoid
concurrent edits to the same lines: this session owns `app/page.tsx` (adding
the hero/positioning section + SafePay CTA), `components/result/parts.tsx`
and `sections.tsx` (Scam X-Ray + Evidence Provenance), and a new
`app/safepay/` route; the peer session is doing visual-only refinement
elsewhere and will hold off on those specific files.

## 12. Changelog

- **2026-09-23** — Initial version written: full backend architecture
  documented from source; frontend section stubbed pending a conventions
  survey; P0 scope (landing redesign, Scam X-Ray, Evidence Provenance,
  SafePay, screenshot upload UI) confirmed with the user. Backend additive
  changes landed: structured `domain`/`officialDomain` fields on
  `lookalike_url` signals, structured `claimedIdentity`/`officialDomain`/
  `actualDomain`/`beneficiary` fields on `IDENTITY_MISMATCH` signals, and
  the new read-only `POST /api/check-sender` route. Discovered screenshot
  upload UI was already fully wired (not disabled, contrary to the initial
  task brief) — no work needed there.
