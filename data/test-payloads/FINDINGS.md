# QA Findings — round 1

Owner: **Caellum**. Raised against `main` @ `0fe6524` (merged into `caellum`).

All of these were found without a working LLM — no Ollama locally, no
fallback key. Every item below is reproduced against the running backend
or against the module directly, not inferred from reading code.

Severity is impact if it ships. Priority is the backend owner's call.

---

## 1. `npm install` fails on Node 24 — FIXED IN THIS PR

**Severity:** blocker (resolved)

`better-sqlite3@11.x` ships no prebuilt binary for Node 24 (ABI 137), so
npm falls through to `node-gyp` and fails on any machine without a Visual
Studio toolchain:

```
gyp ERR! find VS  Could not find any Visual Studio installation to use
gyp ERR! not ok
```

Bumped to `^12.11.1`, which has a Node 24 prebuild. Installs clean, native
binding loads, no source changes needed in `src/db/index.js`. Anyone else
on Node 24 was blocked by this too.

---

## 2. Scheme-less URLs bypass domain matching entirely

**Severity:** high &nbsp;·&nbsp; `src/services/domain-matching/index.js`

The extraction regex is `/https?:\/\/[^\s]+/g`, so a link only reaches the
matcher if it's written with `http://` or `https://`.

```js
checkUrls("Verify at mcb.nu/verify now")          // → []
checkUrls("Verify at https://mcb.nu/verify now")  // → [lookalike_url, high]
```

Real scam SMS overwhelmingly omit the scheme — it isn't needed for the link
to be tappable on a phone. As it stands the deterministic matcher misses the
common case and only fires on the rarer one.

---

## 3. Realistic lookalike domains are never matched

**Severity:** high &nbsp;·&nbsp; `src/services/domain-matching/index.js`

The threshold is Levenshtein distance ≤ 2 against `LEGIT_DOMAINS`. That only
catches single-character typos. It does not catch the prefix/suffix pattern
that actual bank phishing uses:

```js
checkUrls("https://mcb-secure.top/verify")  // → []   distance from mcb.mu is 9
checkUrls("https://mcb.nu/verify")          // → [lookalike_url]   distance 1
```

The demo scenario in `FraudLens_Compliance_Integration.md` § 38 uses
`oceanbank-secure-mu.top` — exactly the shape that returns nothing today.

Edit distance is the wrong tool for this class. Worth considering: does the
hostname *contain* a known brand token (`mcb`, `sbm`, `absa`, `bankone`,
`myt`, `emtel`) while not being on the legit list? That catches
`mcb-secure.top`, `sbm-verify.net`, `secure-absa.mu` in one rule, and
complements the distance check rather than replacing it.

This is a named judging differentiator, so it's worth getting right before
payloads are written around the current behaviour.

---

## 4. Sender identifiers are not normalized

**Severity:** high &nbsp;·&nbsp; `src/db/index.js`

`reports.sender` is the raw request string as primary key. The same phone
number in three common formats becomes three rows with independent counts:

```
POST /api/report  "+230 5789 1234"  → reportCount: 2
POST /api/report  "+23057891234"    → reportCount: 1
POST /api/report  "57891234"        → reportCount: 1
```

The crowdsourced feed's whole value is "this number was reported N times."
Split across formats, N is wrong for every real sender, and the demo
undercounts. Suggest normalizing to digits-only with a canonical country
prefix before the insert, keeping the display string separate.

---

## 5. Malformed JSON returns an HTML stack trace with absolute paths

**Severity:** high &nbsp;·&nbsp; `src/index.js` &nbsp;·&nbsp; also a `checklist.md` § Security item

There's no error-handling middleware, so a body that fails `express.json()`
parsing falls through to Express's default handler:

```
POST /api/report   body: {"sender": broken

<!DOCTYPE html>
<pre>SyntaxError: Unexpected token 'b' ... is not valid JSON
   at JSON.parse (&lt;anonymous&gt;)
   at parse (C:\Users\Caellum\Documents\Projects\finnovate-hackathon\backend\node_modules\body-parser\...
```

