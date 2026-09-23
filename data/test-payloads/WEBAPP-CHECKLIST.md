# Web app: test checklist

Owner: **Caellum**. Written 2026-09-23 for round 2 against `caellum` @ `878da43`
(main merged in). The UI owner's newer screens on the `oleg` branch aren't
covered here.

Tick each box as you go. **Expect** is what should happen. Items marked
**(auto)** are covered by `results/webapp-ui.mjs` (git-ignored, see the end of
this file), so you only need to do them by hand if the script can't run.
Round 2 results: `results/webapp-round2.md`.

**Round 2 is only half done.** Not every (auto) item has run yet. Before
you continue, check the web app UI changes merged since `878da43` against
this list.

---

## 0. Setup (about 5 minutes)

1. **Backend.** `backend/.env` points the AI at `localhost`, so override it:
   ```
   cd backend
   $env:OLLAMA_URL="http://100.115.195.94:11434"; npm start
   ```
   Open http://localhost:4000/health/llm. Expect `"reachable":true`.
2. **Web app.** `frontend/.env` sends requests to the shared VPS backend.
   Point it at yours:
   ```
   cd frontend
   $env:BACKEND_URL="http://localhost:4000"; npm run dev
   ```
   Open http://localhost:3000.
3. For the install/offline checks (section 10) you need a production build,
   because the offline helper only runs there:
   ```
   cd frontend
   $env:BACKEND_URL="http://localhost:4000"; npm run build; npx next start -p 3002
   ```

**Watch the limits.** The backend counts requests per computer:
- 20 checks per 15 minutes (typed checks, screenshots, Before You Pay and
  each Conversation message all share this).
- 10 batch scans per 15 minutes.
- 5 reports per hour.

Restart the backend to reset them.

**Test messages.** Use the ones in `en.json`, `fr.json` and `kr.json`
(each has an `expected.verdict`). Good ones for the demo are listed in
`results/webapp-round2.md`.

---

## 1. Check a message (the main flow)

On the home screen (the **Check** tab):

- [ ] (auto) The screen shows a greeting, "Is this a scam?", and two buttons:
      **Paste & check** and **Check a screenshot**.
- [ ] Copy `EN-01` from `en.json`, click **Paste & check**. Expect: a box opens
      with the text in it (Chrome may ask to allow the clipboard). It is
      **not** checked yet.
- [ ] (auto) If the clipboard is empty or blocked, the box still opens with
      "Nothing to paste yet. Type the message, or paste it in."
- [ ] (auto) Click **Check this message**. Expect: the dark area becomes a
      progress bar with changing text, and a **Cancel** link.
- [ ] (auto) Within about 30 s you land on the result screen.
- [ ] Click **Cancel** during a check. Expect: back to the box, text kept.

## 2. The result screen

For a **scam** or **suspicious** message:

- [ ] (auto) Big coloured verdict at the top (red Scam / amber Suspicious),
      with a score out of 100.
