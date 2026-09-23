# FraudLens AI — Launch Checklist

Working checklist for the 72-hour build. Check items off as they're satisfied.
This file is the source of truth for "are we production-credible" — see
`CLAUDE.md` for the instruction to periodically re-check the codebase against it.

## 1. Security

Baseline hardening — required before any real message content or reported
sender data touches the demo, since the app ingests untrusted user input
(pasted messages, screenshots, sender reports) by design.

- [x] **Hide API keys** — verified 2026-09-22: `FALLBACK_API_KEY`,
      `OLLAMA_URL`, `DATABASE_URL` are all read from `process.env`
      (`backend/src/services/analysis/llmClient.js`, `backend/src/db/index.js`),
      `.env` is gitignored, nothing hardcoded in source. OCR service keys
      don't exist yet — recheck when `backend/src/services/ocr/` lands.
- [x] **Purge git secrets** — verified 2026-09-22: scanned full history
      (`git log --all -p`) for `backend/.env` and common key prefixes
      (`sk-ant-`, `sk-proj-`, `sk-or-v1-`, `AIzaSy`, `AKIA...`) — nothing
      found. `.env`, `*.db`, `*.traineddata` are all gitignored and untracked
      (`backend/.gitignore`). Rerun if a secret is ever suspected of landing
      in a commit.
- [x] **Use a scoped/public-safe DB key** — N/A by architecture, verified
      2026-09-22: the frontend never talks to the DB directly (no Supabase/
      direct-DB client SDK) — all reads/writes go through backend routes
      (`backend/src/db/index.js`), so no DB key is ever shipped to the
      client. Recheck if the frontend ever gets a direct-DB integration.
- [ ] **Enable row-level security** (or equivalent access rules) on the
      reports/batch-history tables so one user's data can't be read or
      edited by another through a misconfigured query. Not satisfied
      2026-09-22: single shared SQLite file (`backend/fraudlens.db`), no
      per-user/session scoping concept exists at all yet (no auth — see
      below), so there's no notion of "another user's row" to isolate.
- [ ] **Encrypt sensitive data at rest** — anything that could identify a
      reporter or contain raw message content in the DB. **Not satisfied**
      (verified 2026-09-23). The `documents` table
      (`backend/src/db/index.js`, written by
      `backend/src/services/document-store/`) holds the original bytes of
      every accepted `POST /api/documents` upload (PDF/PNG/JPEG/WEBP, with
      its client-supplied file name) and of every PDF sent to
      `POST /api/analyze/document`. These can be bank statements or ID
      documents. They are stored unencrypted, with no retention period and
      no delete path, in a database any route can write to without
      authentication. No route returns the stored bytes. The other tables
      hold no raw message text and no raw reporter IP: `reports` keeps a
      normalised sender identifier and a count, report events keep
      fingerprints and an HMAC pseudonym of the reporter, and `batch_history`
      keeps aggregate counts.
- [ ] **Enforce server-side auth** on every endpoint that reads/writes
      report or batch-history data — never trust a client-supplied user ID.
      Not satisfied 2026-09-22: no auth middleware anywhere in
      `backend/src/index.js` or `backend/src/routes/index.js`, every route
      is fully open (also flagged in `docs/API-CONTRACT.md` Known Gaps).
- [ ] **Lock record access** — a user (or anonymous session) can only fetch
      their own batch scan history, not enumerate others' by ID. Not
      satisfied 2026-09-22, though currently low-risk: no route exists yet
      that reads batch history or reports *by ID* at all
      (`backend/src/routes/index.js` only inserts/aggregates) — recheck the
      moment a "my history" read endpoint is added, since auth must land
      before it does.
- [x] **Block field tampering** — verified 2026-09-22: `verdict`/`signals`
      always come from `analyzeMessage()` + `checkUrls()`, never from
      `req.body`; `reportCount` is always re-read from SQLite in
      `reportSender()` (`backend/src/db/index.js`), never trusted from the
      client. Recheck if either route starts accepting these as input.
- [ ] **Secure session cookies** — `HttpOnly`, `Secure`, `SameSite` set
      appropriately if sessions are used. N/A as of 2026-09-22: no
      cookie/session middleware exists anywhere in the stack (no
      `cookie-parser`/`express-session` in `backend/package.json`). Recheck
      the moment any session concept is introduced.