Leaks the filesystem layout and the dependency tree, returns HTML from a
JSON API, and directly contradicts the checklist item *"Trim API responses —
don't leak internal fields (raw LLM prompt, stack traces, DB row
internals)."* A four-line error middleware returning
`{ error: "invalid JSON body" }` with a 400 closes it.

---

## 6. A total LLM outage is reported as real "suspicious" findings

**Severity:** medium (high for the demo) &nbsp;·&nbsp; `src/routes/index.js`

With the LLM unreachable, `/api/batch-scan` still returns `200`, and every
failed message is recorded as `verdict: "suspicious"`:

```json
"summary": { "total": 3, "scamCount": 0, "suspiciousCount": 3, "safeCount": 0 }
```

Nothing in the summary distinguishes "we analyzed three messages and all
three were suspicious" from "we analyzed nothing." On stage with a flaky
Tailscale link, the batch view would look like it's working while reporting
pure noise. The `VERDICTS` enum has no `unknown`/`error` state to use
instead — this is already flagged under Known Gaps in the contract, raising
it because the demo depends on it.

---

## 7. Batch failure path skips domain matching

**Severity:** medium &nbsp;·&nbsp; `src/routes/index.js`

In the same run, the message containing a confirmed lookalike URL came back
with no signals at all:

```json
{ "message": "MCB verify at https://mcb.nu/verify",
  "verdict": "suspicious", "signals": [],
  "explanation": "Analysis failed: LLM unreachable..." }
```

`checkUrls()` is pure, deterministic and needs no LLM, but it sits inside
the `try` block after `analyzeMessage()`, so an LLM failure discards it.
Moving it before the try — or into the catch — means a batch still surfaces
lookalike URLs when the model is down. That's a cheap, meaningful fallback
for the exact scenario in finding 6.

---

## 8. `summarizeBatch` fires the whole batch concurrently

**Severity:** medium &nbsp;·&nbsp; `src/services/batch/index.js`

`Promise.all(messages.map(...))` issues every analysis at once. Against one
self-hosted model over Tailscale, a 50-message batch means 50 simultaneous
generations; with `LLM_TIMEOUT_MS` at 15s the likely outcome is mass
timeouts, which finding 6 then reports as "suspicious."

Not yet measured — needs an LLM endpoint. Flagging now because the fix
(a small concurrency cap, 2–4 in flight) is cheaper to apply before the
demo than to diagnose during it. I'll measure real per-message latency and
a safe batch size once I have an endpoint.

---

## 9. Two different batch size limits

**Severity:** low &nbsp;·&nbsp; `src/routes/index.js` vs `src/services/batch/index.js`

The route rejects above `MAX_BATCH_MESSAGES = 50`; `summarizeBatch` rejects
above `MAX_BATCH_SIZE = 100`. The route guards first, so nothing is broken
through the API, but the unit tests exercise a limit the API never permits,
and any other caller (OCR flow, extension) gets a different contract. Worth
collapsing to one exported constant.

---

## 10. Brand-token check matches as a raw substring, flagging unrelated domains

**Severity:** medium &nbsp;·&nbsp; `src/services/domain-matching/index.js`

The round-1 fix for #3 added a brand-token check (`host.includes(token)`) to
catch prefix/suffix phishing patterns the Levenshtein check misses. But a raw
substring match fires on any hostname that happens to contain a token's
letters in sequence, regardless of word boundaries:

```js
checkUrls("https://mythology-store.com/catalog")  // → [lookalike_url]  "myt" ⊂ "mythology"
checkUrls("https://absalom-books.com/order/1")     // → [lookalike_url]  "absa" ⊂ "absalom"
checkUrls("https://sbmarketing.co.uk/quote")       // → [lookalike_url]  "sbm" ⊂ "sbmarketing"
```

None of these are lookalikes of `mcb.mu`, `absa.mu`, or `sbmgroup.mu` — they're
unrelated legitimate-looking domains that happen to start with the same
letters. A deterministic signal that fires this easily on ordinary domains
undermines the "structured signal breakdown, not a black box" pitch (a named
judging differentiator) the moment a judge tries an off-script URL.

