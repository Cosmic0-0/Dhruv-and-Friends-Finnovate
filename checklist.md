# FraudLens AI — Launch Checklist

Security and launch-readiness status. Each item states the current state and
the date it was last checked against the code. Check an item off only when it
is satisfied.

## 1. Security

Baseline hardening. The app ingests untrusted input by design (pasted
messages, screenshots, uploaded documents, sender reports), so these apply
before any real data touches a demo.

- [x] **Hide API keys**: `FALLBACK_API_KEY`, `OLLAMA_URL`, `DATABASE_URL`
      and the other settings are read from `process.env`
      (`backend/src/services/analysis/llmClient.js`, `backend/src/db/index.js`).
      `.env` is gitignored and nothing is hardcoded in source. The OCR
      service uses no key. Last verified 2026-09-23.
- [x] **Purge git secrets**: the full history (`git log --all -p`) has no
      match for common key prefixes (`sk-ant-`, `sk-proj-`, `sk-or-v1-`,
      `AIzaSy`, `AKIA`), and `backend/.env`, `*.db` and `*.traineddata` have
      never been committed. Rerun if a secret is ever suspected of landing in
      a commit. Last verified 2026-09-23.
- [x] **Use a scoped/public-safe DB key**: N/A by architecture. The frontend
      never talks to the database; all reads and writes go through backend
      routes, so no database key reaches a client. Last verified 2026-09-23.
- [ ] **Enable row-level security** (or equivalent access rules) so one
      user's data can't be read or edited by another. Not satisfied: one
      shared SQLite file (`DATABASE_URL`, default `backend/fraudlens.db`) and
      no user or session concept, so there is no notion of "another user's
      row" to isolate. Last verified 2026-09-23.
- [ ] **Encrypt sensitive data at rest**: anything that could identify a
      reporter or contain raw message content in the DB. **Not satisfied**
      (verified 2026-09-23). The `documents` table
      (`backend/src/db/index.js`, written by
      `backend/src/services/document-store/`) holds the original bytes of
      every accepted `POST /api/documents` upload (PDF/PNG/JPEG/WEBP, with
      its client-supplied file name) and of every PDF sent to
      `POST /api/analyze/document` without `shareSamples: false`. These can be bank statements or ID
      documents. They are stored unencrypted, with no retention period and
      no delete path, in a database any route can write to without
      authentication. No route returns the stored bytes. The other tables
      hold no raw message text and no raw reporter IP: `reports` keeps a
      normalised sender identifier and a count, report events keep
      fingerprints and an HMAC pseudonym of the reporter, Radar keeps daily
      counters, and `batch_history` keeps aggregate counts. Screenshots are
      not stored. Re-verified on the merged code 2026-09-24.
- [ ] **Enforce server-side auth** on every endpoint that reads or writes
      stored data. Not satisfied: there is no auth middleware in
      `backend/src/index.js` or `backend/src/routes/index.js`, and every
      route is open to anyone except `POST /api/org/outcomes`, which needs
      the shared `ORG_ANALYST_TOKEN` bearer token (and is off when it is not
      set). A label there can drop an observation from the organisation's
      campaign counts, which is why it was closed first. Last verified
      2026-09-24.
- [ ] **Lock record access**: a user can only fetch their own records, not
      enumerate others' by ID. Not satisfied, but no route reads a user's
      history or a stored document by ID today. Public reads are aggregate or
      campaign-level (`/api/trends`, `/api/campaign/:fingerprintId`,
      `/api/org/campaigns`). Auth must land before any "my history" or
      document-retrieval route. Last verified 2026-09-23.
- [x] **Block field tampering**: verdicts, scores, signals and actions are
      computed by `runPipeline()` (`backend/src/services/pipeline/`) and
      never read from `req.body`. `reportCount` is always re-read from SQLite.
      Last verified 2026-09-23.
- [ ] **Secure session cookies**: N/A. There is no cookie or session
      middleware (`backend/package.json` has no `cookie-parser` or
      `express-session`). Recheck when any session concept is added. Last
      verified 2026-09-23.
