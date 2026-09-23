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