**Suggested fix:** match whole hostname labels instead of a substring —
split the hostname on `.` and `-` and check for an exact label match:

```js
const labels = host.split(/[.-]/);
const brandToken = BRAND_TOKENS.find((token) => labels.includes(token));
```

This still catches `mcb-secure.top` (labels: `mcb`, `secure`, `top`) and
`secure-absa.mu` (labels: `secure`, `absa`, `mu`) — the exact cases #3 was
raised for — while no longer matching `mythology-store.com`,
`absalom-books.com`, or `sbmarketing.co.uk`.

**Status: FIXED IN THIS PASS.** Applied the label-split fix above and added
regression tests for both the three false positives and a same-label true
positive (`secure-absa.mu`). Full suite re-run: 19/19 passing.

---

## 11. Levenshtein-2 threshold false-positives on short, unrelated real domains

**Severity:** medium &nbsp;·&nbsp; `src/services/domain-matching/index.js` &nbsp;·&nbsp; found while
building the EN/FR payload set, reproduced directly against the module

```js
checkUrls("File at mra.mu before the deadline")
// → [{ type: "lookalike_url", description: "mra.mu closely resembles legitimate domain mcb.mu", ... }]
```

`mra.mu` — the real Mauritius Revenue Authority domain, entirely unrelated to
MCB — trips the distance-≤2 check against `mcb.mu`: both are 6 characters,
differing only in the middle two letters (`r`/`a` vs `c`/`b`). For short,
generic-shaped domains (`xyz.mu`), a flat distance-2 threshold is really just
"any other short word starting with the same letter and ending in `.mu`" —
2 of 3 label characters is a huge fraction to allow. I checked the other five
`LEGIT_DOMAINS` and a few other real-looking `.mu`/`.com` domains directly
against `checkUrls()`; only `mra.mu` collided, but the risk is systemic, not
specific to this one string.

This is exactly the "genuine-but-alarming precision" case the EN/FR payload
set (`en.json`/`fr.json`, added in this pass) is designed to catch: a message
that legitimately mentions a real, benign government domain would come back
with an unexplained `lookalike_url` signal for `mcb.mu` — confusing at best,
and a bad look in front of judges who recognise `mra.mu` as legitimate. I
excluded `mra.mu` from the safe/genuine payloads rather than let the test set
assert around a known bug; it's the demonstration case for the payload with
`id: "EN-17"`/`"FR-17"` (see their `notes` field).

Not fixed here — this is `domain-matching`, out of QA's role-gated area, and
worth a design call rather than a quick patch: options include a
length-scaled threshold (e.g. distance ≤1 for labels under ~5 characters),
or requiring the compared label lengths to be within some delta before the
distance check applies at all. Flagging for the backend owner.

---

## Round-1 re-verification (2026-09-22)

Re-ran findings 2–9 against the current `caellum` branch — not inferred from
reading the code, actually exercised:

- **#2 scheme-less URLs / #3 lookalike domains** — `npm test`:
  `checkUrls` unit tests for both cases pass (19/19 total after adding #10's
  tests).
- **#4 sender normalization** — live `POST /api/report` against a freshly
  started `npm run dev`: `"+230 4444 5555"`, `"+2304444555 5"`, and
  `"44445555"` accumulate to `reportCount: 1, 2, 3` — one shared row, as
  intended.
- **#5 malformed-JSON leak** — live `POST /api/report` with a broken JSON
  body now returns `400 {"error":"invalid JSON body"}` (`Content-Type:
  application/json`), not an HTML stack trace. Caught a real regression
  while checking this: a stale `npm start` (no `--watch`) process from
  earlier today was still bound to port 4000 serving pre-fix behavior —
  not a code regression, but a reminder that `/health` responding isn't
  proof the *current* code is what's actually running. Killed it and
  re-verified against a clean `npm run dev`.
