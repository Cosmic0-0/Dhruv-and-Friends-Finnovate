# API Contract (as implemented)

This documents the backend routes exactly as implemented in
`backend/src/routes/index.js`, `backend/src/services/analysis/index.js`, and
`backend/src/index.js` — not the original placeholder contract in
`CLAUDE.md`. Build against this. If it changes, it'll be flagged to Oleg
(frontend), Dhruv (OCR/batch), and the extension owner before merging.

Base URL: `http://localhost:4000` in local dev (`PORT` in `.env`).

## `POST /api/analyze`

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
      "type": "string, e.g. \"sender_mismatch\" | \"urgency_language\" | \"lookalike_url\" | \"spoofed_identity\"",
      "description": "string",
      "severity": "low" | "medium" | "high"
    }
  ],
  "suggestedAction": "string, free-form (not an enforced enum)",
  "explanation": "string, localized to the input language"
}
```

`signals` is the union of the LLM's structured output and the non-LLM
domain-matching check (`checkUrls`) — any lookalike URL found in the message
is appended as an additional `type: "lookalike_url"` signal, independent of
what the LLM returned.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "message is required and must be a non-empty string" }` | `message` missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "message exceeds maximum length of 5000 characters" }` | `message.length > 5000` |
| `502` | `{ "error": "<message>" }` | LLM call failed (Ollama and fallback both unreachable/erroring), LLM returned invalid JSON, or LLM output failed schema validation. `<message>` is the raw error string, e.g. `"LLM returned invalid JSON"`, `"LLM output failed schema validation"`, `"LLM unreachable and no fallback provider configured"`. |

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
  "signals": [ { "type": "string", "description": "string", "severity": "low" | "medium" | "high" } ],
  "suggestedAction": "string, free-form (not an enforced enum)",
  "explanation": "string, localized to the input language"
}
```

Same `verdict`/`signals`/`suggestedAction`/`explanation` shape as
`/api/analyze`, with `extractedText` added so the UI can show what OCR read
before/alongside the verdict — useful if OCR misreads part of the image.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "image is required and must be a base64-encoded string" }` | `image` missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "image could not be decoded as base64" }` | decoding `image` (after stripping any `data:...;base64,` prefix) produces a zero-length buffer |
| `400` | `{ "error": "image exceeds maximum size of 5MB" }` | decoded buffer exceeds 5MB |
| `400` | `{ "error": "image must be a valid PNG, JPEG, or WEBP file (checked by content, not the declared type)" }` | magic-byte sniff doesn't match PNG/JPEG/WEBP |
| `400` | `{ "error": "no readable text was found in the image" }` | OCR ran but returned empty/whitespace-only text |
| `400` | `{ "error": "extracted text exceeds maximum length of 5000 characters" }` | OCR text is longer than `/api/analyze`'s message cap — request is rejected, not truncated, since silently truncating could change the analysis without the caller knowing |
| `502` | `{ "error": "OCR failed: <message>" }` | the tesseract.js worker itself threw |
| `502` | `{ "error": "<message>" }` | same LLM-failure cases as `/api/analyze`, once OCR has already succeeded |

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
      "verdict": "safe" | "suspicious" | "scam",
      "signals": [ { "type": "string", "description": "string", "severity": "low" | "medium" | "high" } ],
      "suggestedAction": "string",
      "explanation": "string",
      "analysisFailed": "boolean — true if this message's LLM analysis failed and the result below was synthesized as a fallback; always present, never omitted"
    }
  ],
  "summary": {
    "total": "number",
    "scamCount": "number",
    "suspiciousCount": "number",
    "safeCount": "number",
    "unanalyzedCount": "number — count of results where analysisFailed is true; purely additive, does not change scamCount/suspiciousCount/safeCount semantics"
  }
}
```

**Per-message failure handling:** unlike `/api/analyze`, a single message
failing analysis does not fail the batch or return a non-2xx status. That
message's result is instead synthesized as:

```json
{
  "message": "<original message>",
  "verdict": "suspicious",
  "signals": [ /* still includes any lookalike_url signals from checkUrls() */ ],
  "suggestedAction": "verify_official_channel",
  "explanation": "Analysis failed: <error message>",
  "analysisFailed": true
}
```

`checkUrls()` (the deterministic, non-LLM domain-matching check) now runs
**before** the LLM call for each message, so it's included in the result
whether or not the LLM call succeeds — a lookalike URL is still surfaced
even during a total LLM outage. `verdict` stays `"suspicious"` in the
failure case for backward compatibility (existing `scamCount`/
`suspiciousCount`/`safeCount` semantics are unchanged), but `analysisFailed`
and the summary's `unanalyzedCount` now give the frontend an explicit,
non-inferred way to distinguish "we analyzed this and it looked suspicious"
from "we couldn't analyze this at all."

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "messages must be a non-empty array" }` | `messages` missing, not an array, or empty |
| `400` | `{ "error": "messages exceeds maximum batch size of 50" }` | `messages.length > 50` |
| `400` | `{ "error": "every message in the batch must be a non-empty string" }` | any item is not a string, or empty/whitespace-only |
| `400` | `{ "error": "every message must be 5000 characters or fewer" }` | any item exceeds 5000 characters |

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

**Normalization note (no shape change):** `reportCount` now deduplicates
internally via a normalized, digits-only canonical key (`backend/src/db/index.js`),
assuming the `230` Mauritius country code for 8-digit local numbers. So
`"+230 5789 1234"`, `"+23057891234"`, and `"57891234"` all accumulate against
the same underlying count instead of three independent rows. The `sender`
field in the response is unaffected — it still echoes back the raw string
exactly as submitted; only the counting behavior changed.

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

- **`/api/report`'s `message` and `reportedBy` fields are accepted in the
  request shape but silently ignored** — nothing is persisted beyond the
  `sender` string and its report count (`backend/src/db/index.js` only has a
  `reports(sender, report_count)` table). If the crowdsourced feed needs to
  show reported message content later, this will change.
- **`/api/batch-scan` still reports `verdict: "suspicious"` for a per-message
  analysis failure**, for backward compatibility with existing
  `scamCount`/`suspiciousCount`/`safeCount` consumers — the `VERDICTS` enum
  (`backend/src/services/analysis/index.js`) still only has
  `safe | suspicious | scam`, no dedicated `unknown`/`error` state. However,
  each result now also carries `analysisFailed: boolean`, and the summary
  carries `unanalyzedCount`, so the frontend has an explicit, supported way
  to distinguish "we think this is suspicious" from "we couldn't analyze
  this" without a `verdict` schema change.
- **`suggestedAction` is a free-form string, not an enforced enum** — the
  LLM is prompted with examples (`block_sender`, `report_to_bank`,
  `verify_official_channel`) but nothing validates the value it returns
  against that set. The frontend should not assume it's one of a fixed list
  yet.
- **No rate limiting, auth, or bot protection on any route** — ties to the
  open items in `checklist.md` § Security. Every route is currently
  unauthenticated and uncapped by request rate.
- **`/api/analyze` and `/api/batch-scan` error bodies pass through the raw
  LLM/HTTP error message** (`err.message`) — fine for hackathon debugging,
  but not scrubbed of internal detail; don't render it directly to end
  users without review.
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
