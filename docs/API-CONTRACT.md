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
      "explanation": "string"
    }
  ],
  "summary": {
    "total": "number",
    "scamCount": "number",
    "suspiciousCount": "number",
    "safeCount": "number"
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
  "signals": [],
  "suggestedAction": "verify_official_channel",
  "explanation": "Analysis failed: <error message>"
}
```

Note this synthesized result does **not** run domain-matching (`checkUrls`)
for that message — `signals` is always empty in the failure case, even if
the message contains a lookalike URL. See "Known Gaps" below.

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
- **`/api/batch-scan` overloads `verdict: "suspicious"` as a generic
  "analysis failed" state** for a per-message failure — it's not a real
  suspicious verdict, just the current placeholder for "couldn't get an
  answer." The `VERDICTS` enum (`backend/src/services/analysis/index.js`)
  only has `safe | suspicious | scam`, no `unknown`/`error` state. If the UI
  needs to distinguish "we think this is suspicious" from "we couldn't
  analyze this," that needs a schema change.
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
- **Screenshot/OCR ingestion and its endpoint are not implemented yet** —
  `backend/src/services/ocr/` is scaffolding only, so there's no documented
  contract for it here.
