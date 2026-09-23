# QA round 2 findings (2026-09-23)

What QA found in round 2, in one place. Start with **At a glance**, then
read the section for the part you own. Every finding says what's wrong, how
to see it, where to look, and how to check your fix.

- **Web app and backend:** tested on `main` @ `04ae58f` (after PR #12, the
  desktop side menu). Every English, French and Kreol test message was run
  once, and every screen was clicked through in a real browser at laptop
  and phone width, including the production build and offline mode.
- **Extension:** tested earlier the same day on `878da43`, **before**
  `04ae58f` rewrote `background.js`/`popup.js` and added tab state. Those
  findings need a re-test; some may already be fixed.
- **Since testing:** `main` got the UI owner's newer screens (up to
  `5027a8d`). No backend changes. The Kreol text was written (#18, needs a
  re-check and the Kreol owner's review). The code behind the other web app
  findings (#2, #8, #16, #19) is unchanged. The web scripts were written
  against `04ae58f`, so a changed button label may need a small script fix.

## At a glance

| # | Problem | Severity | Area |
|---|---|---|---|
| 1 | Five Kreol scam messages are called Safe | high | backend |
| 2 | A checked message never shows "reported N times" | high | backend + web app |
| 3 | Everyone using the web app shares one check limit, and it can be dodged | high | backend + web app |
| 4 | Pages with a bank name in the address get a red badge | high | extension + backend (re-test) |
| 5 | A bank's own "we'll never ask for your OTP" page is called a scam | high | backend (re-test) |
| 6 | Extension popup forgets the result after ~30 s | high | extension (re-test) |
| 7 | Scanning a fake-bank site turns "High risk" into "Scan incomplete" | high | extension (re-test) |
| 8 | "Report this sender" reports the bank the scam pretends to be | medium | web app + backend |
| 9 | "Pay a fee to receive money" scams stop at Suspicious | medium | backend |
| 10 | If Ollama is down, a check takes ~63 s and still gets no AI | medium | backend |
| 11 | Warning banner on a page the extension calls Safe | medium | extension (re-test) |
| 12 | Switching tabs uses up the link-check limit | medium | extension (re-test) |
| 13 | Short links and raw-IP links show a green tick | medium | backend + extension (re-test) |
| 14 | The extension never shows how often a site was reported | medium | backend + extension (re-test) |
| 15 | Text typed into rich text boxes is sent when scanning a page | medium | extension (re-test) |
| 16 | Error messages don't say what went wrong (limits, backend down) | low | web app + extension |
| 17 | Junk sender names in reports, Radar and the network view | low | backend + extension |
| 18 | Kreol mode shows much of the app in English (probably fixed on `main`, re-check) | low | web app |
| 19 | Warning-sign counts and labels disagree on screen | low | web app |
| 20 | Smaller backend items (opening moves, Radar label, trusted sites) | low | backend |
| 21 | Smaller web app / extension / docs items | low | web app, extension, docs |

Fixed since round 1: real bank messages (`EN-13`, `EN-14`, `FR-13`,
`FR-14`) are now Safe 0 instead of flagged.

**Message accuracy (one run each):** English 12/20, French 13/20, Kreol 6/24
match the expected verdict (round 1: 9, 11, 10).

## Before the demo

- **Demo from the production build** (`npm run build`, then `npx next start`).
  In `npm run dev` a red "1 Issue" badge can pop up (#21).
- **Mind the shared limit (#3):** until it's fixed, 20 checks per 15 minutes
  covers *everyone* using one web app server. Restart the backend just
  before going on stage.
- **Show "reported N times" on the Before You Pay screen**, not on a checked
  message (#2).
- **Use messages that gave the right answer twice in a row:** scam `EN-01`–`EN-05`,
  `EN-10`, `FR-01`–`FR-05`, `FR-07`, `KR-07`, `KR-14`; safe `EN-13`–`EN-18`,
  `FR-13`–`FR-18`, `KR-22`, `KR-24`. Avoid `EN-07`, `KR-05`, `KR-11` (they
  flip between runs).
- **Read aloud** is inside Simple mode: on a scam or suspicious result,
  press **Simple mode**, then **Read this aloud** under the steps.
- **AI host:** Ollama runs on the team's tailnet Ollama host (see `backend/README.md` Local LLM Setup).
  Check `tailscale status` on the day; hosts move.

---

## Backend

### 1. Five Kreol scam messages are called Safe (high)

`KR-03`, `KR-06`, `KR-09`, `KR-13` and `KR-21` come back **Safe** (14–18 out
of 100). They get only one or two weak word matches and nothing from the AI.
Kreol accuracy is 6 of 24, down from 10 in round 1, while English and French
went up.

- **See it:** Settings → KREOL, paste `KR-21` from `kr.json`, check → "Paret bon" 14/100.
- **Look at:** Kreol entries in `backend/src/services/lexicon/index.js`;
  score floors in `backend/src/services/risk-engine/index.js`.
- **Fixed when:** `node webapp-payloads.mjs --only KR-03,KR-06,KR-09,KR-13,KR-21`
  shows none of them as `safe`, and `KR-22`/`KR-24` stay safe.

### 5. A bank's own "we'll never ask for your OTP" page is called a scam (high, re-test)

A bank's fraud-advice page ("MCB will never ask you to share your OTP or
password") comes back SCAM 52 with a red banner in the extension. The word
rule for "log in … password" matches across several menu lines and ignores
the "never". The French/Kreol version of the page is correctly Safe.

- **See it:** open `http://localhost:5500/bank-advice.html`, popup → Scan This Page.
- **Look at:** SEC-03 in `backend/src/services/lexicon/index.js` (not
  `negatable`, crosses line breaks).
- **Fixed when:** `node verify-extension-fixes.mjs --browser` → `PASS #20`,
  and the `scam.html` guard still passes.

### 9. "Pay a fee to receive money" scams stop at Suspicious (medium)

"You've won, pay a small fee to receive it" messages get two signals (fee +
unexpected money) and stop at Suspicious 21–23. No rule combines them.

- **See it:** check `FR-11` → Suspicious 23. Same for `KR-15`, `KR-19`, `KR-20`, `FR-08`.
- **Look at:** `backend/src/services/risk-engine/index.js`.
- **Fixed when:** `node webapp-payloads.mjs --only EN-08,FR-08,FR-11,KR-15,KR-19,KR-20`
  shows `scam`, and `EN-13`–`EN-18`/`FR-13`–`FR-18` stay safe.

### 10. If Ollama is down, a check takes ~63 s and still gets no AI (medium)

With Ollama unreachable, the backend tries the hosted backup (OpenRouter
free model). It times out after 60 s, then answers from the fixed rules.
The verdict is right, but the person waits a minute. With the AI switched
off, the same check takes under 3 s. The shared VPS has no backup configured.

- **See it:** `AI_URL=http://127.0.0.1:9 sh restart-backend.sh`, then check `EN-01`.
- **Look at:** `backend/.env` (`OPENROUTER_MODEL`, `LLM_TIMEOUT_MS`).
- **Fixed when:** `node webapp-ui.mjs --only aidown` → `PASS Ollama down, auto mode`
  in well under a minute (a faster backup model, or a short backup timeout).

### 20. Smaller backend items (low)

- **Opening-move messages called Safe:** `EN-19`, `EN-20`, `FR-19` (asks for
  an ID card number), `FR-20` are Safe 12–16; expected Suspicious. No
  ID-document request pattern in the lexicon. *Fixed when:*
  `node webapp-payloads.mjs --only EN-19,EN-20,FR-19,FR-20` shows `suspicious`.
- **Radar calls the MCB pattern "SBM impersonation":** `/api/trends` →
  `fingerprintId "mcb"`, `scamType "SBM_IMPERSONATION"`. The type is set by
  the first AI answer and never updated (`backend/src/services/scam-dna/index.js:32-36`).
  The contract example `MCB_IMPERSONATION-mcb` (`docs/API-CONTRACT.md:798`)
  doesn't match the code. *Fixed when:* `/api/trends` shows MCB with an MCB type.
- **Trusted-domains list includes file-sharing sites** (re-test):
  `docs.google.com`, `drive.google.com`, `dropbox.com`, `forms.office.com`
  are trusted as whole sites, so a phishing form hosted there loses its link
  warning (`data/trusted-domains.json`). *Fixed when:*
  `checkLinkHygiene("Verify your MCB account here: https://docs.google.com/forms/d/e/x/viewform")`
  returns URL-08.

## Backend + web app

### 2. A checked message never shows "reported N times" (high)

The web app removes phone numbers before sending a message (correct), so
the backend can't look up how often the number was reported. "Reported N
times" never appears after a check, even for a number with 14 reports.
Before You Pay already solves this: it looks the number up separately and
shows "This recipient has been reported 14 times".

- **See it:** check the SEED-0012 message ("Mum it's me … my new number:
  5900 0012 …", `data/sender-reputation-seed/senders.json`). No count.
- **Look at:** `frontend/lib/redact.ts`; `withSenderReports` in
  `backend/src/services/pipeline/index.js`; `frontend/components/SafePayFlow.tsx`
  for the working pattern (`/api/check-sender` from the browser).
- **Fixed when:** `node webapp-ui.mjs --only seed` prints
  `screen mentions reports: true` and still `PASS phone number replaced before sending`.

### 3. Everyone using the web app shares one check limit, and it can be dodged (high)

The backend allows 20 checks per 15 minutes per visitor. But requests
through the web app all arrive from the web server's own address, so **every
visitor shares the same 20**. If a few judges try it on their phones, the
21st check fails for all of them. The backend also trusts an
`X-Forwarded-For` header the visitor can set, so a made-up header gets a
fresh limit. Community wave counts "distinct reporters" from the same
address, so all web app reporters count as one person, and a faked header
counts as a new one.

- **See it:** restart the backend, send 20 checks through `:3000`, then
  from another address (e.g. this PC's Tailscale IP) → 429. Add the header
  `x-forwarded-for: 9.9.9.9` → 200.
- **Look at:** `backend/src/index.js:13` (`trust proxy`), the `/api` rewrite
  in `frontend/next.config.ts`, limits in `backend/src/routes/index.js:36-66`,
  `recordUserReport` in `backend/src/routes/index.js:311-315`.
- **Fixed when:** `node webapp-ui.mjs --only ratelimit` → the second address
  gets `HTTP 200` and the made-up header gets `HTTP 429`.

### 8. "Report this sender" reports the bank the scam pretends to be (medium)

On a fake-MCB message the result says "SMS from MCB" and the button says
"Report this sender". Clicking it files a report against **MCB**, the real
bank. With enough clicks, MCB would show up in Radar's most-reported senders.

- **See it:** check `EN-01`, click Report this sender, then
  `curl -X POST localhost:4000/api/check-sender -H 'content-type: application/json' -d '{"sender":"MCB"}'`.
- **Look at:** `frontend/components/ResultView.tsx:78,221`; `/api/report` in
  `backend/src/routes/index.js`.
- **Fixed when:** `node webapp-ui.mjs --only result` →
  `PASS the reported sender is not the bank being impersonated`.

### 17. Junk sender names in reports, Radar and the network view (low)

Anything that looks like a sender gets stored as one.

- A sender name with any digit is saved as a phone number: "QA round2 limit
  test" became `2302` and made Radar's top-5 list (`normalizeSender`,
  `backend/src/db/index.js:96-111`).
- The AI's sender guess is stored as-is: `/network/mcb` lists "FR-01" (a
  test label), "Messages I received", "Security centre" and MCB's own
  `internet.mcb.mu` as senders (`backend/src/services/scam-dna/index.js:38-41`).
  The extension popup shows the same kind of guess: "Claimed identity:
  FR-01 (reported 0x)" (re-test).
- A link split over two lines in a screenshot adds the domain `mcb-`.
- Extension: "Report this site" on a new tab reports "newtab" / "extensions" (re-test).

*Fixed when:* a name with a digit keeps its own key; `verify-extension-fixes.mjs --browser`
→ `PASS #26` and `PASS #30` (also on `fr-kr.html`).

## Web app

### 16. Error messages don't say what went wrong (low)

- 21st check in 15 minutes: "Our checker is busy … try again in a moment".
  It's a limit that can last 15 minutes (`frontend/lib/api.ts:231-234`).
- 6th report in an hour: "We couldn't send the report. Please try again."
  Trying again will fail (`frontend/components/result/ReportButton.tsx`).
- Extension (re-test): every failed scan says "could not read this page",
  even when the backend is down or the limit is hit; the right-click check
  shows no progress and says "Backend unreachable" for every error; a
  used-up limit while browsing says "Backend unreachable: backend returned 429".

*Fixed when:* `node webapp-ui.mjs --only ratelimit,reportlimit` shows a "too
many … try again in a few minutes" message, and the extension steps in
`EXTENSION-FIX-CHECKS.md` (#27) show the real reason.

### 18. Kreol mode shows much of the app in English (low, probably fixed on `main`)

On `04ae58f`, with KREOL selected, the side menu said "Settings", "Tools",
"I'm about to pay", "Batch scan", and the result said "Simple mode", "Risk
score", "Warning signs", "What's wrong": unreviewed Kreol fell back to
English (31 `TODO_KREOL` places in `frontend/lib/i18n.ts`). French was
complete.

**After testing,** `6d902f6` and `5027a8d` on `main` wrote the missing Kreol
as drafts (`DRAFT_KREOL`), so every screen should now be in Kreol. Not
re-tested, and the drafts still need the Kreol owner's review.

*Fixed when:* Settings → KREOL shows no English on the side menu, Check and
result screens (WEBAPP-CHECKLIST section 3), and the drafts are reviewed.

### 19. Warning-sign counts and labels disagree on screen (low)

- Result: the header says "Warning signs **9** found", the explanation says
  "from **6** warning signs" (the header also counts 3 supporting signals
  that don't add to the score, `frontend/components/result/ResultHero.tsx:88`).
  "What's wrong" lists "It rushes you" three times and "The link is not the
  bank" twice (`WhatsWrongCard` in `frontend/components/result/SignalCards.tsx`).
- Conversation: a message tagged "No warning signs" has "from 2 warning
  signs" right under it (the Conversation `verdicts.safe` string in
  `frontend/lib/i18n.ts`). And "please send me
  the 6-digit OTP code" after an MCB intro and a threat is only Suspicious
  30, because each message is scored alone.

*Fixed when:* `node webapp-ui.mjs --only result` → `PASS warning-sign count matches …`,
each reason is listed once, and a Conversation message with signs isn't
tagged "No warning signs".

### 21. Smaller web app / extension / docs items (low)

- **Web app:** hydration warning in `npm run dev` on the Check and Settings
  screens once a theme/language is saved; shows Next's red "1 Issue" badge.
  Production is clean. Probably the theme/language read from localStorage
  on first render.
- **Extension docs** (re-test): `extension/README.md` still says the web app
  doesn't read "Open in FraudLens" links (it does). *Fixed when:*
  `verify-extension-fixes.mjs` → `PASS #29`.
- **Extension** (re-test): the badge appears only after a page has fully
  loaded, so a slow fake site shows no badge while it loads
  (`changeInfo.status === "complete"` in `extension/background.js`).

## Extension (all need a re-test after `04ae58f`)

### 4. Pages with a bank name in the address get a red badge (high)

Wikipedia's "MCB Group" page, LinkedIn, news and GitHub pages with a bank
name in the path get the red **!** badge.

- **See it:** open https://en.wikipedia.org/wiki/MCB_Group with the extension loaded.
- **Look at:** `/api/check-url` in `backend/src/routes/index.js`; URL-03 path
  rule in `backend/src/services/domain-matching/index.js`.
- **Fixed when:** `node verify-extension-fixes.mjs` → `PASS #19`, lookalike guard still passes.

### 6. Extension popup forgets the result after ~30 s (high)

After Chrome is idle for ~30 s, the popup on a fake bank site says "Not
checked yet — reload the page" while the badge is still red. The new
`extension/tab-state.js` may already fix this.

- **See it:** open `https://mcb-secure-verify.top/login`, wait 60 s, open the popup.
- **Fixed when:** `node verify-extension-fixes.mjs --browser` → `PASS #22`.

### 7. Scanning a fake-bank site turns "High risk" into "Scan incomplete" (high)

On a fake bank site the popup says High risk. Clicking Scan This Page (the
page can't be read, which is normal for a dead fake site) switches it to
grey "Scan incomplete"; the badge stays red.

- **See it:** `https://mcb-secure-verify.top/login` → popup → Scan This Page.
- **Look at:** `renderScanInconclusive()` in `extension/popup.js`.
- **Fixed when:** by hand, the popup still shows High risk after the scan
  and the error appears only in the scan panel. (No script check yet.)

### 11. Warning banner on a page the extension calls Safe (medium)

- **See it:** `http://localhost:5500/safe.html` → Scan This Page → SAFE plus an amber banner.
- **Look at:** banner rule in `extension/background.js` (it reads a tag that word-list matches also carry).
- **Fixed when:** `verify-extension-fixes.mjs --browser` → `PASS #21`.

### 12. Switching tabs uses up the link-check limit (medium)

Every tab switch re-checks the tab; 60 switches used 60 of the 120 checks
per 15 minutes. After that, a real fake-bank site gets a grey × instead of
a warning.

- **Look at:** `onActivated` in `extension/background.js`, `extension/tab-state.js`.
- **Fixed when:** `verify-extension-fixes.mjs --browser` → `PASS #23`.

### 13. Short links and raw-IP links show a green tick (medium)

`bit.ly/…` and `http://192.168.1.1/login` get no warning while browsing:
`/api/check-url` runs `checkUrls()` but not `checkLinkHygiene()`.

- **See it:** `POST /api/check-url {"url":"https://bit.ly/mcbhelp"}` → `signals: []`.
- **Fixed when:** `verify-extension-fixes.mjs` → `PASS #24`.

### 14. The extension never shows how often a site was reported (medium)

After reporting, it says "reported 7 time(s)", but after a reload the popup
never mentions reports: `/api/check-url` returns no count.

- **Look at:** `/api/check-url` in `backend/src/routes/index.js`; `renderTabStatus()` in `extension/popup.js`.
- **Fixed when:** `verify-extension-fixes.mjs` → `PASS #25`.

### 15. Text typed into rich text boxes is sent when scanning (medium)

Scan This Page reads the page's visible text, which includes what the person
typed into rich text editors. The README promises typed text is never read.
Passwords and normal text boxes are not sent.

- **See it:** `http://localhost:5500/privacy.html`, type `CANARY-TYPED` in
  the rich text box, Scan This Page; the "Open full analysis" link contains it.
- **Look at:** `extension/content.js` (`document.body.innerText`).
- **Fixed when:** `verify-extension-fixes.mjs --browser` → `PASS #28`.

---

## What works

Checked in a real browser on `04ae58f`:

- **Layouts:** side menu at laptop width (current screen highlighted), tab
  bar at phone width, no sideways scrolling on any screen at 360 px.
- **Check flow:** paste, the empty-box and too-long limits, progress,
  Cancel (text kept), `?scan=` links from the extension.
- **Result screen:** verdict and score, What's wrong, The link, clickable
  highlights that jump to their reason, AI and rule reasons shown apart,
  What to do now, Simple mode (with Read this aloud), the safety card (no
  phone numbers in the copied text), "What was sent" with numbers replaced.
- **Safe messages:** "Looks genuine", What we checked, no report button.
- **Languages:** EN/FR/KREOL remembered; explanations in the chosen
  language; a mixed Kreol/English/French scam caught.
- **Dark theme:** kept after reload, no white flash.
- **Screenshot upload:** text read into the box in ~10 s, not checked until
  you press Check; clear errors for a blank image and a non-image file.
- **Batch, Before You Pay, Replay, Conversation, Sandbox (also with the AI
  off), Radar, Network, Learn, 404:** all work.
- **When things go wrong:** backend down → "Can't reach FraudLens", text
  kept, Try again works; AI off → a rules-only verdict in under 3 s.
- **Install/offline (production build):** manifest, service worker, `/` and
  `/learn` open offline, an offline check says "Can't reach FraudLens".
- **Frontend checks:** `npm test` 85/85, `npm run typecheck`, `npm run build` pass.

## Not tested yet

- Installing the app on an Android phone and an iPhone, and a
  phone-camera screenshot: no phone available to QA this round.
- Clipboard paste in a normal (non-test) Chrome, and hearing Read aloud
  out loud: the automated browser has no voices.
- The extension after `04ae58f` (findings 4–7, 11–15 and parts of 16, 17, 20, 21).

## How to check a fix

Run from `data/test-payloads/` with Node 22+ and Git Bash on Windows.
One-time: `npm install --no-save puppeteer`.

1. **Backend:** `AI_URL=http://<tailnet-ollama-host>:11434 sh restart-backend.sh`
   starts it on :4000 with the AI host and resets its limits (it doesn't touch
   `backend/.env`). The script has no default host: set `AI_URL`, or export
   `OLLAMA_URL`, to the team's tailnet Ollama host (see `backend/README.md`
   Local LLM Setup). The two scripts below call it too, so export
   `OLLAMA_URL` in the shell you run them from.
2. **Web app:** in `frontend/`, `BACKEND_URL=http://localhost:4000 npm run dev`
   (PowerShell: `$env:BACKEND_URL="http://localhost:4000"; npm run dev`).
3. Then:
   - `node webapp-payloads.mjs [--only EN-01,KR-21]`: every test message
     through the web app's route, compared with `expected.verdict`.
   - `node webapp-ui.mjs [--only result,ratelimit]`: the browser checks in
     `WEBAPP-CHECKLIST.md`. Sections: layout, home, cancel, scan, result,
     seed, safe, mixed, languages, theme, screenshot, batch, safepay,
     conversation, sandbox, radar, learn, notfound, reportlimit, ratelimit,
     backenddown, aidown. `--pwa` checks the production build on :3002.
   - `node verify-extension-fixes.mjs [--browser]`: the extension checks
     (`EXTENSION-FIX-CHECKS.md`).

Output and screenshots go to `results/` (git-ignored). The scripts restart
the backend themselves, so don't use it for anything else while they run.
