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
- [ ] **Purge git secrets** — run a secret scan (e.g. `git log -p | grep`,
      or a scanner tool) before any push; if a secret was ever committed,
      rotate it, don't just delete the line.
- [ ] **Use a scoped/public-safe DB key** — the key exposed to the frontend
      (if any) has only the minimum permissions needed; the privileged key
      stays server-side only.
- [ ] **Enable row-level security** (or equivalent access rules) on the
      reports/batch-history tables so one user's data can't be read or
      edited by another through a misconfigured query.
- [ ] **Encrypt sensitive data at rest** — anything that could identify a
      reporter or contain raw message content in the DB.
- [ ] **Enforce server-side auth** on every endpoint that reads/writes
      report or batch-history data — never trust a client-supplied user ID.
- [ ] **Lock record access** — a user (or anonymous session) can only fetch
      their own batch scan history, not enumerate others' by ID.
- [x] **Block field tampering** — verified 2026-09-22: `verdict`/`signals`
      always come from `analyzeMessage()` + `checkUrls()`, never from
      `req.body`; `reportCount` is always re-read from SQLite in
      `reportSender()` (`backend/src/db/index.js`), never trusted from the
      client. Recheck if either route starts accepting these as input.
- [ ] **Secure session cookies** — `HttpOnly`, `Secure`, `SameSite` set
      appropriately if sessions are used.
- [ ] **Hash passwords** with a strong algorithm (bcrypt/argon2) — only
      applies if the hackathon build adds real user accounts.
- [ ] **Rate limit sensitive endpoints** — especially `/api/analyze`,
      `/api/batch-scan`, and `/api/report`, to stop abuse of the LLM call
      path and the crowdsourced report feed.
- [ ] **Add bot protection** on the report endpoint so the crowdsourced
      threat feed can't be trivially poisoned with fake reports.
- [x] **Parameterize all DB queries** — verified 2026-09-22: every query in
      `backend/src/db/index.js` uses `?` placeholders via `better-sqlite3`'s
      `.prepare().run()`, no string concatenation.
- [ ] **Validate all input** server-side — partially done 2026-09-22:
      `/api/analyze`, `/api/batch-scan`, `/api/report` now reject
      missing/empty/oversized/wrong-type `message`/`messages`/`sender`
      (`backend/src/routes/index.js`, non-empty-string + length-cap checks,
      400 on failure). Screenshot upload validation is still open — OCR
      ingestion isn't implemented yet, recheck when it lands.
- [ ] **Escape user content** before rendering it back in the UI (verdict
      display, flagged-signal view, batch results) to prevent stored/reflected
      XSS from a malicious pasted message.
- [ ] **Restrict file uploads** (screenshot ingestion) — enforce file type,
      size limits, and strip/ignore executable content; never trust the
      client-reported MIME type.
- [ ] **Trim API responses** — don't leak internal fields (raw LLM prompt,
      stack traces, DB row internals) in `/api/analyze`, `/api/batch-scan`,
      or `/api/report` responses.
- [ ] **Add security headers** (CSP, `X-Content-Type-Options`,
      `X-Frame-Options` / frame-ancestors, `Referrer-Policy`).
- [ ] **Force HTTPS** in production/deployment config.
- [ ] **Scan dependencies** for known vulnerabilities (`npm audit` or
      equivalent) before the final demo build. `backend`: 0 vulnerabilities
      as of 2026-09-22 (`npm audit --omit=dev`). `frontend`: not yet
      installed/scanned — Oleg's area, rerun once `npm install` has been
      run there.

## 2. Production-Credibility Signals ("don't look vibecoded")

Things that make a hackathon app read as thrown-together rather than a real
product. Judges and casual visitors notice these fast.

- [ ] **View-source isn't empty** — for any SSR/SSG page, meaningful markup
      is present without running JS (matters for Next.js if a page is
      accidentally client-only).
- [ ] **Custom 404 page** exists instead of the framework default.
- [ ] **No unstyled Vite+React flash** — if any part of the stack uses a
      raw Vite/CRA scaffold, it's been branded, not left default.
- [ ] **Unique page titles** — each route (home, batch scan, report) has
      its own `<title>`, not a copy-pasted default across the site.
- [ ] **Meta description** present on the main page(s).
- [ ] **`og:image`** set for link previews (Slack/demo sharing).
- [ ] **Structured data** (schema.org / JSON-LD) on the landing page if
      time allows — low priority for a hackathon demo.
- [ ] **Exactly one `<h1>` per page** — not zero, not multiple.
- [ ] **Canonical tag** present if the app is deployed under a real domain.
- [ ] **`llms.txt`** present (optional, only if time allows).
- [ ] **`robots.txt` doesn't block everything** — don't accidentally
      disallow all crawlers/AI agents from the deployed demo.
- [ ] **Favicon** set (not the framework default).
- [ ] **`sitemap.xml`** present for the deployed app.
- [ ] **`lang` attribute** set correctly on `<html>` — notable here since
      the app is explicitly multilingual (English/French/Kreol); the
      attribute should reflect the active UI language, not be hardcoded.
- [ ] **Alt text** on all images (screenshot previews, icons, verdict
      badges) — also an accessibility requirement, not just SEO.
- [ ] **No exposed source maps** in the production build.
- [ ] **No console errors** on any page in the normal user flow (paste
      message → verdict, upload screenshot → verdict, batch scan → summary).
- [ ] **JS bundle isn't massive** — check bundle size before the demo;
      trim unused dependencies (especially anything pulled in for the LLM
      or OCR call that isn't needed client-side).
