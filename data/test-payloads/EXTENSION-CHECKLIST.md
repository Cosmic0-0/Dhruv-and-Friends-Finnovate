# Browser extension: test checklist

Owner: **Caellum**. Written 2026-09-23 against `main` @ `94781c2` (extension v0.3.0). Updated for round 2 against `caellum` @ `878da43`.
Problems found in round 1 are findings #19–#30 (`git show 8fa64d8:data/test-payloads/FINDINGS.md`, section "Extension test"), all but #27 confirmed in Chrome.

Tick each box as you go. **Expect** is what should happen. **Known issue**
means it's already logged, so don't log it again.

---

## 0. Setup (about 5 minutes)

Use four terminals.

1. **Backend.** `backend/.env` still points the AI at `localhost`, so override it
   when you start (this doesn't edit the file):
   ```
   cd backend
   $env:OLLAMA_URL="http://100.91.27.102:11434"; npm start
   ```
   Check it: open http://localhost:4000/health/llm. You should see `"reachable":true`.
   If `npm start` says `Cannot find package 'sharp'`, run `npm install` first.
   (`npm ci` fails while any other backend is running, because Windows locks
   the database driver file.)
2. **Web app.** `frontend/.env` sends the web app's requests to the shared VPS
   backend, not your local one. Point it at yours so both use the same data:
   ```
   cd frontend
   $env:BACKEND_URL="http://localhost:4000"; npm run dev
   ```
3. **Test pages.** `node data/test-payloads/extension-pages/serve.mjs`, then open
   http://localhost:5500.
4. **Extension.** In Chrome, go to `chrome://extensions`, turn on **Developer
   mode** (top right), click **Load unpacked**, and pick the `extension/` folder.
   Pin the FraudLens icon to the toolbar with the puzzle-piece menu.

- [ ] The extension loads with no red "Errors" button on its card.
- [ ] **Details → Site access** lists only `localhost:4000`.

**Watch the limits.** The backend counts requests per computer:
- 120 link checks per 15 minutes. Every page load and every tab switch uses one.
- 20 page scans or right-click text checks per 15 minutes.
- 5 reports per hour.

If a result suddenly says "too many…" or "backend returned 429", you've hit a
limit. Restart the backend to reset it (see #23).

**To see what the extension sends:** on `chrome://extensions`, click the
**service worker** link on the FraudLens card. That opens DevTools. Use the
**Network** tab and click a request, then **Payload**. Close that window when
you're not using it: while it's open, Chrome never puts the extension to sleep,
and that hides #22.

---

## 1. Badge while browsing

The small mark on the toolbar icon. It's set automatically on every page.

| Visit | Expect |
|---|---|
| https://www.google.com, https://en.wikipedia.org/wiki/Mauritius | ✓ blue |
| https://mcb.mu, https://www.sbmgroup.mu, https://www.absa.mu, https://www.emtel.com | ✓ blue |
| `https://mcb-secure-verify.top/login` (type it; the page won't load, which is fine) | **!** red |
| `https://sbmgrop.mu/login`, `https://secure-absa.mu/verify` | **!** red |
| https://en.wikipedia.org/wiki/MCB_Group | ✓ expected. **Known issue #19:** shows red |
| `https://track-parcel-mu.top/`, `https://bit.ly/mcbhelp` | ✓. **Known issue #24:** not caught |
| `chrome://extensions`, `file:///C:/`, a new tab | No badge |

- [ ] Each row above behaves as expected (apart from the known issues).
- [ ] You never see an amber **?** while browsing. That's expected: see #24.
- [ ] **Backend down:** stop the backend (Ctrl+C) and reload a page. The badge
      shows a grey **×**, the page still loads normally, and the popup says
      "Backend unreachable: Failed to fetch. Browsing was not blocked."
      Start the backend again and reload: the badge comes back.
- [ ] **Stopped mid-use:** click **Scan This Page**, then stop the backend
      straight away. You should get an error message in the popup, not a
      spinner that never ends.

## 2. Popup

Click the toolbar icon.

- [ ] It shows the site name, a coloured label that matches the badge, a line
      of text explaining it, "Automatic domain check" (renamed from "Strongest evidence" in round 2), four action buttons, "Recent
      checks" and the privacy line at the bottom.
- [ ] Nothing overflows or gets cut off at the sides.
- [ ] On a red site, "Automatic domain check" names the fake domain and the real one.
- [ ] **Goes to sleep (#22):** visit `https://mcb-secure-verify.top/login`, wait
      a full minute without touching Chrome, then open the popup. Expected: it
      still says High risk. Known issue: it says "Not checked yet — reload
      the page" while the badge still shows red.

## 3. Scan This Page and the warning banner

Use the pages at http://localhost:5500. Scanning takes 2–10 seconds. Keep
the popup open while it runs, because clicking the page closes the popup and
you lose the result.

| Page | Expect |
|---|---|
| `scam.html` | SCAM or SUSPICIOUS, and a red or amber banner across the top of the page |
| `safe.html` | SAFE, no banner. **Known issue #21:** SAFE, but an amber banner still appears ("will be closed" counts as a threat) |
| `bank-advice.html` | SAFE, no banner. **Known issue #20:** says SCAM and shows a red banner |
| `fr-kr.html` | SCAM (French and Kreol scam messages only) |
| `bank-advice-fr.html` | SAFE, no banner (the bank advice page in French and Kreol; checks #20 outside English) |
| `empty.html` | "Scan incomplete — could not read this page", grey. Never SAFE |

- [ ] Each page gives the expected result (apart from the known issue).
- [ ] The banner's **Dismiss** button removes it, and the page underneath still works.
- [ ] Scanning twice in a row gives one banner, not two stacked.
- [ ] Nothing is scanned until you click. Load a page, open the service-worker
      DevTools (see Setup), and check that no `analyze` request appears until
      you press the button.
- [ ] **Kreol/French:** Scanning `scam.html` (which has Kreol messages) returns a
      verdict, not an error. Try a real French news site too. Expected: a
      sensible verdict. Many sites that write *about* scams come back SCAM (#20).
- [ ] **Very long page:** scan `long.html`. The popup says the text was cut to
      4000 characters. The scam sentence is at the very bottom, so it's
      **not** caught. That's expected given the cut-off, but worth knowing.
- [ ] **chrome:// and file:// pages:** on `chrome://extensions`, Scan This Page
      shows an error ("Cannot access a chrome:// URL"), not a crash. On a
      `file://` page it errors too unless you've turned on "Allow access to
      file URLs" in the extension's Details.

## 4. Privacy: nothing typed into a form is sent

On http://localhost:5500/privacy.html:

1. Type `CANARY-TYPED` into the rich text box at the bottom, and anything into
   the password box.
2. Open the service-worker DevTools → Network, then click **Scan This Page**.
3. Click the `analyze` request → Payload.

- [ ] The payload contains the "URGENT: Your MCB account…" text.
- [ ] It does **not** contain `CANARY-USERNAME`, `CANARY-PASSWORD`,
      `CANARY-HIDDEN` or `CANARY-TEXTAREA`.
- [ ] `CANARY-TYPED` (the rich text box). Expected: not sent, since the README
      promises typed text is never read. **Known issue #28:** it is
      sent.

## 5. Right-click checks

On `scam.html`:

- [ ] Select the EN-01 sentence, right-click → **Check selected text with
      FraudLens**. After a few seconds, a small window opens with a verdict and
      signals. (Nothing shows while you wait: #27.)
- [ ] Same with the KR-11 (Kreol) sentence. You get a verdict, not an error.
- [ ] Right-click the fake `mcb-secure-verify.top` link → **Check link with
      FraudLens**. The window says High risk, and the page does **not** go to
      that link.
- [ ] Right-click the real `mcb.mu` link. It says safe.
- [ ] With the backend stopped, try both again. The window shows "Backend
      unreachable", and nothing hangs.

## 6. Report this site

Only 5 reports per hour, so plan them.

- [ ] On `https://mcb-secure-verify.top/login`, click **Report this site**. The
      popup says "Reported. mcb-secure-verify.top has been reported N time(s)."
- [ ] Click again. N goes up by 1.
- [ ] Reload the page and reopen the popup. Nothing says it was reported.
      That's known issue #25.
- [ ] On a new tab page, click **Report this site**. Expected: the button is
      disabled or explains it can't report this page. **Known issue #26:** it
      reports "newtab" as a scam site. (This uses one of your 5.)

## 7. Recent checks

- [ ] After a scan, a right-click text check and a right-click link check, each
      one shows in "Recent checks" with a coloured dot and "just now".
- [ ] Plain browsing (the automatic badge check) does **not** add entries.
      That's by design.
- [ ] Only the 10 newest are shown, although 15 are stored.
- [ ] No message text appears in the list, only site names.

## 8. Open in FraudLens

- [ ] After a scan of `scam.html`, click **Open full analysis in FraudLens**. The
      web app opens at localhost:3000 with the text box already filled with the
      page's text (up to 400 characters). It doesn't run the check by itself;
      you press the button. The README says the box stays empty; that's out of
      date (#29).
- [ ] From the right-click text window, the link fills in the text you selected.
- [ ] Before any scan, the link just opens the home page.

## 9. Security Report

The README marks this Done but says it was never run in a real browser.
**Caution:** it makes the backend request paths like `/.env`, `/.git/HEAD` and
`/wp-admin/` from the site you're on. Only run it on sites you're allowed to
probe: the test pages, `https://example.com`, or a site the team owns. **Don't
run it on a real bank's site.** The limit is 15 per 15 minutes.

- [ ] On https://example.com: a grade (A–F) and a list of findings appear
      within about 10 seconds, worst first.
- [ ] On `http://localhost:5500/scam.html`: the popup shows "url host is not a
      public hostname" (it refuses local addresses), not a hang.
- [ ] On `chrome://extensions`: "This page can't be scanned".

## 10. Fast tab switching

- [ ] Open 6 tabs: 3 real sites and 3 fake ones from section 1. Switch between
      them quickly for 30 seconds. Every tab should end up with its own
      correct badge. If a real site ever shows red (or a fake one blue), note
      which ones. That would be a result from one page showing up on another.
- [ ] Keep going for a few minutes. At about 120 switches, every badge turns
      grey **×** with "backend returned 429". That's known issue #23.
