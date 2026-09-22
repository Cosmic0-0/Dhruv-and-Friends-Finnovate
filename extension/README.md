# Browser extension (stretch goal)

See `CLAUDE.md` → Role gating and Scope boundaries for ownership.

**Scaffolded ahead of the core app being demo-stable** — `frontend/` is
still the bare Next.js default with no verdict UI wired up. This was a
deliberate call to start the extension in parallel rather than the
CLAUDE.md-recommended sequencing; flag to Oleg that the core UI still needs
to land for the app to be demo-ready end to end.

Manifest V3, no content script yet (badge + popup only — see below). Calls
`POST /api/check-url` (`docs/API-CONTRACT.md`) for every domain check —
never reimplements `checkUrls()` locally, per the project rule.

## What's here

- `manifest.json` — MV3 manifest. `host_permissions` is pinned to
  `http://localhost:4000` (dev backend); update it alongside
  `config.js#API_BASE_URL` for a deployed backend. Only requests the `tabs`
  permission (needed for the background worker to read `tab.url` on every
  tab's navigate/activate, not just a user-invoked one) — a separate
  `activeTab` grant was redundant since the popup only ever reads `tab.id`.
- `icons/` — toolbar/popup icons, reused from `frontend/public/icons` (same
  brand mark as the PWA) so the extension doesn't ship a generic
  puzzle-piece icon during the demo.
- `background.js` — service worker. On tab activate/navigate, reads the
  tab's URL and calls `/api/check-url`; sets a red badge (`!`) on the
  extension icon if the domain is flagged. Fails open (no badge, no verdict
  claimed) if the backend is unreachable — never blocks browsing.
- `popup.js` / `popup.html` — clicking the icon shows the current tab's
  hostname, safe/flagged state, and the flagged signal descriptions
  (same `signals[].description`/`severity` shape as `/api/analyze`).
- `config.js` — `API_BASE_URL`, the only place the backend origin is set.

## Load it locally

`chrome://extensions` → enable Developer mode → "Load unpacked" → select
this `extension/` directory. Requires the backend running at
`http://localhost:4000` (or wherever `config.js` points).

## Demo note (differentiator: domain/lookalike-URL matching)

Live demo path for this differentiator: navigate to a lookalike domain from
`backend/src/services/domain-matching/index.js`'s test fixtures (e.g. a
`mcb-secure.top`-style host), click the extension icon, and show the red
badge + popup signal — same detection function the message-analysis flow
uses, now running on the URL bar instead of pasted text. Coordinate with
Caellum's demo script (`data/test-payloads/`) so this beat is sequenced with
the rest of the walkthrough rather than improvised.