- **#6 outage visibility / #7 batch skips domain matching / #8 concurrency
  cap / #9 single batch-size constant** — all four are exercised directly by
  `summarizeBatch`'s unit tests (analysisFailed/unanalyzedCount, injected
  `analyze` ordering under concurrency, single exported `MAX_BATCH_SIZE`);
  reading `routes/index.js` confirms `checkUrls()` is still computed before
  the `try` in the batch route's `analyze` closure. No LLM endpoint yet, so
  real per-message latency (the open half of #8) is still unmeasured.

All nine hold up. No regressions found in the fixes themselves.

## 12. OpenRouter free-tier fallback misses its own timeout budget about half the time

**Severity:** high — this is the fallback path CLAUDE.md names as a blocking
demo-readiness requirement &nbsp;·&nbsp; `backend/.env` /
`scripts/check-llm-fallback.js`

Now that a real `FALLBACK_API_KEY` is wired in (`FALLBACK_PROVIDER=openrouter`,
`OPENROUTER_MODEL=liquid/lfm-2.5-2.6b:free`), I ran `npm run test:fallback`
four times back to back, no cooldown between runs, against the actual
OpenRouter API — not simulated:

| Run | Result | Time |
|---|---|---|
| 1 | FAIL — aborted at timeout | 15018ms |
| 2 | PASS | 13567ms |
| 3 | FAIL — aborted at timeout | 15009ms |
| 4 | PASS | 11045ms |

2 of 4 (50%) didn't respond within `LLM_TIMEOUT_MS=15000` at all — not "slow
but correct," a hard abort with no analysis result. The two passes were also
both within ~1.5–4s of the budget, not comfortably under it. This roughly
matches the "2 of 3" estimate already written in `.env`'s comment from
whoever picked this model, so it isn't a fluke of my particular runs — it's
the model's actual behavior under back-to-back load, which is exactly the
condition a live demo Q&A session would create.

If Ollama is genuinely unreachable on stage (the scenario this fallback
exists for) with a roughly coin-flip chance of the fallback itself timing
out, `/api/analyze` returns a 502 to the user with no result at all — the
worst-case outcome CLAUDE.md's "reliability during the live demo" priority
is specifically trying to prevent.

**Suggested directions (not applied — a demo-strategy call, not a one-line
fix):**
- Raise `LLM_TIMEOUT_MS` specifically for demo conditions, if the UI can
  tolerate a longer spinner without looking broken.
- Try a different free OpenRouter model, or a cheap paid one, and re-run
  `npm run test:fallback` several times before committing to it — one
  `.env.example` comment's worth of testing may not be enough sample size;
  this finding's 4 runs still aren't either.
- Consider a pre-demo "warm-up" request to OpenRouter a few minutes before
  going on stage, in case part of the latency is a cold start rather than
  steady-state model speed — untested here, just a hypothesis worth
  ruling in or out before the demo.

## Consistency run (2026-09-23)

First full run of `consistency.mjs` against a real model: `qwen3:8b` on the
VPS (`OLLAMA_URL=http://100.115.195.94:11434`), 72 messages × 3 runs = 216
calls. Every call was answered by Ollama, with no errors and no fallback to
OpenRouter. Median 5.7s per call, slowest 12.3s, whole run about 22 minutes.
Full results are the baseline in
`consistency-results/2026-09-23T08-43-48-781Z.json`.

| Set | Same verdict every run | Majority verdict matches expected |
|---|---|---|
| EN (20) | 19/20 | 9/20 |
| FR (20) | 17/20 | 11/20 |
| KR (24) | 15/24 | 10/24 |
| SEED (8) | 5/8 (0/8 once the sender check counts) | 4/8 |
| **Total** | **52/72** | **34/72** |

The model usually gives the same answer twice. Most of the time that answer
is wrong in the same way on every run, not randomly.

## 13. "Reported N times" never fires for the seed messages

**Severity:** high, a demo feature fails without any error &nbsp;·&nbsp;
`backend/src/routes/index.js:89`, `backend/src/services/analysis/index.js:12`

`withSenderReports()` looks up the AI's `sender` field. The prompt defines
`sender` as *who the message claims to be from*, so for all 8 seed messages
the AI returned things like "Mum", "Douane", "Unknown" and "our anniversary
draw". It never returned the `5900 00xx` number written in the message. 0 of
24 runs picked out the number, so `senderReports` is always 0 for the demo
senders. The lookup itself is fine: `normalizeSender()` would match
`5900 0012` against the seeded `+230 5900 0012`.

**Suggested direction:** also pull phone numbers out of the message text
with a regex (no AI needed) and look those up.

## 14. The model says `suspicious` when it means `scam`

**Severity:** high

27 of the 44 expected-`scam` messages got a majority of `suspicious`
(EN 8/11, FR 5/11, KR 14/20, SEED 4/8). The risk score shows the model
*thinks* they are scams:

- every `scam` verdict came with a risk score of exactly 95
- `suspicious` verdicts ranged from 65 to 95, many at 85–95

So the label and the score disagree. **Suggested direction:** set the
verdict from the risk score in code (e.g. 80 or above means `scam`), or
tighten the prompt's definition of each verdict.

## 15. Kreol answers change the most between runs

**Severity:** medium, since Kreol support is a differentiator we show on stage

9 of 24 Kreol messages changed verdict between runs, against 1/20 English
and 3/20 French. Every change was between `scam` and `suspicious`, so fixing
#14 should mostly fix this too. Re-run `--set payloads` after that fix to check.

## 16. Real bank messages get flagged

**Severity:** high, because it undermines trust if a judge tries one

- `EN-13`/`FR-13` (a real MCB one-time code): `scam` 2/3, `suspicious` 1/3,
  risk score 85–95. The comment at `llmClient.js:46` already notes this miss.
- `EN-14`/`FR-14` (a real debit alert): `suspicious` 3/3.

The other 8 safe EN/FR messages and all 3 safe Kreol messages were correct.

## 17. Some sketchy opening messages get called safe

**Severity:** medium

`EN-20`, `FR-19` and `FR-20` (expected `suspicious`) came back `safe` 3/3.
`FR-19` asks for the reader's ID card number, so rating it safe is a real miss.

## 18. Signal names aren't consistent

**Severity:** medium, since it breaks `expected.signals` checks and makes the signal breakdown look messy

The AI mostly returns its own uppercase names (`URGENCY` 139 times,
`PAYMENT_REQUEST` 98, `IMPERSONATION` 41, `SUSPICIOUS_URL` 34). It only
rarely returns the names the contract and payloads use (`urgency_language`
2, `spoofed_identity` 2), and the same idea comes back spelled several ways
(`URGENCY`, `URGENCY_LANGUAGE`, `urgency`). So the subset match on
`expected.signals` described in `README.md` would fail almost everywhere.
**Suggested direction:** give the prompt a fixed list of signal names, or
map the AI's names to one set in code.

## Safe picks for the demo (until the above are fixed)

Stable *and* correct on every run: `EN-01`, `EN-03`, `EN-05`, `FR-02`,
`FR-03`, `FR-05`, `FR-08`, `FR-11`, `KR-11`, `KR-21`, plus the safe
messages except `EN-13`/`EN-14`/`FR-13`/`FR-14`. Don't show "reported N
times" until #13 is fixed.

## What I need to continue

Nothing blocking. The VPS model is reachable. Next step is re-running
`consistency.mjs` after fixes to #13, #14 and #18 and comparing against the
2026-09-23 baseline.

---

## Extension test (2026-09-23)

Raised against `main` @ `94781c2` (extension v0.3.0), backend on
`localhost:4000` using the VPS model (`/health/llm` reachable, provider
`ollama`). Test steps are in `EXTENSION-CHECKLIST.md`; test pages are in
`extension-pages/`. **To check fixes:** `EXTENSION-FIX-CHECKS.md` and
`verify-extension-fixes.mjs` re-test every finding below and print
PASS/FAIL per number.

Items marked **confirmed in Chrome** were reproduced with the real, unmodified
extension loaded into Chrome for Testing 148 and driven by a script (toolbar
click, real popup, real "Scan This Page"), as well as with direct calls to the
backend routes it uses. Items marked **from code** are certain from reading
the extension but couldn't be automated (Chrome's right-click menu can't be
driven by a script), so they need one manual check.

