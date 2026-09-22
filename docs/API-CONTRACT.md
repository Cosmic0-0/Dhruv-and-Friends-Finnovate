# API Contract (as implemented)

**Status: LOCKED.** This documents the backend routes exactly as implemented
in `backend/src/routes/index.js`, `backend/src/services/analysis/index.js`,
and `backend/src/index.js` — not the original placeholder contract in
`CLAUDE.md` (kept there only as a superseded historical sketch). Build
against this. Any shape change here must be flagged to Oleg (frontend),
Dhruv (OCR/batch), and the extension owner *before* merging — treat it as
frozen for the rest of the hackathon otherwise.

Base URL: `http://localhost:4000` in local dev (`PORT` in `.env`).

## `POST /api/analyze`

> **RESPONSE SHAPE CHANGE — flag to Oleg (frontend), Dhruv (OCR/batch), and
> the extension owner before merging.** Two additive changes to this route's
> `200 OK` response, layered on top of the shape below:
> 1. Every item in `signals[]` now also carries a `source` field (see the
>    updated response block below) — purely additive, no existing
>    `signals[]` field was removed or renamed.
> 2. A new top-level `riskCategories` object breaks risk into five
>    LOW/MEDIUM/HIGH categories. **`riskScore` is unchanged and still
>    present** — `riskCategories` is additive alongside it, not a
>    replacement, specifically so the frontend's existing `riskScore` UI
>    keeps working unmodified.
>
> `source` on `signals[]` comes from the shared `services/analysis` and
> `services/domain-matching` modules, so it also appears on
> `/api/analyze/screenshot` and `/api/batch-scan` results. `riskCategories`
> and the new `IDENTITY_MISMATCH` evidence item (see below), however, are
> currently wired into **`/api/analyze` only** — `/api/analyze/screenshot`
> and `/api/batch-scan` do not yet compute either. That's a known gap, not
> an oversight — see "Known Gaps" at the bottom of this document.

### Request

```json
{
  "message": "string, required, 1-5000 characters",
  "language": "string, optional — free-form hint, e.g. \"en\" | \"fr\" | \"kreol\" | \"mixed\""
}
```

`language` is not validated against an enum — it's passed straight into the
LLM prompt as a hint string.

### Response — `200 OK`

```json
{
  "verdict": "safe" | "suspicious" | "scam",
  "signals": [
    {
      "type": "string, e.g. \"sender_mismatch\" | \"urgency_language\" | \"lookalike_url\" | \"spoofed_identity\" | \"IDENTITY_MISMATCH\"",
      "description": "string",
      "severity": "low" | "medium" | "high",
      "evidence": "string, optional — verbatim excerpt (text or URL) from the message that triggered this signal. Only present when the LLM supplied one; checkUrls()/checkIdentityConsistency()-appended signals never set it.",
      "source": "\"message_text\" | \"url_parser\" | \"community_reports\" | \"llm_analysis\" | \"identity_check\" — NEW field, where in the pipeline this signal came from. See below."
    }
  ],
  "suggestedAction": "string, free-form (not an enforced enum)",
  "explanation": "string, localized to the input language",
  "riskScore": "number, optional — LLM-supplied confidence 0-100 that the message is a scam. Omitted (not 0/null) if the LLM didn't supply a valid number in range. Unchanged by this update.",
  "sender": "string, optional — identity the message claims to be from (phone number, short code, or name), as extracted by the LLM. Omitted if none was apparent.",
  "senderReports": "number, optional — crowdsourced report count for `sender` (backend/src/db/index.js). Only present when `sender` is present.",
  "riskCategories": "object, NEW — see below. Always present."
}
```

`signals` is the union of the LLM's structured output, the non-LLM
domain-matching check (`checkUrls`), and the non-LLM identity-consistency
check (`checkIdentityConsistency`) — any lookalike URL found in the message
is appended as an additional `type: "lookalike_url"` signal, and any
claimed-identity/domain/beneficiary mismatch is appended as a
`type: "IDENTITY_MISMATCH"` signal, independent of what the LLM returned.
`riskScore`/`sender`/`evidence` are LLM-supplied and best-effort: a malformed
or missing value is silently omitted, it never fails the request
(`backend/src/services/analysis/index.js`).

#### `signals[].source` (NEW)

Every evidence/signal item now carries a `source` string documenting where
in the pipeline it came from:

