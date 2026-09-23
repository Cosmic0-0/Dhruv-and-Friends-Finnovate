# Extension fixes: how to check them before handing back to QA

For the **backend/extension owner**. This covers findings #19–#30 from the
extension test on 2026-09-23. The full write-ups with evidence are in git
history: `git show 8fa64d8:data/test-payloads/FINDINGS.md` (section
"Extension test"). `FINDINGS.md` itself was retired on `main`.

Run `verify-extension-fixes.mjs` on your branch. When everything you meant to
fix shows **PASS** (and the `guard` lines still pass), send it to QA. Anything
you've chosen not to fix, say so in the PR so QA doesn't re-test it.

The script only checks outcomes. It doesn't care *how* you fix something.

## Run it

```
# 1. Backend (the AI URL override is needed while backend/.env says localhost)
cd backend
$env:OLLAMA_URL="http://100.115.195.94:11434"; npm start

# 2. API checks (#19, #20, #24, #25, #29), about 30 seconds
cd data/test-payloads
node verify-extension-fixes.mjs

# 3. Browser checks: loads the real extension/ folder into a separate test
#    Chrome and clicks through it (#20-23, #26, #28, #30), about 3 minutes.
#    One-time setup:
npm install --no-save puppeteer
npx puppeteer browsers install chrome
#    then:
node verify-extension-fixes.mjs --browser
```

A Chrome window will open and close by itself. Don't click in it while it
runs. The test pages (`extension-pages/`) are served automatically on port 5500.

**Restart the backend before each full run.** One run uses about 90 of the
120 link checks, 6 of the 20 analyses and 2 of the 5 reports the backend
allows per window, and those limits only reset on restart. If a limit runs
out, the affected check says **SKIP** (or the script stops and says so),
never a false PASS.

| Result | Meaning |
|---|---|
| PASS | Fixed |
| FAIL | Still broken, or the fix broke a `guard` |
| SKIP | Couldn't be measured this run (usually a limit). Restart and rerun |
| MANUAL | Can't be scripted; see below |

**Baseline on `main` @ `94781c2` (unfixed):** 11 FAIL, 1 MANUAL. The only
passes are the 3 guards and #30 (which passes by luck, see the table).

## What "fixed" means for each finding

| # | Problem | Where it lives | Counts as fixed when | Checked by |
|---|---|---|---|---|
| guard | Real fake-bank sites must stay red | `domain-matching` | 6 known lookalikes (`mcb-secure-verify.top`, `sbmgrop.mu`, punycode, `@` trick…) still return a `high` signal | API |
| guard | Real scams must stay scams | analysis pipeline | `scam.html` text is still `scam`; scanning it still shows a banner | API + browser |
| 19 | Normal pages with a bank name in the path (Wikipedia `MCB_Group`, news, GitHub) get a red badge | `/api/check-url` → URL-03 | None of the 5 test addresses returns a `high` signal | API |
| 20 | A bank's own "we'll never ask for your OTP" page is called SCAM, with a banner | lexicon SEC-01/SEC-03 + semantic model | `bank-advice.html` text isn't `scam`, and scanning it shows no banner | API + browser |
| 21 | Warning banner appears for word-list matches, even on SAFE pages | `extension/background.js:108` (uses `source`) and/or signal `source` mapping | Scanning `safe.html` shows no banner | browser |
| 22 | Popup says "Not checked yet — reload the page" after ~30 s idle while the badge is red | `extension/background.js:11` (`tabResults` is in memory only) | After the extension goes to sleep, the popup still shows the result | browser |
| 23 | Every tab switch re-checks the URL; the limit then shows as "Backend unreachable" | `extension/background.js:53`, `api.js` | 60 switches between 6 already-checked tabs use **10 or fewer** link checks (today: 60). Also check the 429 wording by hand (below) | browser + manual |
| 24 | Shortened links / raw-IP links show ✓; amber badge can never appear | `/api/check-url` only runs `checkUrls()` | `bit.ly/mcbhelp` and `192.168.1.1/login` are both flagged, and at least one of them isn't `high` | API |
| 25 | Reporting a site changes nothing you can see afterwards | `/api/check-url` doesn't read reports | After a report, `/api/check-url` returns a report count field (any name containing "report") | API |
| 26 | On `chrome://newtab`, Report sends "newtab" as a scam site; popup says "reload the page" | `extension/popup.js` | On a new tab, Report is disabled or doesn't report, and the popup doesn't say "reload the page" | browser |
| 27 | Right-click check shows nothing while waiting; every error says "Backend unreachable" | `extension/background.js`, `result.js` | See manual steps below | manual |
| 28 | Text typed into rich text boxes (`contenteditable`) is sent when scanning | `extension/content.js` | On `privacy.html`, none of the `CANARY-*` values (typed or pre-filled, in any box) is in the scanned text | browser |
| 29 | README says the web app ignores `?scan=` (it doesn't anymore) | `extension/README.md` | The sentence "the frontend does not currently read it" is gone | API (file check) |
| 30 | A scan once showed the page heading as "Claimed identity … (reported 0x)" | semantic `observedSender` fallback, `popup.js` | The claimed-identity line isn't the page heading and doesn't say "reported 0x". **AI-dependent:** it can pass by luck, so fixing it by hiding a 0 count is the reliable route | browser |

## Manual checks

**#27, right-click.** Load `extension/` unpacked in Chrome, open
http://localhost:5500/scam.html:
1. Select the EN-01 sentence → right-click → "Check selected text with
   FraudLens". **Fixed when:** something shows it's working straight away,
   before the result window appears.
2. Stop the backend and repeat. **Fixed when:** the window says the backend
   can't be reached.
3. Start the backend, restart it, then do more than 20 right-click text
   checks within 15 minutes. **Fixed when:** it says there have been too many
   checks rather than "Backend unreachable".

**#23, wording.** With the backend running, run this until you see 429s:
```
1..125 | % { try { Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/check-url -ContentType application/json -Body '{"url":"https://example.com"}' | Out-Null } catch {} }
```
Then reload any page and open the popup. **Fixed when:** it says there have
been too many checks, not "Backend unreachable". Restart the backend afterwards.

## Where things are

- Findings with evidence: `git show 8fa64d8:data/test-payloads/FINDINGS.md`
- Test pages: `extension-pages/` (`scam.html`, `safe.html`,
  `bank-advice.html`, `privacy.html`, `long.html`)
- Full manual click-through (for QA after your hand-off): `EXTENSION-CHECKLIST.md`
