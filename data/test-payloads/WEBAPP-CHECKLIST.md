# Web app: test checklist

Owner: **QA owner**. Updated 2026-09-23 for round 2 against `04ae58f`
(PR #12 merged: the UI owner's desktop layout with the side menu). Two
commits that were then still unmerged on the frontend/UI owner's branch
("Secondary screens", "iPhone pass") are not covered.

Tick each box as you go. **Expect** is what should happen. Items marked
**(auto)** are covered by `webapp-ui.mjs` (see the end of this file), so you
only need to do them by hand if the script can't run. Round 2 findings:
[`ROUND2-FINDINGS.md`](./ROUND2-FINDINGS.md).

**Two layouts.** At 1024 px wide and up (a laptop) the app shows a **side
menu** on the left and no bottom tab bar. Below that (a phone) there is no
side menu, and the floating **tab bar** at the bottom is the navigation. Test
both: the script uses 1280 px and 360 px.

---

## 0. Setup (about 5 minutes)

1. **Backend.** `backend/.env` points the AI at `localhost`, so override it
   (the AI runs on the team's tailnet Ollama host, see `backend/README.md`
   Local LLM Setup; run `tailscale status` first, hosts move). Either run
   `AI_URL=http://<tailnet-ollama-host>:11434 sh data/test-payloads/restart-backend.sh`
   in Git Bash, or:
   ```
   cd backend
   $env:OLLAMA_URL="http://<tailnet-ollama-host>:11434"; npm start
   ```
   Open http://localhost:4000/health/llm. Expect `"reachable":true`.
2. **Web app.** `frontend/.env` sends requests to the shared VPS backend.
   Point it at yours:
   ```
   cd frontend
   $env:BACKEND_URL="http://localhost:4000"; npm run dev
   ```
   Open http://localhost:3000. To be sure it uses your backend, compare
   http://localhost:3000/api/trends with http://localhost:4000/api/trends.
3. For the install/offline checks (section 10) you need a production build,
   because the offline helper only runs there. Stop `npm run dev` first:
   ```
   cd frontend
   $env:BACKEND_URL="http://localhost:4000"; npm run build; npx next start -p 3002
   ```

**Watch the limits.** The backend counts requests per computer:
- 20 checks per 15 minutes (typed checks, screenshots, Before You Pay and
  each Conversation message all share this).
- 10 batch scans per 15 minutes.
- 5 reports per hour.

Restart the backend to reset them. Known (round 2): everyone using the
same web app server shares these limits, so testing from a phone and the
PC at once uses the same 20.

**Test messages.** Use the ones in `en.json`, `fr.json` and `kr.json`
(each has an `expected.verdict`). Good ones for the demo are listed in
`ROUND2-FINDINGS.md` ("Before the demo").

---

## 1. Check a message (the main flow)

On the **Check** screen:

- [ ] (auto) A greeting, "Is this a scam?", a **Paste & check** button and a
      small camera button (**Check a screenshot**).
- [ ] (auto) **Laptop:** the message box is already open under the buttons.
      **Phone:** the box opens when you tap **Paste & check**.
- [ ] Copy `EN-01` from `en.json`, click **Paste & check**. Expect: the text
      goes into the box (Chrome may ask to allow the clipboard). It is **not**
      checked yet.
- [ ] (auto) If the clipboard is empty or blocked: "Nothing to paste yet.
      Type the message, or paste it in."
- [ ] (auto) Click **Check this message**. Expect: the dark area becomes a
      progress bar with changing text, and a **Cancel** link.
- [ ] (auto) Within about 30 s you land on the result screen.
- [ ] (auto) Click **Cancel** during a check. Expect: back to the box, text kept.

## 2. The result screen

On a laptop the verdict runs across the top, the message is on the left and
the evidence is on the right. On a phone it's one column.

For a **scam** or **suspicious** message:

- [ ] (auto) Big coloured verdict at the top ("Likely a scam" / "Be
      careful"), with a score out of 100 and "Warning signs N found".
- [ ] (auto) **What's wrong** lists short reasons; **The link** names the link
      and the real site it copies (when there's a link).
- [ ] (auto) **The message you sent** has the suspicious words underlined.
      Clicking one jumps to its reason.
- [ ] (auto) **Why this looks wrong** opens to one card per reason, each with
      a severity. Reasons from the AI are under "AI analysis".
- [ ] (auto) **What to do now** gives concrete steps (e.g. don't open the
      link, call the bank on the number on your card).
- [ ] (auto) **Simple mode** switches to a big, plain summary. If your
      browser supports it, **Read aloud** speaks it. **Show full details**
      brings the detailed view back.
- [ ] (auto) **Help me explain this** opens a short safety card with a
      **Share** or **Copy text** button. The copied text has no phone numbers
      or account numbers.
- [ ] (auto) **What was sent for analysis** (bottom, collapsed) shows the
      message with phone numbers, emails and account numbers replaced by
      placeholders, and which AI answered (or that none did).
- [ ] (auto) **Check another message** goes back to Check.

For a **safe** message (e.g. `EN-15`):

- [ ] (auto) Green "Looks genuine", **What we checked**, no report button, no
      scary wording.

## 3. Languages

- [ ] (auto) **Settings → Language**: EN, FR, KREOL. Changing it changes every
      screen (and the side menu) straight away and is remembered after a
      reload.
- [ ] (auto) The explanation on the result screen is in the chosen language.
- [ ] (auto) French and Kreol messages (e.g. `FR-01`, `KR-01`) are checked
      correctly with the UI in any language.
- [ ] (auto) **Mixed language**: paste
      `Ou kont MCB pou bloke azordi. Please verify now: https://mcb-secure.top/verify. Merci de confirmer votre code OTP.`
      Expect: Scam, with the fake link named.
- [ ] Known: in Kreol, many screens still show English text on purpose (the
      Kreol wording hasn't been reviewed yet). Note anything that looks
      broken, not just English.

## 4. Screenshot upload

- [ ] (auto) Click the camera button, pick a clear PNG of a scam SMS.
      Expect: a thumbnail, "Reading the screenshot…", then the text appears in
      the box for you to fix. It is **not** checked until you click the button.
- [ ] (auto) The privacy note changes to say the image itself is sent.
- [ ] (auto) A picture with no text: "We couldn't find any readable text".
- [ ] (auto) A non-image file renamed `.png`: a clear error, no crash.
- [ ] A photo from a phone camera (large file): still works (it's shrunk in
      the browser first).
- [ ] (auto) **Remove screenshot** clears it. After a failed read,
      **Type it instead** clears the screenshot and the error.

## 5. Batch scan

Laptop: side menu → **Tools → Batch scan**. Phone: **Radar** tab → **Tools →
Batch scan**. Or go to `/batch`.

- [ ] (auto) Paste 3–5 messages separated by blank lines. The counter shows
      `n / 50`.
- [ ] (auto) **Scan messages**. Expect: totals (Messages / Safe / Suspicious /
      Scam) and one row per message with its verdict and main reason.
- [ ] (auto) 51 messages: "You can scan up to 50 messages at a time", button off.
- [ ] (auto) A message over 5,000 characters: warning, button off.
- [ ] If some messages share a claimed bank, **Possible campaigns** groups
      them and links to the network view.

## 6. Report the sender

- [ ] (auto) On a scam result, **Report this sender** (known sender) or
      **Report this message** (asks who sent it). Expect: "Reported. …".
- [ ] (auto) The sender reported is the one who sent the message, never the
      bank the message pretends to be.
- [ ] (auto) After 5 reports in an hour: a clear "try later" message, no crash.

## 7. Opened from the browser extension (`?scan=`)

- [ ] (auto) Open `http://localhost:3000/?scan=Your%20MCB%20account%20is%20blocked`.
      Expect: the box opens with that text, **not** checked yet, and the
      address bar goes back to `/`.
- [ ] (auto) A `?scan=` text over 5,000 characters is cut to 5,000.
- [ ] With the extension loaded: **Scan This Page → Open in FraudLens** lands
      here with the page text.

## 8. Other screens

Laptop: all of these are in the side menu (Tools). Phone: through the Check
screen ("About to pay someone?") and the Radar tab's Tools.

- [ ] (auto) **I'm about to pay** (`/safepay`): fill who's asking, how they
      contacted you, who you're paying and the amount, then **Check before I
      pay**. Expect a verdict and, if the recipient was reported before,
      "This recipient has been reported N times".
- [ ] (auto) **See how this scam works** (Replay, from a scam result): the
      same result told as a story. `/replay` with no check first shows "No
      check to show".
- [ ] (auto) **Conversation** (`/conversation`): add 3 messages one at a time
      with **Analyze message** (friendly intro, then urgency, then an OTP
      request). Each gets a verdict; **Furthest stage detected** moves on.
- [ ] (auto) **Sandbox** (`/sandbox`): pick a scenario, **Start simulation**,
      step through it. Every message is labelled as a simulation. Works even
      if the AI is off.
- [ ] (auto) **Radar** (`/trends`): the example scam list, then real numbers
      (or an honest "not enough activity yet" when the database is empty).
- [ ] (auto) **View fraud network** (from a result): a graph of senders and
      links for one pattern, plus a text list. An unknown id shows "not found".
- [ ] (auto) **Learn**: the quiz loads, **Scam** / **Genuine** give feedback,
      "Today N of 5" counts up.
- [ ] (auto) A made-up address like `/nope` shows the FraudLens 404 page.

## 9. Settings and theme

- [ ] (auto) **Settings → Appearance**: System / Light / Dark. Dark turns the
      whole app dark straight away and stays dark after a reload, with no
      white flash.
- [ ] (auto) Text is readable in both themes on the result screen.

## 10. Install as an app (production build only, port 3002)

- [ ] (auto) The app manifest loads (name "FraudLens AI", icons).
- [ ] (auto) The offline helper (service worker) registers.
- [ ] (auto) With the network off, `/` and `/learn` still open. A check shows
      "Can't reach FraudLens", not a blank page.
- [ ] In Chrome desktop, the address bar shows an install icon; installing
      opens FraudLens in its own window.
- [ ] On an Android phone (Chrome): the Check screen shows an install card;
      **Not now** hides it for good.
- [ ] On an iPhone (Safari): the card shows the Share → Add to Home Screen
      steps instead of a button.

## 11. Screen sizes

- [ ] (auto) At 1280 px: side menu on the left, no bottom tab bar, the
      current screen is highlighted in the menu.
- [ ] (auto) At 360 px: no side menu, tab bar at the bottom, and no page
      scrolls sideways (check, result, batch, before-you-pay, conversation,
      sandbox, radar, learn, settings, replay).
- [ ] (auto) The tab bar doesn't cover the last button on a page.
- [ ] On a real phone: the keyboard doesn't hide the **Check** button.

## 12. When things go wrong

- [ ] (auto) **Empty box**: the **Check** button is greyed out.
- [ ] (auto) **Too long**: at 4,500+ characters a counter appears; at 5,001 it
      turns red, says "Too long to check", and the button is greyed out.
- [ ] (auto) **Backend down** (stop it, then check): "Can't reach FraudLens",
      your text is kept, **Try again** works once it's back.
- [ ] (auto) **AI down** (backend started with a dead AI address, local
      only): the check still gives a verdict from the fixed rules, and "What
      was sent" says no AI answered. No error screen.
- [ ] (auto) **Ollama down, hosted backup allowed**: the check still works and
      "What was sent" names the backup AI.
- [ ] (auto) **Limit hit** (21st check in 15 min): a message that says to wait,
      text kept.
- [ ] (auto) **No console errors** on any screen in the normal flow.

---

## The script

`webapp-ui.mjs` drives a real Chrome through the items marked (auto). It
restarts the backend itself to reset limits, with `restart-backend.sh`
(kills whatever listens on :4000, starts the backend with the AI host, and
lets `AI_URL` / `AI_MODE` override it for the "AI down" tests; needs Git
Bash on Windows). The restart script has no default AI host, so export
`OLLAMA_URL` (the team's tailnet Ollama host, see `backend/README.md` Local
LLM Setup) in the shell you run `webapp-ui.mjs` from. One-time setup:
`npm install --no-save puppeteer`.

```
cd data/test-payloads
node webapp-ui.mjs                  # dev server on :3000
node webapp-ui.mjs --only result    # one section (names in ROUND2-FINDINGS.md)
node webapp-ui.mjs --pwa            # production build on :3002 (section 10)
```

Output and screenshots go to `results/` (git-ignored).

`webapp-payloads.mjs` runs every `en/fr/kr` message once through
the web app's route (with the same in-browser redaction) and compares it with
`expected.verdict` and the round-1 baseline.