| Value | Meaning |
|---|---|
| `"message_text"` | LLM signal whose `type` matches a direct message-content pattern (urgency language, OTP/credential request, secrecy instruction, etc.) — classified deterministically from `type` by `classifySignalSource()` in `backend/src/services/analysis/index.js`, not itself an LLM call. |
| `"llm_analysis"` | LLM signal that doesn't match a message-text pattern — the LLM's own inferential scam-pattern reasoning (e.g. `sender_mismatch`, `spoofed_identity`). Default bucket when `message_text` doesn't match. |
| `"url_parser"` | Signal appended by the non-LLM domain-matching module (`checkUrls`, `backend/src/services/domain-matching/index.js`) — currently only `lookalike_url`. |
| `"identity_check"` | Signal appended by the new non-LLM identity-consistency module (`checkIdentityConsistency`, `backend/src/services/identity-consistency/index.js`) — currently only `IDENTITY_MISMATCH`. |
| `"community_reports"` | Reserved for a signal derived from the crowdsourced sender-reputation store (`backend/src/db/index.js`). Not currently emitted by any code path — the report count is still only exposed via the existing top-level `senderReports` field, not as a `signals[]` item. Documented here so the value is reserved if/when that changes. |

#### `IDENTITY_MISMATCH` (NEW evidence type)

Emitted by `checkIdentityConsistency()` (`backend/src/services/identity-consistency/index.js`), a deterministic, non-LLM check run alongside `checkUrls()`. It extracts a claimed
sender/identity from known Mauritius bank/telecom/government brand tokens
mentioned in the message text (MCB, SBM, Absa, Bank One, my.t, Emtel, MRA —
`BRAND_DOMAIN_MAP` in `backend/src/services/domain-matching/index.js`), then
checks that identity against (a) the domain of any URL in the message
(reusing `extractHostnames()` from domain-matching — no URL/domain parsing
is duplicated) and (b) a payment beneficiary/recipient name if the message
states one (plain-text pattern match only, no QR decoding or image
parsing). A mismatch on either produces exactly one `severity: "high"`
signal:

```json
{ "type": "IDENTITY_MISMATCH", "description": "The message claims to be from MCB but the link points to a different domain (...)", "severity": "high", "source": "identity_check" }
```

#### `riskCategories` (NEW)

```json
{
  "identity_risk": "LOW" | "MEDIUM" | "HIGH",
  "behavioral_risk": "LOW" | "MEDIUM" | "HIGH",
  "payment_risk": "LOW" | "MEDIUM" | "HIGH",
  "technical_risk": "LOW" | "MEDIUM" | "HIGH",
  "verification_risk": "LOW" | "MEDIUM" | "HIGH"
}
```

Computed by `computeRiskCategories()`
(`backend/src/services/risk-categories/index.js`), a pure, deterministic
function of the final `signals[]` array (LLM + `checkUrls` +
`checkIdentityConsistency` combined) — no LLM call, no store lookup. Each
`signals[]` item's `type` is keyword-classified into one of the five
categories (e.g. `lookalike_url`/`domain`-ish types → `technical_risk`,
`IDENTITY_MISMATCH`/`spoofed_identity`-ish types → `identity_risk`,
`urgency`/`secrecy`-ish types → `behavioral_risk`, `otp`/`credential`/
`payment`-ish types → `payment_risk`; unmatched types default to
`behavioral_risk`), and a category's rating is the highest severity among
its matched signals, or `"LOW"` if none matched. **This is purely additive
— `riskScore` (the existing single 0-100 LLM confidence number) is
unchanged and still returned exactly as before.**

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "message is required and must be a non-empty string" }` | `message` missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "message exceeds maximum length of 5000 characters" }` | `message.length > 5000` |
| `502` | `{ "error": "analysis failed, try again shortly" }` | LLM call failed (Ollama and fallback both unreachable/erroring), LLM returned invalid JSON, or LLM output failed schema validation. The real error is logged server-side (`console.error`), never returned to the client (`backend/src/routes/index.js`). |
| `429` | `{ "error": "too many analyze requests, try again shortly" }` | per-IP rate limit exceeded (20 req/15min) |

## `POST /api/analyze/screenshot`

Not in the original placeholder contract — added to wire up screenshot/OCR
ingestion (`backend/src/services/ocr/`, tesseract.js `eng+fra`). Runs OCR
first, then the extracted text through the exact same
`analyzeMessage()` + `checkUrls()` pipeline as `/api/analyze`.

### Request