- [ ] **Hash passwords** with a strong algorithm (bcrypt/argon2) — only
      applies if the hackathon build adds real user accounts. N/A as of
      2026-09-22: no user accounts exist anywhere in the codebase.
- [x] **Rate limit sensitive endpoints** — especially `/api/analyze`,
      `/api/batch-scan`, and `/api/report`, to stop abuse of the LLM call
      path and the crowdsourced report feed. Implemented 2026-09-22:
      `express-rate-limit`, applied per-route in
      `backend/src/routes/index.js` — 20 req/15min for `/api/analyze` and
      `/api/analyze/screenshot`, 10 req/15min for `/api/batch-scan`,
      120 req/15min for `/api/check-url`, 5 req/hour for `/api/report`. All
      keyed per-IP (`app.set("trust proxy", 1)` in `backend/src/index.js` so
      the real client IP is used behind a deploy proxy), 429 on exceeding.
- [x] **Add bot protection** on the report endpoint so the crowdsourced
      threat feed can't be trivially poisoned with fake reports. Implemented
      2026-09-22: `/api/report` gets a much tighter limit than the other
      routes (5 req/hour/IP vs. 20/15min) via the same `express-rate-limit`
      middleware (`backend/src/routes/index.js`) — no CAPTCHA/challenge
      added, a strict per-IP throttle is the practical deterrent for a
      hackathon build; revisit if the report feed still gets gamed in
      testing. Strengthened 2026-09-23 (`joshua` branch): community
      cluster/wave detection (`backend/src/services/community-signals`)
      counts only DISTINCT pseudonymous reporters (HMAC of IP), never
      official identities (`MCB`, `my.t`, ...) or redaction placeholders as
      sender keys, never boosts messages linking only official domains, and
      ignores machine-only evidence - so one IP re-reporting can't create a
      cluster. The legacy `reportCount` itself is still a raw per-sender
      tally, protected only by the 5/hour limit.
- [x] **Parameterize all DB queries** — verified 2026-09-22: every query in
      `backend/src/db/index.js` uses `?` placeholders via `better-sqlite3`'s
      `.prepare().run()`, no string concatenation.
- [x] **Validate all input** server-side — verified 2026-09-22:
      `/api/analyze`, `/api/batch-scan`, `/api/report`, `/api/check-url`, and
      `/api/analyze/screenshot` all reject missing/empty/oversized/
      wrong-type input server-side (`backend/src/routes/index.js`), 400 on
      failure. Recheck if any route's validation logic changes.
      Rechecked 2026-09-23: `/api/analyze` now also validates the optional
      `emailContext` (`backend/src/services/email-context`: types, address
      syntax, list sizes, auth-result enum) and `paymentContext.accountNumber`
      (kept as last 4 digits only), 400 with a field-specific message.
- [x] **Escape user content** before rendering it back in the UI (verdict
      display, flagged-signal view, batch results) to prevent stored/reflected
      XSS from a malicious pasted message. Reverified 2026-09-23: every place user
      text (message body, signal evidence, sender) is rendered
      (`components/ResultView.tsx`, `components/result/parts.tsx`,
      `components/result/sections.tsx`) goes through plain JSX text nodes,
      which React escapes by default. The two `dangerouslySetInnerHTML` uses
      contain fixed application-authored theme and JSON-LD strings, never
      analysis or user content.
- [x] **Restrict file uploads** (screenshot ingestion) — verified
      2026-09-22: `/api/analyze/screenshot` (`backend/src/routes/index.js`)
      caps decoded image size at 5MB, sniffs PNG/JPEG/WEBP by magic bytes
      rather than trusting the client (there is no client-supplied MIME
      field at all), and the buffer is only ever handed to the tesseract.js
      worker in memory — never written to disk or served back, so there's
      no stored-file execution surface to strip.
      Extended 2026-09-23 for document uploads (`POST /api/analyze/document`,
      `backend/src/services/document-forensics`):
      - The type comes from magic bytes only (`%PDF-`, or a ZIP whose
        `[Content_Types].xml` declares a Word main document). The
        client's file name is ignored and never echoed.
      - Limits are 10MB decoded and a 14MB JSON body. A body over any route's
        limit gets a generic JSON 413.
      - Parsing runs only inside a `worker_threads` worker with a 256MB heap
        limit and a 15s hard timeout. On a timeout, OOM or crash the worker
        is terminated and the client gets a generic "could not be read".
        At most 2 documents are analysed at once; a third gets 503.
      - The ZIP central directory is checked first (at most 500 entries and
        50MB declared uncompressed). Only named parts are inflated, each
        under a hard output cap enforced while inflating, so a zip that lies
        about its sizes still stops (tested).
      - Nothing is written to disk. Macros and remote templates are only
        detected, never run or fetched.
      - pdf.js runs without font eval, system fonts, XFA or network access, and
        with image size capped. sharp inputs are capped with
        `limitInputPixels`.
      - Previews are PNG data URLs of at most 256px. The frontend drops any
        preview that isn't a small `data:image/png` URL before rendering it.