## 19. Normal sites get a red "High risk" badge if the bank's name is in the address

**Severity:** high, because a judge browsing Wikipedia or LinkedIn sees our tool call it a scam &nbsp;·&nbsp; confirmed in Chrome

`/api/check-url` treats a bank name anywhere in the path as a scam (URL-03,
always `high`). In Chrome, visiting Wikipedia's MCB_Group article gave a red
**!** badge, and the popup said "High risk — strong scam signals found" with
the evidence `en.wikipedia.org uses "mcb" in its path but is not MCB's
domain`. The same happens for these addresses through the API (LinkedIn
sends logged-out visitors to a login page first, so it only shows up for
signed-in users):

```
https://en.wikipedia.org/wiki/MCB_Group            ! high-risk  URL-03
https://www.linkedin.com/company/mcb-group         ! high-risk  URL-03
https://www.lexpress.mu/article/mcb-annual-results ! high-risk  URL-03
https://defimedia.info/sbm-bank-new-branch         ! high-risk  URL-03
https://github.com/absa/some-repo                  ! high-risk  URL-03
```

Inside a *message*, a bank name in a link's path is a fair warning sign. As
the address of the page you're already on, it's normal for news sites,
Wikipedia and social media. **Suggested direction:** don't use URL-03's
path check for `/api/check-url`, or treat it as low severity there.

