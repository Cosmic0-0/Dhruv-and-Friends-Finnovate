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

## What I need to continue

An LLM endpoint — either the Tailscale `OLLAMA_URL` or a `FALLBACK_API_KEY`.
Everything above was reachable without one, but verdict accuracy, the
cross-language payload set and the latency numbers in finding 8 all need a
model that answers.