- [ ] (auto) **What's wrong** lists short reasons; **The link** card names the
      link and the real site it copies (when there's a link).
- [ ] (auto) The message is shown with the suspicious words highlighted.
      Clicking a highlight jumps to its reason.
- [ ] **Why we think so** (collapsed) opens to one card per reason, each
      with a severity and a quote from the message. Reasons from the AI are
      labelled as such.
- [ ] (auto) **What to do** gives concrete steps (e.g. don't open the link,
      call the bank on its official number).
- [ ] (auto) **Simple mode** button: switches to a big, plain summary. If your
      browser supports it, **Read aloud** speaks it. Turning it off brings back
      the detailed view, and the choice is remembered next time.
- [ ] (auto) **Safety card**: a short summary with a **Share** or **Copy**
      button. The copied text has no phone numbers or account numbers.
- [ ] (auto) **What was sent for analysis** (bottom, collapsed) shows the
      message with phone numbers, emails and account numbers replaced by
      placeholders, and which AI answered (or that none did).
- [ ] **Check another message** goes back home.

For a **safe** message (e.g. `EN-15`):

- [ ] (auto) Green verdict, a short list of what was checked, no report
      button, no scary wording.

## 3. Languages

- [ ] (auto) **Settings → Language**: EN, FR, KREOL. Changing it changes every
      screen straight away and is remembered after a reload.
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

- [ ] (auto) Click **Check a screenshot**, pick a clear PNG/JPG of a scam SMS.
      Expect: a thumbnail, "reading" progress, then the text appears in the
      box for you to fix. It is **not** checked until you click the button.
- [ ] (auto) The privacy note changes to say the image itself is sent.
- [ ] (auto) A picture with no text: "We couldn't find any readable text".
- [ ] (auto) A non-image file renamed `.png`: a clear error, no crash.
- [ ] A photo from a phone camera (large file): still works (it's shrunk in
      the browser first).
- [ ] **Remove** and **Type instead** clear the screenshot.

## 5. Batch scan

Open **Radar** (tab bar) → **Tools → Batch scan**, or go to `/batch`.

- [ ] (auto) Paste 3–5 messages separated by blank lines. The counter shows
      `n / 50`.
- [ ] (auto) **Scan messages**. Expect: totals (Messages / Safe / Suspicious /
      Scam) and one row per message with its verdict and main reason.
- [ ] (auto) 51 messages: "You can scan up to 50 messages at a time", button off.
- [ ] (auto) A message over 5,000 characters: warning, button off.
- [ ] If some messages share a claimed bank, **Possible campaigns** groups
      them and links to the network view.

## 6. Report the sender

- [ ] (auto) On a scam result with a phone number or sender name, click
      **Report sender**. Expect: "Reported … N times" (N goes up each time
      you report the same sender from a new check).
- [ ] (auto) With no sender, the button opens a small box to type who sent it.
- [ ] After 5 reports in an hour: a clear "try later" message, no crash.

## 7. Opened from the browser extension (`?scan=`)

- [ ] (auto) Open `http://localhost:3000/?scan=Your%20MCB%20account%20is%20blocked`.
      Expect: the box opens with that text, **not** checked yet, and the
      address bar goes back to `/`.
- [ ] (auto) A `?scan=` text over 5,000 characters is cut to 5,000.
- [ ] With the extension loaded: **Scan This Page → Open in FraudLens** lands
      here with the page text.

## 8. Other screens

- [ ] (auto) **About to pay someone?** (home) → Before You Pay form. Fill who
      asked, the recipient and the amount, check. Expect a verdict and, if the
      recipient was reported before, "reported N times".
- [ ] (auto) **Replay** (from a result's action bar): the same result told as a
      story. Opening `/replay` with no check first shows a clear empty state.
- [ ] (auto) **Conversation** (`/conversation`): add 3 messages one at a time
      (friendly intro, then urgency, then an OTP request). Each gets a
      verdict; the side panel shows the furthest scam stage reached.
- [ ] (auto) **Sandbox** (`/sandbox`): pick a scenario, step through it.
      Every message is labelled as a simulation. Works even if the AI is off.
- [ ] (auto) **Radar** (`/trends`): the example scam list, then real numbers
      (or an honest "not enough activity yet" when the database is empty).
- [ ] (auto) **Network** (link from a result or Radar): a graph of senders and
      links for one pattern, plus a text list. An unknown id shows "not found".
- [ ] (auto) **Learn**: the quiz loads, answers give feedback, the streak counts.
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
- [ ] On an Android phone (Chrome): the home screen shows **Add to Home
      Screen**; **Not now** hides it for good.
- [ ] On an iPhone (Safari): the card shows the Share → Add to Home Screen
      steps instead of a button.

## 11. Phone-size screen

- [ ] (auto) At 360 px wide, no page scrolls sideways (home, result, batch,
      before-you-pay, conversation, sandbox, radar, learn, settings).
- [ ] (auto) The tab bar stays at the bottom and doesn't cover the last button.
- [ ] On a real phone: the keyboard doesn't hide the **Check** button.

## 12. When things go wrong

- [ ] (auto) **Empty box**: the **Check** button is greyed out.
- [ ] (auto) **Too long**: at 4,500+ characters a counter appears; at 5,001 it
      turns red, says "Too long to check", and the button is greyed out.
- [ ] (auto) **Backend down** (stop it, then check): "Can't reach FraudLens",
      your text is kept, **Try again** works once it's back.
- [ ] (auto) **AI down** (backend started with a dead AI address): the check
      still gives a verdict from the fixed rules, and "What was sent" says the
      AI didn't answer. No error screen.
- [ ] (auto) **Limit hit** (21st check in 15 min): a message that says to wait,
      text kept.
- [ ] (auto) **No console errors** on any screen in the normal flow.

---

## The script

`results/webapp-ui.mjs` (git-ignored, like the extension's
`explore-round2.mjs`) drives a real Chrome through the items marked (auto).
It restarts the backend itself to reset limits.

```
cd data/test-payloads
node results/webapp-ui.mjs
```

`results/webapp-payloads.mjs` runs every `en/fr/kr` message once through
the web app's route (with the same in-browser redaction) and compares it with
`expected.verdict` and the round-1 baseline.