## 20. "Scan This Page" calls a real bank's safety advice a scam

**Severity:** high, because the obvious demo is scanning a real bank page &nbsp;·&nbsp; confirmed in Chrome

Page text in the style of a real bank's security centre
(`extension-pages/bank-advice.html`: "MCB will never ask you to share your
OTP, PIN, password…", "Do not click links in unexpected messages") came back
**SCAM, risk 70, "do not pay"**, and the extension's banner rule fires:

```
SEC-03 lexicon         "…MCB will never ask you to share your OTP, PIN, password"
SEC-01 semantic_model  "MCB will never ask you to share your OTP, PIN, password or card CVV…"
SEC-02 semantic_model  "Do not click links in unexpected messages."   ← labelled "install remote-access software"
SOC-01 lexicon         "immediately"
```

A French news article warning about a scam wave (quoting the scam) also came
back SCAM. "Never ask for your OTP" is read as asking for it, and the AI's
SEC-02 quote has nothing to do with remote access. The evidence check passes
because the quote is in the page, even though it doesn't support the claim.
This is the analysis engine, not extension code, but whole pages reach it
through the extension, and pages like this are common.
**Suggested direction:** make the SEC-01/SEC-03 word lists skip "never
ask/will never" phrasing. Until then, don't scan bank or news pages in the
demo; scan `extension-pages/scam.html`.

## 21. The in-page warning banner appears for word-list matches, even on SAFE pages

**Severity:** medium &nbsp;·&nbsp; confirmed in Chrome

The README says the banner shows only for fake-domain / fake-identity
checks, "never for weak" signals. The extension decides this with
`signal.source` (`background.js:110`). The backend gives word-list matches
(`sourceType: "lexicon"`) the same `source: "identity_check"` tag, so they pass:

- `KR-11`: banner "Fee demanded before you can receive something" (PAY-04, word list)
- A harmless page (`extension-pages/safe.html`: "The library **will be
  closed** on Friday…"): verdict **SAFE**, score 10, but an amber banner
  still appears saying "Threat of suspension, penalty or legal action"

**Suggested direction:** use `sourceType === "rule"` (or the `URL-`/`ID-`
code prefix) instead of `source`, and never show a banner when the verdict
is `safe`.

## 22. The popup forgets the result after about 30 seconds

**Severity:** high for the demo, because the planned beat is "open a fake site, then open the popup" &nbsp;·&nbsp; confirmed in Chrome

Results are kept only in memory in the background script (`tabResults`,
`background.js:11`). Chrome puts extension background scripts to sleep after
about 30 seconds of no activity, and that memory is wiped. If you open the
popup after that, it gets nothing back and says **"Not checked yet — reload
the page"**, while the badge still shows the red **!**. Talking over a slide
for 30 seconds before clicking the icon is enough to trigger this.

In Chrome, on Wikipedia's MCB_Group page, the popup said "High risk" straight
away. The background script went to sleep **30 s** later with no tab
activity, and the popup then said "Not checked yet — reload the page", badge
still `!`.

Having the background script's DevTools open keeps it awake, which hides the
bug during development. **Suggested direction:** store results in
`chrome.storage.session` instead of a `Map`, or re-check when the popup finds
nothing.

## 23. Hitting the link-check limit shows "Backend unreachable" everywhere, including on scam sites

**Severity:** medium &nbsp;·&nbsp; confirmed in Chrome

Every page load **and every tab switch** calls `/api/check-url`
(`background.js:53`, even if the tab was checked a second ago). The limit is
120 per 15 minutes per computer; 125 quick calls gave `74 × 200, 51 × 429`
(I'd already used some). Once it's hit, every tab shows the grey **×** and
"Backend unreachable: backend returned 429" for up to 15 minutes, so a real
fake-bank site gets no warning. A rehearsal plus the demo on one laptop can
use this up. In Chrome, 6 open tabs and 60 quick tab switches used about 80
of the 120. After the limit, `mcb-secure-verify.top` showed **×** and
"Backend unreachable: backend returned 429. Browsing was not blocked." (The
switching itself was fine: all 6 tabs kept the right badge.) **Suggested direction:** reuse the cached result on tab switch,
and show "too many checks, try again shortly" rather than "unreachable".

## 24. The amber "?" badge can never appear while browsing, and some scam links show as safe

**Severity:** medium &nbsp;·&nbsp; confirmed in Chrome

`/api/check-url` runs only `checkUrls()`, whose four rules (URL-01 to URL-04)
are all `high`. So while browsing, the badge is only ✓, ! or ×. The README's
checklist step 2 expects amber for some sites. The weaker link checks that
exist for messages (`checkLinkHygiene`: shortened links, raw IP addresses)
aren't used, so these come back ✓ "No known risk signals":

```
https://bit.ly/mcbhelp          ✓     http://192.168.1.1/login   ✓
https://track-parcel-mu.top/    ✓   (the EN-08 scam link: no bank name, so no match)
```

**Suggested direction:** add URL-05/URL-06 to `/api/check-url` at their own
(low/medium) severities, which would also bring back the amber state.

## 25. "Report this site" reports are never shown back

**Severity:** medium, since the crowdsourced feed is a differentiator &nbsp;·&nbsp; confirmed in Chrome

The popup sends the hostname to `/api/report` and shows the new count once.
Nothing reads it afterwards. `/api/check-url` doesn't look up reports
(`routes/index.js:221`), so the next visit to a reported site looks exactly
the same. In Chrome: reported `mcb-secure-verify.top` ("reported 1
time(s)"), reloaded, and the popup had no mention of it. There's also no "are you sure?" before reporting, and the limit is
5 per hour. **Suggested direction:** have `/api/check-url` return the report
count for the hostname and show "reported N times" in the popup.

## 26. On browser pages, "Report this site" reports junk names, and the popup says "reload"

**Severity:** low &nbsp;·&nbsp; confirmed in Chrome

On `chrome://newtab` or `chrome://extensions`, the popup takes the hostname
as `newtab` / `extensions`, and **Report this site** sends that to
`/api/report` as a scam site. In Chrome both went through: "Reported. newtab
has been reported 1 time(s)." and the same for `extensions`. On a `file://` page the hostname is empty, so
the button silently does nothing. On all of these the popup says "Not checked
yet — reload the page", which reloading can't fix. **Suggested direction:**
disable Scan/Report on non-http(s) pages and say "FraudLens only checks
websites".

## 27. No sign anything is happening after a right-click check, and every error says "Backend unreachable"

**Severity:** low &nbsp;·&nbsp; from code (the right-click menu can't be automated)

After "Check selected text with FraudLens", nothing appears until the AI
finishes (1–7 s in my runs, up to 60 s if it's slow), so people click again.
The result window labels every error "Backend unreachable: …", including
"too many analyze requests" and "No text was selected". In the popup,
clicking the page while a scan is running closes the popup and the result
is lost (only a dot in Recent checks remains).

## 28. Text typed into rich text boxes is sent when you scan a page

**Severity:** medium (privacy promise) &nbsp;·&nbsp; confirmed in Chrome

`content.js` sends `document.body.innerText`. That correctly leaves out
password boxes, normal input boxes and hidden fields. It **does** include
rich text boxes (`contenteditable`), which is what webmail compose windows,
chat apps and many comment boxes use. The comment in `content.js` and the
README say typed text is never read "by construction", which isn't true
there. **Suggested direction:** skip `[contenteditable]` elements when
collecting text, or reword the promise.

In Chrome, on `extension-pages/privacy.html`, I typed into every box and ran
Scan This Page. What was sent:

```
CANARY-USERNAME / CANARY-PASSWORD / CANARY-PWTYPED (typed)   not sent
CANARY-HIDDEN / CANARY-TEXTAREA / CANARY-TATYPED (typed)     not sent
CANARY-TYPED (typed into the rich text box)                  SENT
```

## 29. README is out of date on "Open in FraudLens"

**Severity:** low &nbsp;·&nbsp; confirmed in Chrome

README "Known limitations" says the web app ignores `?scan=`. It doesn't
anymore: `frontend/components/CheckForm.tsx:169` fills the text box from it
(in Chrome, the web app opened with the scanned text already in the box).
But after **Scan This Page**, the text passed is the first 400 characters of
the page, which is usually the menu and header, not the message. The README
needs updating, and passing only the part that triggered signals would make
the handoff useful.

## 30. A page scan can show the page's heading as "Claimed identity … (reported 0x)"

**Severity:** low &nbsp;·&nbsp; seen once in Chrome, not repeatable

Scanning `extension-pages/scam.html` once showed "Claimed identity: Messages I
received (reported 0x)". "Messages I received" is the page's heading. A
second run of the same text gave `sender: "MCB"`. The value falls back to the
AI's guess (`semantic.observedSender`, `pipeline/index.js:174`), so it varies
between runs. On real pages the first line is usually a menu, which makes
this more likely. "(reported 0x)" also reads oddly; hiding the count when it's
0 would help.

### Checked in Chrome and working

- Real bank and everyday sites get ✓; fake bank sites get **!**, including
  ones that don't load (the address alone is checked).
- Scan This Page on `scam.html`: SCAM 100/100 with a red banner naming
  `mcb-secure-verify.top`. Scanning twice gives one banner; **Dismiss**
  removes it.
- Backend stopped mid-scan: the popup shows "Failed to fetch" after about 2 s,
  with no endless spinner. Backend down while browsing: grey **×**, "Backend
  unreachable: Failed to fetch. Browsing was not blocked.", and pages still
  load.
- Scan on `chrome://` pages: "Could not read this page: Cannot access a
  chrome:// URL".
- Fast tab switching (6 tabs, 60 switches): every tab kept the right badge.
- A tab loaded in the first moment after the extension is installed isn't
  checked until it's reloaded. That's minor and expected.

### Setup notes (not bugs, but they cost time)

- `backend/.env` still has `OLLAMA_URL=http://localhost:11434`. I overrode it
  on the command line rather than editing the file.
- `frontend/.env` points the web app at the shared VPS backend
  (`100.73.202.25:4000`), so "Open in FraudLens" results and report counts
  come from a different database than the extension's, unless you start
  it with `BACKEND_URL=http://localhost:4000`.
- After pulling `main`, the backend needs `sharp`. `npm ci` fails on Windows
  while any other backend process is running (it can't delete the locked
  `better_sqlite3.node`); `npm install` works.