```json
{
  "image": "string, required — base64-encoded image bytes, max 5MB decoded. A `data:<mime>;base64,` prefix is accepted and stripped if present.",
  "language": "string, optional — same free-form hint as /api/analyze"
}
```

The image type is **not** taken from a client-supplied field — there isn't
one. The decoded bytes are sniffed by magic number and must be PNG, JPEG, or
WEBP, regardless of anything the client claims.

### Response — `200 OK`

```json
{
  "extractedText": "string — cleaned OCR output that was actually analyzed",
  "verdict": "safe" | "suspicious" | "scam",
  "signals": [ { "type": "string", "description": "string", "severity": "low" | "medium" | "high", "evidence": "string, optional" } ],
  "suggestedAction": "string, free-form (not an enforced enum)",
  "explanation": "string, localized to the input language",
  "riskScore": "number, optional — see /api/analyze",
  "sender": "string, optional — see /api/analyze",
  "senderReports": "number, optional — see /api/analyze"
}
```

Same `verdict`/`signals`/`suggestedAction`/`explanation`/`riskScore`/`sender`/
`senderReports` shape as `/api/analyze`, with `extractedText` added so the UI
can show what OCR read before/alongside the verdict — useful if OCR misreads
part of the image.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "image is required and must be a base64-encoded string" }` | `image` missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "image could not be decoded as base64" }` | decoding `image` (after stripping any `data:...;base64,` prefix) produces a zero-length buffer |
| `400` | `{ "error": "image exceeds maximum size of 5MB" }` | decoded buffer exceeds 5MB |
| `400` | `{ "error": "image must be a valid PNG, JPEG, or WEBP file (checked by content, not the declared type)" }` | magic-byte sniff doesn't match PNG/JPEG/WEBP |
| `400` | `{ "error": "no readable text was found in the image" }` | OCR ran but returned empty/whitespace-only text |
| `400` | `{ "error": "extracted text exceeds maximum length of 5000 characters" }` | OCR text is longer than `/api/analyze`'s message cap — request is rejected, not truncated, since silently truncating could change the analysis without the caller knowing |
| `502` | `{ "error": "OCR failed, try again shortly" }` | the tesseract.js worker itself threw. The real error is logged server-side, never returned to the client. |
| `502` | `{ "error": "analysis failed, try again shortly" }` | same LLM-failure cases as `/api/analyze`, once OCR has already succeeded |
| `429` | `{ "error": "too many analyze requests, try again shortly" }` | per-IP rate limit exceeded (shares the 20 req/15min bucket with `/api/analyze`) |

## `POST /api/batch-scan`

### Request

```json
{
  "messages": ["string, required — 1-50 items, each 1-5000 characters"]
}
```

### Response — `200 OK`

```json
{
  "results": [
    {
      "message": "string — echoed back from the request",
      "verdict": "safe" | "suspicious" | "scam" | "unknown",
      "signals": [ { "type": "string", "description": "string", "severity": "low" | "medium" | "high", "evidence": "string, optional" } ],
      "suggestedAction": "string",
      "explanation": "string",
      "analysisFailed": "boolean — true if this message's LLM analysis failed and the result below was synthesized as a fallback; always present, never omitted",
      "riskScore": "number, optional — see /api/analyze; never present when analysisFailed is true",
      "sender": "string, optional — see /api/analyze; never present when analysisFailed is true",
      "senderReports": "number, optional — see /api/analyze; never present when analysisFailed is true"
    }
  ],
  "summary": {
    "total": "number",
    "scamCount": "number",
    "suspiciousCount": "number",
    "safeCount": "number",
    "unanalyzedCount": "number — count of results where analysisFailed is true (verdict: \"unknown\"); purely additive, does not overlap scamCount/suspiciousCount/safeCount"
  }
}
```

**Per-message failure handling:** unlike `/api/analyze`, a single message
failing analysis does not fail the batch or return a non-2xx status. That
message's result is instead synthesized as:

```json
{
  "message": "<original message>",
  "verdict": "unknown",
  "signals": [ /* still includes any lookalike_url signals from checkUrls() */ ],
  "suggestedAction": "verify_official_channel",
  "explanation": "Analysis failed: <error message>",
  "analysisFailed": true
}
```

