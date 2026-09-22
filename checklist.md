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
      reporter or contain raw message content in the DB. Not satisfied
      2026-09-22, but risk surface is smaller than the sketch assumed:
      `backend/src/db/index.js`'s `reports` table stores only a normalized
      sender identifier + count (no message text, no `reportedBy` — see
      `docs/API-CONTRACT.md` Known Gaps), and `batch_history` stores only
      aggregate counts. No raw message content or reporter identity is
      persisted anywhere today, so there's currently nothing sensitive at
      rest to encrypt — recheck if `reportedBy`/message content is ever
      added to the schema.
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
      testing.
- [x] **Parameterize all DB queries** — verified 2026-09-22: every query in
      `backend/src/db/index.js` uses `?` placeholders via `better-sqlite3`'s
      `.prepare().run()`, no string concatenation.
- [x] **Validate all input** server-side — verified 2026-09-22:
      `/api/analyze`, `/api/batch-scan`, `/api/report`, `/api/check-url`, and
      `/api/analyze/screenshot` all reject missing/empty/oversized/
      wrong-type input server-side (`backend/src/routes/index.js`), 400 on
      failure. Recheck if any route's validation logic changes.
- [x] **Escape user content** before rendering it back in the UI (verdict
      display, flagged-signal view, batch results) to prevent stored/reflected
      XSS from a malicious pasted message. Verified 2026-09-22: no
      `dangerouslySetInnerHTML` anywhere in `frontend/` — every place user
      text (message body, signal evidence, sender) is rendered
      (`components/ResultView.tsx`, `components/result/parts.tsx`,
      `components/result/sections.tsx`) goes through plain JSX text nodes,
      which React escapes by default. Recheck if `dangerouslySetInnerHTML`
      or a raw-HTML renderer is ever introduced.
- [x] **Restrict file uploads** (screenshot ingestion) — verified
      2026-09-22: `/api/analyze/screenshot` (`backend/src/routes/index.js`)
      caps decoded image size at 5MB, sniffs PNG/JPEG/WEBP by magic bytes
      rather than trusting the client (there is no client-supplied MIME
      field at all), and the buffer is only ever handed to the tesseract.js
      worker in memory — never written to disk or served back, so there's
      no stored-file execution surface to strip.
- [x] **Trim API responses** — don't leak internal fields (raw LLM prompt,
      stack traces, DB row internals) in `/api/analyze`, `/api/batch-scan`,
      or `/api/report` responses. The malformed-JSON HTML-stack-trace leak
      (`data/test-payloads/FINDINGS.md` #5) was already closed. Fixed
      2026-09-22: `/api/analyze` and `/api/analyze/screenshot` no longer
      pass through raw `err.message` — both now return a generic
      `{ "error": "..." }` and log the real error server-side with
      `console.error` (`backend/src/routes/index.js`). `/api/batch-scan`'s
      **per-message** `explanation` field still includes `err.message` on an
      individual analysis failure — kept deliberately, it's user-facing "why
      this one couldn't be analyzed" copy (see FINDINGS.md #6), and the
      underlying strings are already short/sanitized
      (`"Ollama request failed: 500"`), never a stack trace or internal path.
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
      equivalent) before the final demo build. Reverified 2026-09-22:
      `backend`: 0 vulnerabilities (`npm audit --omit=dev`, including the
      newly added `express-rate-limit`/`helmet`). `frontend`: now installed
      and scanned — 0 vulnerabilities (`npm audit --omit=dev`).

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
- [x] **`sitemap.xml`** present for the deployed app. Implemented
      2026-09-22: `frontend/app/sitemap.ts` lists `/`, `/learn`, `/trends`
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
      badges) — also an accessibility requirement, not just SEO. N/A as of
      2026-09-22: no raw `<img>` elements exist anywhere in `frontend/app`
      or `frontend/components` (checked, none found); all icons including
      the screenshot-upload icon (`components/icons.tsx`'s `ImageIcon`) are
      inline SVG components, and there's no image preview rendered for an
      uploaded screenshot today. Recheck the moment a screenshot preview
      `<img>` is added.
- [x] **No exposed source maps** in the production build. Verified
      2026-09-22: `frontend/next.config.ts:22` sets
      `productionBrowserSourceMaps: false`.
- [ ] **No console errors** on any page in the normal user flow (paste
      message → verdict, upload screenshot → verdict, batch scan → summary).
      Partially verified 2026-09-22: live-exercised paste → verdict (`/`
      → `/result`, through the real fallback LLM path), the Learn quiz
      flow, and `/trends`, all with DevTools console tracking on — zero
      errors on any of them, only harmless Next.js dev Fast Refresh logs.
      Screenshot → verdict and batch scan → summary are NOT verified and
      currently can't be: the screenshot upload button in
      `frontend/components/CheckForm.tsx` is still disabled ("coming
      soon"), and there is no batch-scan UI page at all
      (`frontend/app/` has no batch route — only `lib/api.ts` calls the
      backend route). Both flows are backend-complete and unit-tested but
      have no live UI path to exercise yet.
- [x] **JS bundle isn't massive** — check bundle size before the demo;
      trim unused dependencies (especially anything pulled in for the LLM
      or OCR call that isn't needed client-side). Verified 2026-09-22:
      `frontend/node_modules` now installed; `next build` output shows
      103 kB shared JS + 0.9–5.5 kB per route (103–126 kB first load JS per
      route across `/`, `/learn`, `/trends`, `/result`) — no LLM/OCR
      dependency is bundled client-side (`tesseract.js` and the LLM client
      are backend-only, `backend/src/services/`).
