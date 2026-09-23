# Browser extension

Manifest V3. Calls the existing backend routes (`docs/API-CONTRACT.md`) for
every check — `POST /api/check-url`, `POST /api/analyze`, `POST
/api/report`, `POST /api/analyze-site` — and never reimplements
`checkUrls()`, the analysis pipeline, or the header/TLS/cookie/exposed-
artifact checks locally, per the project rule. See "Security Report" below
for what the extension *does* collect client-side (DOM/API-surface signals
only the page's own JS context can see) versus what stays server-side.

## What's here

- `manifest.json` — MV3 manifest.
  - `host_permissions`: `http://localhost:4000/*` (dev backend); update it
    alongside `config.js#API_BASE_URL` for a deployed backend.
  - `permissions`: `tabs` (background reads `tab.url` on every
    navigate/activate for the automatic per-tab check), `contextMenus`
    (right-click "Check selected text" / "Check link"), `storage` (recent
    checks + the one-shot context-menu result, both in
    `chrome.storage.local`), `activeTab` + `scripting` (only what's needed
    to inject `content.js` on an explicit "Scan This Page" click — see
    below).
  - There is **no `content_scripts` entry.** `content.js` exists as a file
    but is only ever injected programmatically via
    `chrome.scripting.executeScript`, triggered by the "Scan This Page"
    button — never automatically on page load. This was a deliberate choice
    over registering it in `manifest.json`'s `content_scripts` (the task
    brief left this open — "register in manifest ... or programmatic
    injection on click — your call"): it keeps the extension's footprint on
    every page at zero until the user explicitly asks for a scan, and needs
    only `activeTab` rather than a broad host-permissions grant.
- `icons/` — toolbar/popup icons, reused from `frontend/public/icons`.
- `config.js` — `API_BASE_URL`, `FRONTEND_ORIGIN` (for the "Open in
  FraudLens" handoff link), and the two size caps (`MAX_ANALYZE_CHARS`,
  `MAX_HANDOFF_CHARS`) used everywhere text is sent somewhere.
- `api.js` — the only place that calls the backend. Thin wrappers:
  `checkUrl(url)`, `analyzeText(text, language?)`, `reportSender(sender)`.
  Every other file imports from here instead of hand-rolling `fetch()`.
- `state.js` — shared, pure helpers that turn an already-received backend
  response into one of four UI states — `neutral` / `safe` / `suspicious` /
  `high-risk` (plus `unreachable` for a failed backend call) — plus the
  badge glyph/colour and the text label for each. This is UI classification
  only; it never re-derives a verdict from raw text.
- `history.js` — rolling "recent checks" list in `chrome.storage.local`
  (max 15 entries). Stores **domain + timestamp + result state only, never
  message text or page content.**
- `background.js` — service worker.
  - Preserves the original per-tab auto-check (14B): on
    navigate/activate, calls `checkUrl()` for the tab's URL and caches the
    result per `tabId`; the popup reads the cache instead of re-checking.
  - Sets one of four badge states via `state.js` (14C): blank/neutral, `✓`
    steel-blue safe, `?` amber suspicious, `!` red high-risk, `×` grey
    unreachable — fails open on a backend error, exactly as before.
  - `scanActiveTab(tabId)` (14D): injects `content.js`, sends the extracted
    text to `/api/analyze`, records a recent-check entry, and — only for a
    signal whose `source` is `identity_check` or `url_parser` (the
    deterministic, non-LLM checks) at medium/high severity — asks
    `content.js` to show a dismissible inline banner (14G).
  - Registers the two context menu items (14E/14F) in `onInstalled` and
    handles their clicks: selected text → `/api/analyze`, a right-clicked
    link → `/api/check-url`. Either way the result is written to
    `chrome.storage.local["fraudlens.contextResult"]` and a small
    `result.html` popup window is opened to show it — nothing navigates,
    nothing runs without the click.
  - `runSecurityReport(tabId)` (Security Report): injects
    `collect-signals.js` (isolated world) for DOM/text signals, then
    `fraudlensObserveApiSurface` (MAIN world, injected as a self-contained
    `func` — see its own comment for why it can't close over anything in
    this file) to observe the page's real `fetch`/`XMLHttpRequest` calls for
    a bounded 1.5s window. Runs `detectVulnerableLibraries()`
    (`vendor/retire-js-scan.js`) over the collected script list, bundles
    everything into `clientSignals`, and calls `analyzeSite(tab.url,
    clientSignals)` — the backend does every header/TLS/cookie/exposed-path
    fetch itself; this file only assembles what the page's own JS context
    already saw.
- `content.js` — **not** auto-run (see manifest note above). Injected only
  on explicit user action. On injection it reads `document.body.innerText`
  (capped at 4000 chars) as its completion value — `innerText` never
  includes `<input>`/`<textarea>` values, so password and hidden-field
  content is never read, by construction, not by filtering. Reading is not
  instantaneous: a real page can still be client-rendering its visible
  content (e.g. a product-info table hydrated after load) at the exact
  moment of injection, so `waitForRenderedText()` polls for up to 1.2s
  (150ms steps) until at least a plausible amount of text (40 chars) shows
  up, before giving up - a live-observed bug (a page with clearly visible
  text extracted as empty) was this race, not a wrong selector; see
  `background.js#scanActiveTab`'s `"No readable text found on this page."`
  path and `popup.js#renderScanInconclusive` for what happens if it still
  comes back empty (an explicit inconclusive state, never rendered as
  "Safe" - see `popup.test.js`). It then stays resident to handle a later
  `FRAUDLENS_SHOW_BANNER` message, building the banner with
  `createElement`/`textContent` only (no `innerHTML`) so nothing in an
  analysis result can execute as markup.
- `popup.html` / `popup.js` (14A) — redesigned, ~380px wide, dark
  "instrument" surface matching the main app's severity palette (steel /
  brass / brick — see `styles.css`). Sections: current site + state pill,
  automatic domain check (top signals from the per-tab `/api/check-url`
  call only - explicitly labelled as such, not "strongest evidence for this
  page", so it can never be read as contradicting the separate page-scan
  result below it; a real bug found in live testing, see `popup.test.js`),
  actions (Scan This Page / Report this site / Security Report / Open in
  FraudLens), a page-scan result panel that appears after a scan, a
  security-report panel (grade pill + sorted findings list) that appears
  after a security scan, recent checks, and the privacy line (14L). There is
  no separate "Simple/full mode" toggle in this extension (that split, if it
  exists, is a frontend-app concept, not one already present here) — the
  Security Report action follows the same single-popup pattern as the
  existing actions instead of introducing one.