- [x] **Trim API responses** — don't leak internal fields (raw LLM prompt,
      stack traces, DB row internals) in `/api/analyze`, `/api/batch-scan`,
      or `/api/report` responses. The malformed-JSON HTML-stack-trace leak
      found during the first QA pass was already closed. Fixed
      2026-09-22: `/api/analyze` and `/api/analyze/screenshot` no longer
      pass through raw `err.message` — both now return a generic
      `{ "error": "..." }` and log the real error server-side with
      `console.error` (`backend/src/routes/index.js`). `/api/batch-scan`'s
      **per-message** `explanation` field uses a short user-facing failure
      message rather than a stack trace or internal path.
      Rechecked 2026-09-23 for `emailContext`: `messageId`, Return-Path and
      raw header values are never echoed; the response carries only
      per-signal evidence (the sender/Reply-To address, masked account
      last-4) and `analysis.email` (which evidence was supplied, which checks
      ran). None of the email metadata is sent to the LLM.
- [x] **Add security headers** (CSP, `X-Content-Type-Options`,
      `X-Frame-Options` / frame-ancestors, `Referrer-Policy`). Implemented
      2026-09-22: `helmet()` mounted in `backend/src/index.js` before the API
      router, sets CSP, `X-Content-Type-Options`, `X-Frame-Options`,
      `Referrer-Policy`, HSTS, and related headers on every response.
      Verified via `curl -i http://localhost:4000/health`.
- [x] **Force HTTPS** in production/deployment config. Implemented
      2026-09-22: `backend/src/index.js` redirects to `https://` when
      `NODE_ENV=production` and `x-forwarded-proto: http` (the header a
      TLS-terminating proxy sets), and `helmet()`'s default HSTS header
      (`max-age=31536000; includeSubDomains`) reinforces it for repeat
      visits. Depends on the deploy host actually setting
      `x-forwarded-proto` (Vercel/Render/Railway/Heroku all do) — reverify
      once the real deployment target is picked.
- [x] **Scan dependencies** for known vulnerabilities (`npm audit` or
      equivalent) before the final demo build. Rechecked 2026-09-23 after
      adding `pdfjs-dist` 6.3.289, `pdf-lib` 1.17.1 and `fflate` 0.8.3
      (pinned exactly): `backend` `npm audit --omit=dev` reports 0
      vulnerabilities. Reverified 2026-09-22:
      `backend`: 0 vulnerabilities (`npm audit --omit=dev`, including the
      newly added `express-rate-limit`/`helmet`). `frontend`: now installed
      and scanned — 0 vulnerabilities (`npm audit --omit=dev`).
      Rechecked 2026-09-23: `outlook-addin` reports 0 vulnerabilities too;
      the Office manifest tool's vulnerable transitive `adm-zip` is pinned to
      its compatible patched 0.6.1 release through an npm override.
- [x] **Restrict Outlook CORS to explicit origins.** `/api` keeps non-browser
      clients unchanged, permits only the exact comma-separated HTTPS origins
      in `OUTLOOK_ADDIN_ORIGINS`, and defaults in development only to
      `https://localhost:3001`. Unknown preflights receive 403.

## 2. Production-Credibility Signals ("don't look vibecoded")

Things that make a hackathon app read as thrown-together rather than a real
product. Judges and casual visitors notice these fast.

- [x] **View-source isn't empty** — verified 2026-09-22: `frontend/app/page.tsx`,
      `app/result/page.tsx`, `app/learn/page.tsx`, `app/trends/page.tsx` and
      `app/layout.tsx` are all plain server components (no `"use client"` at
      the top), so Next.js App Router SSRs real markup for each route.