`checkUrls()` (the deterministic, non-LLM domain-matching check) now runs
**before** the LLM call for each message, so it's included in the result
whether or not the LLM call succeeds — a lookalike URL is still surfaced
even during a total LLM outage. `verdict` is `"unknown"` in the failure
case — a dedicated fourth value, distinct from the three real outcomes, so
a failed analysis can never inflate `scamCount`/`suspiciousCount`/
`safeCount` (`buildSummary` in `backend/src/services/batch/index.js` only
tallies `"safe"|"suspicious"|"scam"`). `analysisFailed` and the summary's
`unanalyzedCount` remain the explicit, non-inferred signal for "we couldn't
analyze this at all" — `verdict: "unknown"` is consistent with that, not a
second source of truth.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "messages must be a non-empty array" }` | `messages` missing, not an array, or empty |
| `400` | `{ "error": "messages exceeds maximum batch size of 50" }` | `messages.length > 50` |
| `400` | `{ "error": "every message in the batch must be a non-empty string" }` | any item is not a string, or empty/whitespace-only |
| `400` | `{ "error": "every message must be 5000 characters or fewer" }` | any item exceeds 5000 characters |
| `429` | `{ "error": "too many batch-scan requests, try again shortly" }` | per-IP rate limit exceeded (10 req/15min) |

There is no top-level 5xx for this route — LLM failures are absorbed
per-message as described above.

## `POST /api/report`

### Request

```json
{
  "sender": "string, required, non-empty",
  "message": "string, optional — accepted but currently unused server-side",
  "reportedBy": "string, optional — accepted but currently unused server-side"
}
```

### Response — `200 OK`

```json
{
  "sender": "string — echoed back from the request",
  "reportCount": "number — total times this sender has been reported, across all requests",
  "recorded": true
}
```

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "sender is required and must be a non-empty string" }` | `sender` missing, not a string, or empty/whitespace-only |
| `429` | `{ "error": "too many report submissions from this address, try again later" }` | per-IP rate limit exceeded (5 req/hour — deliberately tighter than the other routes, see checklist.md "Add bot protection") |

**Normalization note (no shape change):** `reportCount` now deduplicates
internally via a normalized, digits-only canonical key (`backend/src/db/index.js`),
assuming the `230` Mauritius country code for 8-digit local numbers. So
`"+230 5789 1234"`, `"+23057891234"`, and `"57891234"` all accumulate against
the same underlying count instead of three independent rows. The `sender`
field in the response is unaffected — it still echoes back the raw string
exactly as submitted; only the counting behavior changed.

## `POST /api/check-url`

