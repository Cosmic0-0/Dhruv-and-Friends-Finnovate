# FraudLens AI — Launch Checklist

Working checklist for the 72-hour build. Check items off as they're satisfied.
This file is the source of truth for "are we production-credible" — see
`CLAUDE.md` for the instruction to periodically re-check the codebase against it.

## 1. Security

Baseline hardening — required before any real message content or reported
sender data touches the demo, since the app ingests untrusted user input
(pasted messages, screenshots, sender reports) by design.

- [ ] **Hide API keys** — the LLM runs locally so there's no cloud LLM key to
      leak, but OCR service keys and DB credentials still live only in
      environment variables (`.env.local`, platform env config), never
      committed or hardcoded in source.
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
- [ ] **Block field tampering** — server re-validates/re-derives fields like
      `verdict` or `reportCount` rather than trusting values echoed back
      from the client.
- [ ] **Secure session cookies** — `HttpOnly`, `Secure`, `SameSite` set
      appropriately if sessions are used.
- [ ] **Hash passwords** with a strong algorithm (bcrypt/argon2) — only
      applies if the hackathon build adds real user accounts.
- [ ] **Rate limit sensitive endpoints** — especially `/api/analyze`,
      `/api/batch-scan`, and `/api/report`, to stop abuse of the LLM call
      path and the crowdsourced report feed.
- [ ] **Add bot protection** on the report endpoint so the crowdsourced
      threat feed can't be trivially poisoned with fake reports.
- [ ] **Parameterize all DB queries** — no string-concatenated SQL/NoSQL
      queries, anywhere.
- [ ] **Validate all input** server-side (message text, screenshot uploads,
      sender identifiers) — never rely on frontend validation alone.
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
      equivalent) before the final demo build.

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