- `popup.test.js` — UI-state regression tests for the popup (initial load /
  scan with a finding / scan clean), run with `npm test` (`node --test`) from
  this directory. Uses a small hand-rolled fake DOM (no jsdom dependency) -
  see that file's header comment. First test file for the extension; nothing
  else here is automated yet (see "Manual verification checklist" below).
- `result.html` / `result.js` — small extension page for context-menu
  results, same visual language as the popup, reads the one-shot
  `chrome.storage.local["fraudlens.contextResult"]` entry `background.js`
  wrote.
- `styles.css` — shared by `popup.html` and `result.html`. Colour tokens
  are **manually copied** from `frontend/app/globals.css`'s severity
  palette (steel accent / brass caution / brick danger, zero border-radius,
  monospace for domains) — extension pages can't import that Tailwind theme
  directly, so keep this file in sync by hand if the app's palette changes.
  `frontend/app/globals.css` itself is read-only reference and was never
  edited for this work. Also defines `.signal-item[data-severity="info"]`
  for the Security Report's `info`-severity findings, which `/api/check-url`
  and `/api/analyze` never produce (their severities are high/medium/low
  only).
- `collect-signals.js` (Security Report, see below) — like `content.js`,
  never auto-run; injected only when "Security Report" is clicked. Isolated
  world (the default): reads the DOM for sink-pattern text (inline
  `<script>` content), inline event-handler attributes, reflected URL query
  params already present in the rendered HTML, mixed-content resource
  entries (`performance.getEntriesByType("resource")`), insecure form
  actions, and the page's script tags — fetching only **same-origin**
  external scripts' text (capped to 6, 20k chars each) for sink/Retire.js
  text matching. Cross-origin scripts are identified by URL only (still
  enough for Retire.js's URI-based detection); their text is never fetched,
  to avoid depending on third-party CORS headers. Returns everything as its
  completion value — `background.js#runSecurityReport` does the rest.
- `vendor/retire-js-dataset.js` — a trimmed (16-library) subset of the real
  upstream [Retire.js `jsrepository.json`](https://github.com/RetireJS/retire.js/blob/master/repository/jsrepository.json)
  (Apache-2.0), fetched 2026-09-23. Every regex is copied verbatim from
  upstream for the libraries kept; see the file's header comment for which
  ones and why only those.
- `vendor/retire-js-scan.js` — matches script src/text against that dataset
  (`uri`/`filecontent` extractors only — `func`/`hashes` extractors are a
  documented scope cut, see the file's header). Pure computation, no page
  access, so it runs in `background.js`'s normal module context rather than
  being duplicated into an injected script.

## Load it locally

`chrome://extensions` → enable Developer mode → "Load unpacked" → select
this `extension/` directory. Requires the backend running at
`http://localhost:4000` (or wherever `config.js` points), and, for the "Open
in FraudLens" link, the frontend running at `http://localhost:3000` (or
wherever `config.js#FRONTEND_ORIGIN` points).

## Feature status (Phase 14/15 of the project brief)

| Item | Status | Notes |
|---|---|---|
| 14A popup redesign | Done | `popup.html`/`popup.js`/`styles.css` |
| 14B automatic URL check | Preserved | Unchanged behaviour, new UI consumes it |
| 14C badge states | Done | 4 states + a text explanation always shown, badge glyph never the only signal |
| 14D Scan This Page | Done | `content.js` + `background.js#scanActiveTab` |
| 14E context menu: selection | Done | `background.js` + `result.html` |
| 14F context menu: link | Done | Reuses `/api/check-url`, same as the badge check |
| 14G inline banner | Done, scoped down | Only for deterministic (`identity_check`/`url_parser`) signals, never LLM-only ones; dismissible, never blocks the page |
| 14H financial-form warning | **Deferred, out of scope for this pass** | Too invasive for the time available, per the task brief — no code for this exists |
| 14I report this site | Done | `POST /api/report` with the current hostname as `sender` — see limitation below |
| 14J recent checks | Done | `history.js`, `chrome.storage.local`, 15-entry cap, no text ever stored |
| 14K web app handoff | Partial, documented limitation below | |
| 14L privacy copy | Done | Shown in both `popup.html` and `result.html` |
| Security Report | Done, code-reviewed only — **not yet run in a real browser** (see below) | `collect-signals.js` + `background.js#runSecurityReport` + `vendor/retire-js-*` + `POST /api/analyze-site` |

### Known limitations

- **Web app handoff (14K).** The frontend's `/result` page only reads its
  own `sessionStorage` (`frontend/lib/storage.ts` → `loadResult()`), which
  an extension running on a different origin cannot write into, and there is
  no query-param entry point into that flow today. Rather than inventing new
  frontend/backend state from the extension side, "Open in FraudLens" opens
  `FRONTEND_ORIGIN/?scan=<capped text>` — a short, capped excerpt (see
  `MAX_HANDOFF_CHARS` in `config.js`) is attached as a query param, but
  **the frontend does not currently read it**, so today this link just opens
  the FraudLens home page. Flag to the frontend owner if a `scan` query-param
  entry point on the home page (prefill + optionally auto-run) is wanted;
  this file was left untouched per the task's directory-gating rule.
- **`/api/report`'s `sender` field.** The contract's `/api/report` only
  ever stores a single free-form `sender` string plus a count
  (`backend/src/db/index.js`); there's no dedicated "domain report" shape.
  "Report this site" sends the current hostname as `sender`, which the
  backend accepts (it's just a string identifier) but conflates with
  phone-number/sender reports in the same table. This is a pre-existing
  backend limitation, not something this extension pass changes — no
  backend field was invented to work around it.
- **14H (financial-form/payment warning) is explicitly skipped** for this
  pass, per the task brief — no detection of payment forms, no code path
  for it exists in `content.js` or elsewhere.
- **14G banner** only fires from the "Scan This Page" flow, not from the
  automatic per-tab URL check — the automatic check has no page text to
  reason about beyond the domain itself, and the badge/popup already covers
  that case.
- **Security Report API-surface capture is partial.** The MAIN-world
  `fetch`/`XMLHttpRequest` observer only starts once "Security Report" is
  clicked and only watches for ~1.5s (`API_SURFACE_WINDOW_MS` in
  `background.js`) — the same "never auto-run on page load" constraint
  `content.js` already follows (see above). Calls the page already made
  before the click (e.g. its initial page load) are not visible; only calls
  made during that short window are. This is disclosed in the report's
  `api-surface` finding description, not hidden.
- **Security Report cross-origin script text is never fetched**
  (`collect-signals.js`) — only same-origin scripts' text is read, for both
  sink-pattern and Retire.js `filecontent` matching. Cross-origin (e.g.
  CDN-hosted) scripts still get Retire.js's URI-based version detection
  from their `src` alone, which covers the common versioned-CDN-URL case;
  they just don't get filecontent-based detection. This avoids depending on
  third-party CORS headers and content-script fetch-attribution ambiguity
  under MV3 — see `collect-signals.js`'s header comment.
- **Retire.js matching is real but reduced.** `vendor/retire-js-scan.js`
  implements upstream Retire.js's own `uri`/`filecontent` regex extractors
  (regexes copied verbatim from the real dataset) but not its `func`
  extractors (reading a global like `window.jQuery.fn.jquery`, which needs
  MAIN-world execution per candidate library) or `hashes` extractors (exact
  file-hash matching). A library that only ships those signature types
  upstream won't be detected here — a false-negative risk, never a
  false-positive one, since every reported finding still comes from a real
  regex match and a real version-range hit. See that file's header comment.

## Manual verification checklist (chrome://extensions)

Since this environment can't load an unpacked extension into a real
browser, the code was reviewed by hand instead of tested live — **this
applies to the Security Report feature too, and more so**: it's the newest,
largest-surface-area code in this extension (a new injected content script,
a MAIN-world function injection, a vendored third-party dataset, and a new
backend endpoint that makes its own outbound requests), so treat step 11
below as the highest-priority item in this checklist before any demo that
plans to show it. Before the demo, a human should walk through:

1. **Load**: `chrome://extensions` → Developer mode → Load unpacked →
   select `extension/`. Confirm no manifest/parse errors are reported.
2. **Auto badge check (14B/14C)**: with the backend running, navigate to a
   normal site (should badge `✓` safe) and to a known lookalike domain from
   `backend/src/services/domain-matching/index.js`'s test fixtures (should
   badge `!` red / `?` amber depending on severity). Stop the backend and
   navigate again — badge should show grey `×`, popup text should say
   "Backend unreachable", and the page must not be blocked (fail-open).
3. **Popup layout (14A)**: open the popup on a couple of sites, confirm the
   ~380px width, section layout, state pill, and privacy line all render
   and don't overflow.
4. **Scan This Page (14D)**: on a real page with visible text, click "Scan
   This Page" in the popup; confirm a verdict/signals panel appears, and
   that "Recent checks" gets a new entry. Confirm it does **not** fire on
   plain page load — only on the click.
5. **Inline banner (14G)**: scan a page containing a known lookalike-domain
   link or an MCB/SBM/Absa/Bank-One-impersonation-style message (e.g. one of
   `data/test-payloads/`'s samples, pasted into a scratch page) and confirm
   the dismissible top banner appears and can be dismissed; confirm it does
   *not* appear for a page whose only signals are LLM-only (no
   `identity_check`/`url_parser` source).
6. **Context menu — selection (14E)**: select some text on any page,
   right-click, confirm "Check selected text with FraudLens" appears, click
   it, confirm a small result window opens with a verdict and signals.
7. **Context menu — link (14F)**: right-click a link (ideally a lookalike
   test-fixture URL), confirm "Check link with FraudLens" appears and opens
   a result window without navigating the page.
8. **Report this site (14I)**: click "Report this site" in the popup,
   confirm a success message with a report count appears, and that a
   second click increments it.
9. **Recent checks (14J)**: after a few checks of different kinds, confirm
   the popup's "Recent checks" list shows domain + relative time + a state
   dot for each, oldest entries drop off past 15.
10. **Open in FraudLens (14K)**: click the link after a page scan or a
    context-menu check; confirm it opens `FRONTEND_ORIGIN` with a `scan=`
    query param (frontend doesn't consume it yet — this is the documented
    limitation above, not a bug).
11. **Security Report — the newest feature here, and the one this pass has
    the *least* real-world confidence in (see the callout below).** Click
    "Security Report" in the popup on a real site (try a well-known site
    with a modern security-header setup, and separately an older/simpler
    site likely missing several headers, to see the grade actually move).
    Confirm:
    - A grade pill (A–F) and a findings list render, sorted worst-first.
    - The findings plausibly match what you'd expect for that site (e.g. a
      site without CSP/HSTS shows those as missing; a well-secured site
      shows few or no findings).
    - If the site uses jQuery, Bootstrap, or another library in
      `vendor/retire-js-dataset.js` at an old version (many WordPress sites
      still do), confirm a `vulnerable-library` finding appears with a
      plausible CVE/summary — and confirm a site on a *current* version
      does **not** produce one (no false positive).
    - Open the browser's own DevTools Network/Console panel on that tab
      while scanning: nothing should look like a crafted/injected request
      to the target site — only plain GETs to a handful of well-known
      paths (`.git/HEAD`, `.env`, `admin/`, `wp-admin/`, `phpmyadmin/`) plus
      the page's own already-referenced source-map URLs, all from the
      **backend**, not the extension (the extension itself only fetches
      same-origin scripts it already saw referenced on the page).
    - Confirm the popup never hangs indefinitely — a slow/unreachable site
      should still resolve to *some* report (grade `N/A`) within a few
      seconds, per `services/site-security`'s own timeouts.
12. **Permissions sanity**: in `chrome://extensions` → Details → confirm the
    permissions list matches `manifest.json` (`tabs`, `contextMenus`,
    `storage`, `activeTab`, `scripting`, plus the `localhost:4000` host
    permission) — no unexpected broad host access.

## Demo note (differentiator: domain/lookalike-URL matching)

Live demo path for this differentiator: navigate to a lookalike domain from
`backend/src/services/domain-matching/index.js`'s test fixtures (e.g. a
`mcb-secure.top`-style host), open the popup, and show the red state pill +
strongest-evidence signal — same detection function the message-analysis
flow uses, now running on the URL bar instead of pasted text. For the newer
Phase 14 features, follow with a right-click "Check link with FraudLens" on
a lookalike link found on a page (no navigation needed), then a "Scan This
Page" on a page containing a pasted scam-style message to show the inline
banner. Coordinate with Caellum's demo script (`data/test-payloads/`) so
this beat is sequenced with the rest of the walkthrough rather than
improvised.