- [x] **Custom 404 page** exists instead of the framework default.
      Implemented 2026-09-22: `frontend/app/not-found.tsx`, branded with
      `AppHeader` and a link back to `/`. Verified via `next build` +
      `next start` — a nonexistent path returns 404 with this page, not
      Next's default.
- [x] **No unstyled Vite+React flash** — N/A, verified 2026-09-22: stack is
      Next.js App Router (not Vite/CRA); fonts load via `next/font/google`
      with `display: "swap"` (`frontend/app/layout.tsx`), so there's no raw
      unbranded scaffold flash to fix.
- [x] **Unique page titles** — verified 2026-09-22: `frontend/app/layout.tsx`
      sets a title template (`"%s · FraudLens AI"`) with a distinct home
      default; `app/result/page.tsx` → `"Result"`, `app/learn/page.tsx` →
      `"Learn"`, `app/trends/page.tsx` → `"Trends"`, each via its own
      `export const metadata`.
- [x] **Meta description** present on the main page(s). Verified 2026-09-22:
      `frontend/app/layout.tsx:22-23,28` sets a real `description` string.
- [x] **`og:image`** set for link previews (Slack/demo sharing). Verified
      2026-09-22: `frontend/app/layout.tsx:39-48` sets `openGraph.images`
      (and a matching `twitter.images`) pointing at `/icons/icon-512.png`.
- [x] **Structured data** (schema.org / JSON-LD) on the landing page if
      time allows — low priority for a hackathon demo. Implemented
      2026-09-22: `frontend/app/page.tsx` renders a `WebApplication` JSON-LD
      block (name, category, description, free `Offer`) via a static
      `<script type="application/ld+json">` — content is a fixed constant,
      not user input, so no escaping concern.
- [x] **Exactly one `<h1>` per page** — verified 2026-09-22: home
      (`app/page.tsx`), Learn (`components/learn/LearnScreen.tsx` — the
      interactive quiz that replaced the old static-glossary
      `LearnContent.tsx`), Trends
      (`components/TrendsContent.tsx`) each render one `<h1>`; the result page
      (`components/ResultView.tsx`) renders exactly one of two mutually
      exclusive `<h1>`s (the "missing result" state at line 38, or
      `VerdictBanner`'s `<h1 id="verdict-label">` in
      `components/result/parts.tsx:64`) depending on whether a result is
      loaded — never both at once.
- [x] **Canonical tag** present if the app is deployed under a real domain.
      Implemented 2026-09-22: `alternates: { canonical: "/" }` added to
      `frontend/app/layout.tsx`, and `/learn`/`/trends` each set their own
      `alternates.canonical` — resolves against `metadataBase`
      (`NEXT_PUBLIC_SITE_URL`, currently defaulting to `localhost:3000`).
      Correct once `NEXT_PUBLIC_SITE_URL` is set to the real deploy domain —
      recheck that env var is set before sharing the demo URL.
- [x] **`llms.txt`** present (optional, only if time allows). Added
      2026-09-22: `frontend/public/llms.txt`.
- [x] **`robots.txt` doesn't block everything** — don't accidentally
      disallow all crawlers/AI agents from the deployed demo. Implemented
      2026-09-22: `frontend/app/robots.ts` allows `/` for all user agents,
      disallows only `/result` (query-param-driven per-check content,
      already `noindex` — see below), and points `sitemap` at
      `/sitemap.xml`. Verified via `curl http://localhost:3001/robots.txt`.