- [ ] **Hash passwords** with bcrypt/argon2: N/A. There are no user
      accounts. Last verified 2026-09-23.
- [x] **Rate limit sensitive endpoints**: `express-rate-limit`, per client
      IP (`app.set("trust proxy", 1)` in `backend/src/index.js`), `429` with a
      JSON error. Routes that share a limiter share one counter per IP.
      From `backend/src/routes/index.js` and
      `backend/src/routes/conversation.js`, last verified 2026-09-24:

      | Limiter | Limit | Routes (shared counter) |
      |---|---|---|
      | `analyzeLimiter` | 20 / 15 min | `POST /api/analyze`, `POST /api/analyze/screenshot`, `POST /api/analyze/document` |
      | `conversationLimiter` | 20 / 15 min | `POST /api/analyze/conversation` (its own counter) |
      | `batchLimiter` | 10 / 15 min | `POST /api/batch-scan` |
      | `textProfileLimiter` | 600 / 15 min | `POST /api/text-profile` |
      | `documentLimiter` | 15 / 15 min | `POST /api/documents` |
      | `checkUrlLimiter` | 120 / 15 min | `POST /api/check-url` |
      | `checkSenderLimiter` | 120 / 15 min | `POST /api/check-sender`, `POST /api/check-payee`, `GET /api/campaign/:fingerprintId`, `GET /api/org/campaigns`, `GET /api/trends`, `GET /api/sandbox/playbooks` |
      | `reportLimiter` | 5 / hour | `POST /api/report`, `POST /api/org/outcomes` |
      | `siteSecurityLimiter` | 15 / 15 min | `POST /api/analyze-site` |
      | `sandboxLimiter` | 30 / 15 min | `POST /api/sandbox/next` |

      `GET /health`, `GET /health/llm` and `GET /health/document-forensics`
      have no limit. The limits are in-process, so they reset on restart and
      are not shared between instances.
- [x] **Add bot protection** on the report endpoint so the crowdsourced
      feed can't be trivially poisoned. `/api/report` has the tightest limit
      (5 per hour per IP); there is no CAPTCHA. Community cluster/wave
      detection (`backend/src/services/community-signals`) counts only
      distinct pseudonymous reporters (HMAC of the IP), never counts official
      identities or redaction placeholders as senders, never boosts messages
      that link only to official domains, and ignores machine-only evidence,
      so one IP re-reporting can't create a cluster. The raw `reportCount`
      is still a per-sender tally protected only by the rate limit. Last
      verified 2026-09-23.
- [x] **Parameterize all DB queries**: every query (`backend/src/db/`,
      `backend/src/services/scam-dna/`, `backend/src/services/radar/`) passes
      values through `?` placeholders in `better-sqlite3`'s `prepare()`. The
      three interpolated strings, all in `backend/src/db/org.js`, only build a
      list of `?` placeholders for an `IN (...)` clause, never values. Last
      verified 2026-09-24.
- [x] **Validate all input** server-side: every route with a body declares
      its own `express.json()` limit, and a body over it gets a generic JSON
      `413`; malformed JSON gets `400`. From `backend/src/routes/`, last
      verified 2026-09-24:
      - `/api/analyze` (300kb): non-empty `message` ≤ 5000 characters;
        optional `paymentContext` and `emailContext` are validated field by
        field (`backend/src/services/payment-context`,
        `backend/src/services/email-context`), and an account number is kept
        as its last 4 digits. `pageForms` (at most 10 entries), `channel`
        (fixed list) and `shareSamples` (boolean) are validated too.
      - `/api/analyze/conversation` (3mb): 1-500 messages, each `from`
        `"me"` or `"them"` with non-empty text ≤ 5000 characters, at least
        one `"them"` message.
      - `/api/text-profile` (60kb): `text` must be a string ≤ 5000
        characters.
      - `/api/check-payee` (10kb): `method` from a fixed list, non-empty
        `identifier` ≤ 64 characters, optional `name` ≤ 100 characters,
        `amount` 0 to 1e12, `purpose` from a fixed list.
      - `/api/analyze/screenshot` (8mb) and `/api/analyze/document` (14mb),
        `/api/documents` (20mb): see "Restrict file uploads".
      - `/api/batch-scan` (300kb): 1-50 non-empty strings, each ≤ 5000
        characters.
      - `/api/check-url` (10kb): non-empty `url` ≤ 2048 characters.
      - `/api/analyze-site` (300kb): non-empty `url`, then the SSRF guard;
        `clientSignals` is loosely validated and capped.
      - `/api/check-sender` (10kb) and `/api/report` (300kb): non-empty
        `sender`. There is no length cap on `sender` beyond the body limit.
        A report's optional `message` is fingerprinted only when it is a
        string ≤ 5000 characters.
      - `/api/org/outcomes` (10kb): `observationId` must be 64 hex
        characters and `label` one of the fixed outcome labels.
      - `/api/sandbox/next` (10kb): `scamType` and `stage` from the fixed
        playbooks, non-negative integer `turnIndex`.
      - `/api/campaign/:fingerprintId`: IDs over 300 characters get `400`.
      - `/api/trends`: `range`, when present, must be `7d`, `30d` or `12m`.