Not in the original placeholder contract — added for the browser extension
(`extension/`, stretch goal). A bare hostname/URL isn't a scam "message" to
run through the LLM, and the extension needs a fast, synchronous
per-navigation check, so this route calls only the non-LLM domain-matching
check (`checkUrls()`, `backend/src/services/domain-matching/index.js`) — the
exact same function `/api/analyze` uses for its `lookalike_url` signals.
This is an **additive** change to the locked contract (new route, no
existing route's shape changed) — flagged to Oleg/Dhruv per the lock policy
above, not a silent break.

### Request

```json
{
  "url": "string, required, non-empty — a bare hostname or full URL, e.g. \"mcb-secure.top\" or \"https://mcb-secure.top/login\""
}
```

### Response — `200 OK`

```json
{
  "url": "string — echoed back from the request",
  "flagged": "boolean — true if checkUrls() produced any signal",
  "signals": [ { "type": "lookalike_url", "description": "string", "severity": "low" | "medium" | "high" } ]
}
```

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "url is required and must be a non-empty string" }` | `url` missing, not a string, or empty/whitespace-only |
| `429` | `{ "error": "too many check-url requests, try again shortly" }` | per-IP rate limit exceeded (120 req/15min) |

## `GET /health/llm`

Not in the original placeholder contract, but load-bearing for the demo —
this is the pre-demo check for which provider will actually serve
`/api/analyze` right now. Do not call this during the live demo flow itself.

### Response — `200 OK`

```json
{
  "reachable": "boolean — is Ollama reachable right now",
  "activeProvider": "\"ollama\" | \"<FALLBACK_PROVIDER value>\" | \"none\"",
  "mode": "\"local\" | \"fallback\" | \"auto\" — current LLM_MODE",
  "fallbackConfigured": "boolean — is FALLBACK_API_KEY set",
  "fallbackProvider": "string — current FALLBACK_PROVIDER value, regardless of whether it's configured"
}
```

There is no error status for this route — it always resolves 200, with
`reachable: false` when Ollama is down.

## Known Gaps

Flagging these so Oleg/Dhruv/extension know what's stable to build against
versus what's likely to change before the demo:

- **`riskCategories` and `IDENTITY_MISMATCH`/`identity_check` evidence are
  only computed on `/api/analyze`** — `/api/analyze/screenshot` and
  `/api/batch-scan` still run OCR/batch-summary logic that was explicitly
  out of scope for this change, so their results have no `riskCategories`
  field and never include an `IDENTITY_MISMATCH` signal, even though
  `signals[].source` (the other part of this same change) does appear on
  all three routes since it comes from the shared `services/analysis` /
  `services/domain-matching` modules. If OCR/batch scan need the same
  categories and identity check, that's follow-up work for whoever owns
  those routes, wiring in `computeRiskCategories()`
  (`backend/src/services/risk-categories/index.js`) and
  `checkIdentityConsistency()`
  (`backend/src/services/identity-consistency/index.js`) the same way
  `/api/analyze` does in `backend/src/routes/index.js`.
- **`/api/report`'s `message` and `reportedBy` fields are accepted in the
  request shape but silently ignored** — nothing is persisted beyond the
  `sender` string and its report count (`backend/src/db/index.js` only has a
  `reports(sender, report_count)` table). If the crowdsourced feed needs to
  show reported message content later, this will change.
- **`/api/batch-scan` now reports a dedicated `verdict: "unknown"` for a
  per-message analysis failure** (was `"suspicious"`) — `signals[].verdict`
  can be `safe | suspicious | scam | unknown` for this route specifically;
  `/api/analyze`'s `VERDICTS` (`backend/src/services/analysis/index.js`) is
  unchanged at `safe | suspicious | scam`, since the LLM itself never
  produces `"unknown"` — only the batch failure-synthesis path in
  `backend/src/routes/index.js` does. `analysisFailed: boolean` and the
  summary's `unanalyzedCount` are unchanged and remain the authoritative
  signal; `verdict: "unknown"` is consistent with them, not a second source
  of truth. Frontend types/`api.ts` runtime validation
  (`frontend/lib/types.ts`, `frontend/lib/api.ts`) were updated to accept
  `"unknown"` on `BatchScanResult.verdict` only.
- **`suggestedAction` is a free-form string, not an enforced enum** — the
  LLM is prompted with examples (`block_sender`, `report_to_bank`,
  `verify_official_channel`) but nothing validates the value it returns
  against that set. The frontend should not assume it's one of a fixed list
  yet.
- **No auth on any route** — ties to the open items in `checklist.md` §
  Security. Every route is currently unauthenticated; there's no user/session
  concept in the app at all yet, so this only matters once one is added.
- **Rate limiting and bot protection are now in place** (`express-rate-limit`,
  applied per-route in `backend/src/routes/index.js`): 20 req/15min for
  `/api/analyze` and `/api/analyze/screenshot`, 10 req/15min for
  `/api/batch-scan`, 120 req/15min for `/api/check-url`, and a much tighter
  5 req/hour for `/api/report` specifically as bot protection for the
  crowdsourced feed. All limits are per-IP and return `429` with
  `{ "error": "..." }` plus standard `RateLimit-*` headers when exceeded —
  callers should treat 429 as a distinct, retryable case.
- **Security headers are now set** via `helmet()` in `backend/src/index.js`
  (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS,
  etc.) on every response, including `/api/*`.
- **`/api/analyze`, `/api/analyze/screenshot`'s top-level failure, and the
  final error-handling middleware no longer pass through raw `err.message`**
  — they return a generic `{ "error": "..." }` string and log the real error
  server-side with `console.error`. `/api/batch-scan`'s **per-message**
  `explanation` field still includes `err.message` on an individual
  analysis failure (by design — it's user-facing "why this one couldn't be
  analyzed" copy, and the underlying messages are already short, sanitized
  strings like `"Ollama request failed: 500"`, never a stack trace).
- **`/api/analyze/screenshot` has no automated tests yet** — verified
  manually (real PNG generated with ImageMagick, plus missing/non-image/
  blank-image/oversized/data-URI-prefix cases) against the dev server, but
  unlike the other routes there's no `services/ocr/` integration test
  exercising it through the HTTP layer. `services/ocr/index.test.js`
  covers `extractTextFromImage`/`cleanExtractedText` directly.
- **Tesseract has no dedicated Kreol Morisyen language pack** — OCR runs
  with `eng+fra`, which covers Kreol's Latin-script text well enough per
  `services/ocr/index.js`'s comment, but isn't Kreol-tuned. Recheck with
  Joshua's dataset once real Kreol screenshots are available to test
  against.