- [x] **Favicon** set (not the framework default). Verified 2026-09-22:
      `frontend/public/icons/favicon-32.png` + `icon-192.png` referenced in
      `app/layout.tsx:33-36`, custom-branded (not Next.js's default icon).
- [x] **`sitemap.xml`** present for the deployed app. Reverified
      2026-09-23: `frontend/app/sitemap.ts` lists the public tool and content routes
      (deliberately excludes `/result`, which is `noindex`). Verified via
      `curl http://localhost:3001/sitemap.xml`.
- [x] **`lang` attribute** set correctly on `<html>` — notable here since
      the app is explicitly multilingual (English/French/Kreol); the
      attribute should reflect the active UI language, not be hardcoded.
      Verified 2026-09-22: SSR default is `lang="en"`
      (`frontend/app/layout.tsx:67`), and
      `components/LanguageProvider.tsx:29` syncs
      `document.documentElement.lang` to the active language's `htmlLang`
      on every language change — the SSR default is a fine first-paint
      fallback since it's corrected immediately on hydration.
- [x] **Alt text** on all images (screenshot previews, icons, verdict
      badges) — also an accessibility requirement, not just SEO. Icons
      (including the screenshot-upload icon, `components/icons.tsx`'s
      `ImageIcon`) are inline SVG, no alt needed. The one raw `<img>` in the
      app — the attached-screenshot thumbnail preview
      (`frontend/components/ScreenshotUpload.tsx`, added with the
      screenshot-upload wiring in `f2b375a`) — sets `alt={copy.shot.alt}`,
      a real localized string, not empty/decorative. Recheck if another
      `<img>` is added elsewhere.
- [x] **No exposed source maps** in the production build. Verified
      2026-09-22: `frontend/next.config.ts:22` sets
      `productionBrowserSourceMaps: false`.
- [ ] **No console errors** on any page in the normal user flow (paste
      message → verdict, upload screenshot → verdict, batch scan → summary).
      Partially verified 2026-09-22: live-exercised paste → verdict (`/`
      → `/result`, through the real fallback LLM path), the Learn quiz
      flow, and `/trends`, all with DevTools console tracking on — zero
      errors on any of them, only harmless Next.js dev Fast Refresh logs.
      Screenshot upload is wired up but not yet live-verified console-clean end
      to end. A batch UI now exists at `/batch`; it also still needs a populated
      real-browser console check.
- [x] **JS bundle isn't massive** — check bundle size before the demo;
      trim unused dependencies (especially anything pulled in for the LLM
      or OCR call that isn't needed client-side). Reverified 2026-09-23:
      `next build` shows 103 kB shared JS; most routes load 131–147 kB, while
      the React Flow campaign page loads 181 kB — no LLM/OCR
      dependency is bundled client-side (`tesseract.js` and the LLM client
      are backend-only, `backend/src/services/`).

## 3. Browser extension — Security Report (`POST /api/analyze-site`)

The Security Report makes this backend send requests to arbitrary
third-party sites on a user's behalf, so it carries its own abuse and
honesty requirements on top of section 1.

- [x] **Passive only** — verified 2026-09-23: one GET of the page, a TLS
      handshake, one GET each of a fixed path list (`.git/HEAD`, `.env`,
      phpMyAdmin, admin paths, `/.well-known/security.txt`, own source maps).
      No crafted input, no fuzzing, no wordlists
      (`backend/src/services/site-security/index.js` header).
- [x] **SSRF guard on every hop** — `url-safety.js` blocks private/loopback/
      link-local/CGNAT/reserved ranges and `fetcher.js` re-validates each
      redirect target, not just the first URL.
- [ ] **Can't be used as a scanning proxy** — NOT satisfied as of
      2026-09-23: the per-target budget, result cache, concurrency cap and
      optional key/Origin gate were built and then removed at the product
      owner's request, along with the fetch time limit. Only the per-client-IP
      limit (15/15min) remains, so a script can still make this server send
      ~12 requests per report to any public site, and a site that never
      answers keeps a report waiting. Revisit before any public deployment.
- [x] **Extension permissions minimal and enforced** — `manifest.test.js`
      fails the build on any extra permission, a broad host permission,
      `content_scripts`, `web_accessible_resources`, remote or inline scripts,
      or a CSP weaker than `script-src 'self'; object-src 'none'`.
- [ ] **Host permission points at the deployed backend** — still
      `http://localhost:4000/*`. Update `manifest.json` and
      `config.js#API_BASE_URL` together (the test checks they match).
- [x] **Vulnerability data has an update path** — `npm run update:retire` in
      `extension/` regenerates `vendor/retire-js-dataset.js` from upstream
      Retire.js (29 libraries, fetched 2026-09-23); `npm run check:retire`
      exits 1 past 120 days, and stale data is disclosed in the report.
- [x] **Report never claims more than it saw** — findings are "possible"
      weaknesses, a failed page-side collection degrades to server-only
      results with a coverage note, areas that weren't checked show "Not
      checked" rather than "Clean", and every check is listed with pass/fail.
- [x] **Orchestration is tested** — `extension/security-report.test.js`
      covers the collector-failure regression, MAIN-world failure, backend
      failure and report storage (session storage only).
- [ ] **Live pass in the real extension** — the full-screen report was
      checked in a browser preview with a real backend report; run
      `extension/README.md` checklist item 11 in the loaded extension before
      the demo.