- [x] **Escape user content** before rendering it in the UI. User text
      (message body, signal evidence, sender) is rendered through React
      text nodes. The two `dangerouslySetInnerHTML` uses
      (`frontend/app/layout.tsx`, `frontend/app/page.tsx`) contain a fixed
      theme script and fixed JSON-LD, never user content. Last verified
      2026-09-23.
- [x] **Restrict file uploads**: the type always comes from magic bytes,
      never from a client-supplied MIME type or file name. Last verified
      2026-09-24.
      - `POST /api/analyze/screenshot`: PNG, JPEG or WEBP, ≤ 5MB decoded,
        8mb JSON body. The image is OCR'd in memory and sent to the local
        Python forensics service; neither stores it.
      - `POST /api/analyze/document`: PDF (`%PDF-`) or a ZIP whose
        `[Content_Types].xml` declares a Word main document; ≤ 10MB decoded,
        14mb JSON body. The file name is ignored and never echoed. Parsing
        runs only in a `worker_threads` worker with a 256MB heap and a 15s
        hard timeout; on a timeout, OOM or crash the worker is terminated and
        the client gets a generic "could not be read". At most 2 documents
        are analysed at once; a third gets `503`. The ZIP central directory
        is checked first (at most 500 entries and 50MB declared
        uncompressed), and each inflated part has a hard output cap. Macros
        and remote templates are detected, never run or fetched. pdf.js runs
        without font eval, system fonts, XFA or network access, with image
        size capped; sharp inputs are capped with `limitInputPixels`.
        Previews are PNG data URLs of at most 256px, and the frontend drops
        any preview that isn't a small `data:image/png` URL. A PDF's original
        bytes are stored unless `shareSamples: false` (see "Encrypt sensitive
        data at rest").
      - `POST /api/documents`: PDF, PNG, JPEG or WEBP, ≤ 15MB decoded, 20mb
        JSON body; `filename` is cut to 255 characters and stored, never
        used for the type. The original bytes are always stored, whatever
        `shareSamples` says (see "Encrypt sensitive data at rest"), and are
        never served back.
- [x] **Trim API responses**: no raw LLM prompt, stack trace or DB row
      internals in responses. Route failures return a fixed
      `{ "error": "..." }` and log the real error server-side, and the final
      error handler (`backend/src/services/http-errors`) returns generic
      `400`/`413`/`500` bodies. Email metadata (`messageId`, Return-Path, raw
      headers) is never echoed or sent to the LLM. `POST /api/documents`'
      `forensics.reason` is a fixed code (`unreachable`, `timeout` or
      `service_error`); the Python service's error text is logged only
      (`backend/src/services/document-forensics-client/index.js`). Last
      verified 2026-09-24.
- [x] **Add security headers**: `helmet()` is mounted in
      `backend/src/index.js` before the API router and sets CSP,
      `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS
      and related headers on every response. Last verified in code
      2026-09-23.
- [x] **Force HTTPS** in production: `backend/src/index.js` redirects to
      `https://` when `NODE_ENV=production` and `x-forwarded-proto` is
      `http`, and helmet's HSTS header covers repeat visits. This depends on
      the deploy proxy setting `x-forwarded-proto`; reverify on the real
      deployment target. Last verified in code 2026-09-23.
- [x] **Scan dependencies**: `npm audit --omit=dev` reports 0
      vulnerabilities in `backend`, `frontend` and `outlook-addin`. The Office
      manifest tool's vulnerable transitive `adm-zip` is pinned to the patched
      0.6.1 through an npm override in `outlook-addin/package.json`. Last
      verified 2026-09-23.
- [x] **Restrict Outlook CORS to explicit origins**: `/api` keeps
      non-browser clients unchanged, permits only the exact comma-separated
      HTTPS origins in `OUTLOOK_ADDIN_ORIGINS`, and defaults in development
      only to `https://localhost:3001`. Unknown preflights receive `403`.

## 2. Production-Credibility Signals ("don't look vibecoded")

Things that make a hackathon app read as thrown-together rather than a real
product. Judges and casual visitors notice these fast.

- [x] **View-source isn't empty**: every `frontend/app/**/page.tsx` and
      `frontend/app/layout.tsx` is a server component (no `"use client"`),
      so Next.js renders real markup. Last verified 2026-09-24.
- [x] **Custom 404 page**: `frontend/app/not-found.tsx`. Last verified
      2026-09-23.
- [x] **No unstyled Vite+React flash**: N/A. The stack is Next.js App
      Router with fonts from `next/font/google` (Onest, JetBrains Mono),
      self-hosted at build time.
- [x] **Unique page titles**: `frontend/app/layout.tsx` sets the template
      `"%s · FraudLens AI"`; pages set only their own name (e.g. "Batch scan"
      renders as "Batch scan · FraudLens AI"), and the landing page sets an
      absolute title. Last verified 2026-09-24 in the built HTML.
- [x] **Meta description**: `frontend/app/layout.tsx` sets a real
      `description`. Last verified 2026-09-24.
- [x] **`og:image`**: `frontend/app/layout.tsx` sets `openGraph.images` and
      `twitter.images` to `/icons/icon-512.png`. Last verified 2026-09-24.
- [x] **Structured data**: `frontend/app/app/page.tsx` (the web app at
      `/app`) renders a fixed `WebApplication` JSON-LD block. The landing
      page at `/` has none. Last verified 2026-09-24.
- [ ] **Exactly one `<h1>` per page**: last verified 2026-09-22, before the
      redesign, for home, Learn, Trends and Result only. No page has been
      checked in a browser since the redesign and the new landing, report,
      extension, privacy and created-by pages.
- [x] **Canonical tag**: `alternates.canonical` is set in
      `frontend/app/layout.tsx` (`/`) and on the public pages, resolved
      against `metadataBase` (`NEXT_PUBLIC_SITE_URL`, default
      `http://localhost:3000`). `/result`, `/replay` and the network page are
      not indexed and set none. `/app` sets its own (`/app`); before
      2026-09-24 it inherited the layout's `/`. Set
      `NEXT_PUBLIC_SITE_URL` to the real domain before sharing a URL. Last
      verified 2026-09-24.
- [x] **`llms.txt`**: `frontend/public/llms.txt`. Last verified 2026-09-23.
- [x] **`robots.txt` doesn't block everything**: `frontend/app/robots.ts`
      allows `/` for all user agents, disallows only `/result`, and points at
      `/sitemap.xml`. Last verified 2026-09-24.
- [x] **Favicon**: `frontend/public/icons/favicon-32.png` and
      `icon-192.png`, referenced from `frontend/app/layout.tsx`. Last
      verified 2026-09-24.
- [x] **`sitemap.xml`**: `frontend/app/sitemap.ts` lists the landing page,
      `/app` and the public tool and content routes, and excludes `/result`.
      Last verified 2026-09-24.
- [x] **`lang` attribute**: the server renders `lang="en"` and
      `frontend/components/LanguageProvider.tsx` sets
      `document.documentElement.lang` to the active language on every
      change. Last verified 2026-09-24.
- [x] **Alt text**: every raw `<img>` has an `alt`. Content images use
      localized text (the screenshot thumbnail, document previews, team
      photos on `/created-by`); the small logo mark next to the brand name
      (`frontend/components/TopNav.tsx`, `frontend/components/ScreenTitle.tsx`,
      `frontend/components/landing/LandingPage.tsx`) uses `alt=""` because
      it is decorative. Last verified 2026-09-24.
- [x] **No exposed source maps**: `frontend/next.config.ts` sets
      `productionBrowserSourceMaps: false`. Last verified 2026-09-24.
- [ ] **No console errors** on any page in the normal user flow. Last
      checked 2026-09-22: paste → verdict, the Learn quiz and `/trends` had
      no console errors. Screenshot upload, document check and `/batch`
      still need a real-browser console check.
- [x] **JS bundle isn't massive**: `next build` shows 103 kB of shared JS;
      routes load 141-169 kB, and the React Flow network page loads 192 kB.
      No LLM or OCR dependency is bundled client-side (`tesseract.js` and
      the LLM client are backend-only). Last verified 2026-09-24.

## 3. Browser extension — Security Report (`POST /api/analyze-site`)

The Security Report makes this backend send requests to arbitrary
third-party sites on a user's behalf, so it carries its own abuse and
honesty requirements on top of section 1.

- [x] **Passive only**: one GET of the page, a plain-HTTP redirect probe,
      a TLS handshake, one GET each of a fixed path list (`.git/HEAD`,
      `.env`, phpMyAdmin, admin paths, `/.well-known/security.txt`, own
      source maps), and one GET of the privacy-policy page the site links
      to. The report also runs the `/api/check-url` reputation lookup
      (capped at 5 s), which queries RDAP, Certificate Transparency logs and,
      when configured, Google Safe Browsing rather than the site. No crafted
      input, no fuzzing, no wordlists
      (`backend/src/services/site-security/index.js` header). Last verified
      2026-09-24.
- [x] **SSRF guard on every hop**: `url-safety.js` blocks private,
      loopback, link-local, CGNAT and reserved ranges, and `fetcher.js`
      re-validates each redirect target, not just the first URL.
- [ ] **Can't be used as a scanning proxy**: not satisfied. There is no
      per-target budget, result cache, concurrency cap, key/Origin gate or
      default fetch time limit; these were removed at the product owner's
      request. Only the per-client-IP limit (15 / 15 min) remains, so a script
      can make this server send about a dozen requests per report to any
      public site, and a site that never answers keeps a report waiting
      unless `SITE_SECURITY_TIMEOUT_MS` is set. Revisit before any public
      deployment.
- [x] **Extension permissions minimal and enforced**: `manifest.test.js`
      fails `npm test` on any extra permission, a broad host permission,
      `content_scripts`, `web_accessible_resources`, remote or inline
      scripts, or a CSP weaker than `script-src 'self'; object-src 'none'`.
- [x] **Host permission points at the deployed backend**:
      `extension/manifest.json` allows `https://api.fraudlens.site/*` and
      `extension/config.js` sets `API_BASE_URL` to the same origin (the test
      checks they match). For local work, change both back to
      `http://localhost:4000`. Last verified 2026-09-24.
- [x] **Vulnerability data has an update path**: `npm run update:retire` in
      `extension/` regenerates `vendor/retire-js-dataset.js` from upstream
      Retire.js (29 libraries, fetched 2026-09-23); `npm run check:retire`
      exits 1 past 120 days, and stale data is disclosed in the report.
- [x] **Report never claims more than it saw**: findings are "possible"
      weaknesses, a failed page-side collection degrades to server-only
      results with a coverage note, areas that weren't checked show "Not
      checked" rather than "Clean", and every check is listed with pass/fail.
- [x] **Orchestration is tested**: `extension/security-report.test.js`
      covers the collector-failure regression, MAIN-world failure, backend
      failure and report storage (session storage only).
- [ ] **Live pass in the real extension**: run `extension/README.md`
      checklist item 11 in the loaded extension before the demo.
