# API Contract (as implemented)

**Status: LOCKED.** This documents the backend routes as implemented in
`backend/src/routes/index.js`, `backend/src/services/pipeline/index.js`, and
`backend/src/index.js`. Update this file and every consumer together when a
request or response shape changes.

Base URL: `http://localhost:4000` in local dev (`PORT` in `.env`).

## `POST /api/analyze`

> **DECISION-ARCHITECTURE CHANGE (2026-09-23) — flag to Oleg (frontend),
> Dhruv (OCR/batch) and the extension owner before merging.** The response
> *shape* is backward compatible (every previous field is still present with
> the same type), but the **meaning** of three fields changed:
> - `verdict` is now derived from a deterministic risk level
>   (`low → safe`, `elevated → suspicious`, `high|critical → scam`), not
>   chosen by the LLM.
> - `riskScore` is now the deterministic rule score from ruleset `rs-1.0`,
>   not an LLM "confidence". It is always present.
> - `suggestedAction` is now a fixed policy key string
>   (`"block_sender, report_to_bank"` | `"verify_official_channel"` | `"none"`),
>   not LLM free text. Concrete advice is in the new `actions[]`.
>
> New fields: `risk`, `decision`, `trace`, `actions`, `reduceConcern`,
> `analysis`, `observedSender`, and per-signal `code`, `category`,
> `sourceType`, `tier`, `span`, `metadata`, `scored`, `corroboratedBy`,
> `mergedInto`. Removed: `adjustedRiskScore` (the community contribution is
> now inside `riskScore`). `riskAdjustments[]` entries changed shape (see
> below). The same response is returned by `/api/analyze/screenshot` (plus
> `extractedText`) and by each `/api/batch-scan` result, because all three
> call one function: `runPipeline()` in `backend/src/services/pipeline/index.js`.

**Principle:** code verifies facts, AI interprets language, the
deterministic engine decides. The LLM never computes the score, the level,
the verdict or the actions. **If the LLM is down, times out or returns
garbage, this route still returns `200` with a full deterministic
assessment**; `analysis.semantic.status` says which.

### Request

```json
{
  "message": "string, required, 1-5000 characters",
  "language": "string, optional — hint: \"en\" | \"fr\" | \"kreol\" | \"mixed\" (picks the explanation language; auto-detected otherwise)",
  "pageUrl": "string, optional — the URL of the page `message` was extracted from (e.g. the extension's \"Scan This Page\"). Used ONLY to derive a hostname so links to the scanned page's own site are not flagged as \"not an official domain\" relative to itself (URL-08); never fetched, never treated as a claim about the message, and a malformed value is silently ignored rather than rejected.",
  "paymentContext": {
    "amount": "number >= 0, optional",
    "currency": "string <= 200, optional",
    "method": "optional: bank_transfer | mobile_money | card | cash | cheque | gift_card | voucher | crypto | money_transfer_service | other",
    "recipient": "string <= 200, optional — who the money would go to",
    "claimedOrganisation": "string <= 200, optional — who the request claims to be from",
    "onCallNow": "boolean, optional — is someone on the phone / messaging you while you pay?",
    "accountNumber": "string <= 40, optional — account the money would go to; only its last 4 digits are kept (compared with a supplier's account on record, EMAIL-06)"
  },
  "emailContext": { /* optional - workplace email metadata, see "Email analysis" below. When present, `message` is the email body and analysis.source is "email". */ }
}
```

`paymentContext` is optional and evaluated **in code** (never turned into
prose for the LLM): `method` in {gift_card, voucher, crypto,
money_transfer_service} → `PAY-02`; `recipient` not matching
`claimedOrganisation` → `PAY-05`; `onCallNow: true` → `PAY-06`. An invalid
`paymentContext` returns `400` with a field-specific message.

### Response — `200 OK`

```jsonc
{
  "verdict": "safe" | "suspicious" | "scam",          // derived from risk.level
  "riskScore": 46,                                    // == risk.score, deterministic
  "risk": { "score": 46, "level": "low" | "elevated" | "high" | "critical", "confidence": "low" | "moderate" | "high" },
  "decision": "proceed" | "verify_first" | "do_not_pay",
  "signals": [ /* Signal, see below */ ],
  "trace": [                                          // how the score was computed, in order
    { "id": "URL-02", "points": 30, "sourceTypes": ["rule"], "reason": "...", "corroboratedBy": ["ID-01"] },
    { "id": "IX-1", "points": 15, "reason": "Impersonation combined with a payment or credential request" },
    { "id": "CAP-SEMANTIC", "points": -8, "reason": "AI-inferred evidence alone is capped at 30 points" },
    { "id": "FLOOR-SEC01-INSTITUTION", "levelFloor": "high", "points": 15, "reason": "..." }
  ],
  "actions": [ { "id": "dont_open_link", "text": "Do not open the link in this message." } ],
  "reduceConcern": [ "string — checks that would LOWER concern; never claims the message is safe" ],
  "suggestedAction": "block_sender, report_to_bank" | "verify_official_channel" | "none",
  "explanation": "string — deterministic template (en/fr/kreol) built from the decision, never model free text",
  "riskCategories": { "identity_risk": "LOW|MEDIUM|HIGH", "behavioral_risk": "...", "payment_risk": "...", "technical_risk": "...", "verification_risk": "..." },
  "sender": "string, optional — observed sender (From:/Sender: line) or the claimed registry institution",
  "observedSender": "string, optional — verbatim From:/Sender: value",
  "senderReports": "number, optional — only for a trackable sender (not a redaction placeholder, not an official institution)",
  "riskAdjustments": [ { "ruleId": "CW-2", "rulesVersion": "wave-rules-v2", "signalCode": "REP-02", "points": 20, "levelFrom": "high", "levelTo": "critical", "evidenceCount": 8, "auditRef": "uuid" } ],
  "scamProfile": { "type": "MCB_IMPERSONATION | ... | null", "stage": "OTP_REQUEST | ...", "claimedIdentity": "string | null" },
  "journey": { "currentStage": "...", "likelyNextStages": [ { "stage": "...", "reason": "..." } ] },
  "scamDna": { "...": "unchanged" },
  "analysis": {
    "rulesetVersion": "rs-1.3",
    "source": "pasted_text" | "screenshot" | "batch" | "email",
    "inputHash": "sha256 of the normalised (already redacted) text",
    "detectorVersions": { "url": "url-2.0", "lexicon": "lexicon-1.0", "institutions": "institutions-1.0", "community": "wave-rules-v2", "interventions": "interventions-1.1", "email": "email-1.1 (only for email)", "organisation": "org-identity-1.0", "verification": "verification-1.0" },
    "semantic": { "status": "ok" | "unavailable" | "invalid" | "skipped", "model": "string, optional", "provider": "string, optional", "promptVersion": "semantic-1.1", "rejectedSignals": 0, "error": "timeout | provider_unavailable | invalid_json | schema_mismatch, optional" },
    "email": { /* only when emailContext was sent - see "Email analysis" */ }
  }
}
```

`riskAdjustments`, `scamProfile`, `journey`, `sender`, `observedSender`,
`senderReports`, `scamDna` are omitted (never null) when not applicable.
`scamProfile`/`journey` are present when the semantic model supplied a valid
stage **or** a deterministic finding implies one (`SEC-01` → `OTP_REQUEST`,
a `PAY-*` code → `PAYMENT_REQUEST`).

#### Signal

```jsonc
{
  "code": "URL-02",                     // stable reason code - authoritative
  "type": "lookalike_url",              // legacy name kept for existing UI (mapping in services/signals/registry.js)
  "category": "technical" | "identity" | "social" | "payment" | "credential" | "reputation" | "email_identity" | "email_auth" | "email_attachment" | "email_payment",
  "sourceType": "rule" | "lexicon" | "intel" | "semantic_model" | "community",   // authoritative provenance
  "source": "url_parser" | "identity_check" | "llm_analysis" | "community_reports", // legacy bucket: every non-AI signal maps to url_parser/identity_check
  "tier": "V" | "D" | "L" | "S",        // verified / deterministic / lexicon / semantic
  "severity": "low" | "medium" | "high",
  "description": "string",
  "evidence": "string, optional — exact text from the message (or the field value for paymentContext signals)",
  "span": [52, 73],                     // optional, offsets in the normalised message
  "metadata": { },                      // detector details (host, officialDomain, confidence, ...)
  "scored": true,                       // this signal carries its finding's points
  "corroboratedBy": ["ID-01", "semantic_model"], // optional, on scored signals
  "mergedInto": "URL-02"                // on scored:false signals - same fact, no extra points
  // legacy per-type extras are kept: domain, officialDomain, claimedIdentity, actualDomain, beneficiary, domainAgeDays, communityEvidence
}
```

**Every `sourceType: "semantic_model"` signal is AI-inferred** and its
`evidence` has been verified to occur in the submitted message; model
output whose evidence is not in the message, or whose code is not in the
semantic allow-list, is dropped (counted in `analysis.semantic.rejectedSignals`)
and never shown or scored.

#### Reason codes

| Code | Meaning | Emitted by |
|---|---|---|
| URL-01 | Lookalike of an official domain (edit distance scaled by label length) | rule |
| URL-02 | Brand token as the registrable label of an unofficial domain | rule |
| URL-03 | Brand in subdomain or path of an unrelated host | rule |
| URL-04 | Punycode / homoglyph host | rule |
| URL-05 | URL shortener (weak) | rule |
| URL-06 | Raw IP link | rule |
| URL-07 | `user@host` link disguise | rule |
| URL-08 | Verify/log-in/claim call-to-action through an unofficial link | rule |
| ID-01 | Claimed registry institution, link to a non-official host (subdomains of an official domain are official) | rule |
| ID-02 | Claimed institution, payment beneficiary is someone else | rule |
| ID-03 | Suspicious sender identity (reserved) | – |
| ID-04 | Language impersonates an authority | semantic |
| SOC-01..06 | Urgency, threat, secrecy, off-platform, prize/refund, relationship/investment manipulation | lexicon (EN/FR/Kreol) and/or semantic |
| SOC-07 | Instructions aimed at an automated checker (prompt injection) | rule (and semantic) |
| SOC-08 | Asks to bypass normal approval / verification ("skip the usual sign-off", "no need to call to confirm") | lexicon (EN/FR/Kreol) and/or semantic |
| SOC-09 | Free/cracked-download distribution bait ("no survey", "direct download link", "crack"/"keygen"/"serial key"). Brand-agnostic - says nothing about who is claimed as the source; combines with ID-04 (an implausible official-publisher claim) via `rs-1.3`'s IX-6 | lexicon |
| PAY-01..04, PAY-07 | Payment request, unusual method, "safe account", advance fee, bank-details change | lexicon and/or semantic |
| PAY-05, PAY-06 | Recipient mismatch, active coaching | rule (paymentContext) |
| SEC-01, SEC-02 | Share OTP/PIN/password/CVV (negation-aware), remote-access app | lexicon and/or semantic |
| REP-01, REP-02 | Community cluster / wave (CW-1 / CW-2) | community |
| REP-03 | Sender reported ≥ 3 times | community |
| REP-04, REP-05 | Confirmed scam template / known-malicious URL (reserved for intel feeds; floors exist) | intel |
| EMAIL-01..EMAIL-10 | Workplace email evidence from `emailContext` - see "Email analysis" | rule (emailContext + demo registries) |

#### Risk engine (`backend/src/services/risk-engine`, ruleset `rs-1.3`)

`rs-1.1` = `rs-1.0` with every weight, cap, interaction, floor and band
unchanged, plus SOC-08, the EMAIL-* weights / interactions / floor and the
SOC-07 policy described under "Email analysis". `rs-1.0` stays selectable
(`score(signals, ctx, "rs-1.0")`). On the 84-case deterministic eval both
rulesets produce identical results.

`rs-1.2` keeps both published rulesets frozen and adds ORG-01..06. Base
weights: ORG-01 30; ORG-02 link 25 / Reply-To 20; ORG-03 12; ORG-04 3;
ORG-05 40; ORG-06 10. OX-1 adds 15 once for organisation impersonation plus
payment/credential evidence. OX-2 adds 10 once when campaign evidence
corroborates an independent identity/payment/credential fact. Confirmed
organisation fraud has a high floor (`FLOOR-ORG05-CONFIRMED`, score 45).

`rs-1.3` keeps `rs-1.0`/`rs-1.1`/`rs-1.2` frozen and adds SOC-09 (weight 8)
and IX-6 (+15 once, ID-04 + SOC-09 - an implausible official-publisher
claim combined with free/cracked-download bait language). Deliberately not
inflated to reach "high" on its own: that still needs an actual technical
or payment/credential fact (e.g. a download-unlock fee reaching "high"
through the existing IX-1, since ID-04 is already in its `a` list).

1. **Dedupe:** signals about the same link (URL-01..04, URL-08, ID-01 on one
   host) are one finding; the same code from lexicon + semantic is one
   finding; a semantic ID-04 corroborates an existing deterministic
   impersonation finding. The verified member scores; others corroborate.
2. **Points** per code (see `RULESET_RS_1_0.weights`).
3. **Caps:** semantic-only findings (and interactions among them) ≤ 30;
   lexicon-only ≤ 40.
4. **Interactions** (each at most once): IX-1 impersonation + payment/credential +15,
   IX-2 urgency/threat + credential +10, IX-3 secrecy + payment +10,
   IX-4 prize/refund + advance fee +10, IX-5 manipulation + unusual method +15.
5. **Floors** (non-semantic evidence only): known-malicious URL, confirmed
   template, safe account, OTP request + claimed institution, remote access +
   claimed institution → at least `high`; community wave + technical
   impersonation → `critical`.
6. **Bands:** 0–19 low, 20–44 elevated, 45–69 high, 70–100 critical.
7. **Confidence** (separate from risk): `high` when a deterministic finding
   ≥ 20 points (or deterministic + another source family) drives it;
   `moderate` for lexicon + semantic agreement or weaker deterministic
   evidence; `low` when only AI-inferred evidence exists or the semantic
   step failed with nothing else to check. OCR quality `low` downgrades one step.
8. **Decision:** `low → proceed`, `elevated → verify_first`,
   `high|critical → do_not_pay` (semantic-only evidence can never reach it).

#### Community cluster/wave evidence

Rules and compliance controls: `backend/src/services/community-signals/README.md`.
A matching pattern reported by enough **distinct** pseudonymous reporters
adds one `REP-01` (cluster, CW-1) or `REP-02` (wave, CW-2) signal with a
`communityEvidence` object (unchanged fields; `rulesVersion` is now
`"wave-rules-v2"`). Its points come from the risk engine, and a
`risk_audit_log` row records the rule, versions (`wave-rules-v2+rs-1.3`),
evidence ids and the level with and without it (`levelFrom`/`levelTo` in
`riskAdjustments`). The old verdict-escalation logic is gone — crowd
evidence alone is worth 10/20 points (elevated at most) and only the
wave + technical-impersonation floor lifts to critical. `riskCategories`
excludes community signals.

#### Email analysis (`emailContext`, detector `email-1.1`)

Used by the Office.js Outlook task pane in `outlook-addin/`. Same route, same
`runPipeline()`, same risk engine - no separate email verdict. `message` is
the trimmed current-message body.

```jsonc
"emailContext": {                     // every field optional; missing == "not supplied", never suspicious
  "messageId": "string <= 300, optional (never echoed back)",
  "from": { "name": "ABC Supplies Accounts", "address": "finance@abc-supplies.example" },   // or a bare address string
  "replyTo": [ { "name": "...", "address": "..." } ],   // array, or one object/string; <= 10
  "returnPath": "bounce@abc-supplies.example",
  "subject": "string <= 500",           // prepended to the analysed text as "Subject: ..."
  "authentication": { "spf": "pass|fail|softfail|neutral|none|temperror|permerror|unknown", "dkim": "...", "dmarc": "..." },
                                        // anything else -> "unknown" (never "fail")
  "attachments": [ { "name": "Invoice-1182.pdf", "contentType": "application/pdf", "size": 124501 } ],  // metadata only, <= 25
  "urls": [ "https://..." ],            // hrefs extracted by the client; checked by the URL rules, <= 50
  "threadContext": { "previousSenders": [ "finance@abc-supplies.example" ] }, // enables EMAIL-04
  "recipient": "employee@demo-company.example", // mailbox owner; pseudonymised before organisation observation storage
  "senderContext": { "firstSeenAt": "2026-09-01T00:00:00.000Z", "previousMessageCount": 3 }
}
```

The current Outlook client supplies `from`, subject, message ID, attachment
metadata, href targets, recipient, and (where Mailbox 1.8 is supported)
internet-header evidence. It deliberately sends `threadContext` and
`senderContext` as `null` because it does not invent mailbox history. If
headers are unavailable, SPF/DKIM/DMARC remain `unknown` and Reply-To /
Return-Path remain absent; this never becomes a suspicious finding.

Addresses are validated and normalised in code (lower-case, punycode
decoded). A malformed field is a `400` naming the field. **None of this
metadata is sent to the LLM**: the model sees only `Subject:` + body, in the
same single semantic call as any other message.

Response additions (only when `emailContext` was sent):

```jsonc
"analysis": {
  "source": "email",
  "email": {
    "status": "analysed",
    "detector": "email-1.1",
    "availableEvidence": ["from", "displayName", "replyTo", "returnPath", "subject", "authentication", "attachments", "urls", "threadContext"],  // only what was supplied
    "checks": {                          // what was actually compared - never implies a check that had no data
      "supplier": "no_supplier_identified | sender_matches_supplier_record | sender_differs_from_supplier_record",
      "bankDetails": "not_applicable | no_baseline_on_record | no_account_in_message | compared",
      "payee": "not_applicable | no_baseline_on_record | no_payee_in_message | compared",
      "thread": "not_provided | compared",
      "authentication": "not_provided | evaluated",
      "directory": "not_applicable | compared"
    },
    "referenceData": { "suppliers": "demo-suppliers-1.0", "directory": "demo-directory-1.0", "demo": true }
  }
}
```

`observedSender`/`sender` become `from.address`. Email findings are normal
entries in `signals[]`.

Reference data is **demonstration data** (`data/demo-supplier-registry.json`,
`data/demo-organisation-directory.json`, fictional `.example` domains). A
real deployment replaces them with the organisation's vendor master and
directory. Ready-made request bodies: `backend/fixtures/email-demo.json`.

| Code | Emitted when (evidence required) | rs-1.3 points |
|---|---|---|
| EMAIL-01 | A Reply-To's registrable domain differs from From's (not when both belong to the same known supplier / our org). Return-Path is never a signal. | 8 |
| EMAIL-02 | Email claims a known supplier (display name, or subject when the sender is external, or a look-alike of its domain) but From is not on the supplier's domains | lookalike 30 / unrelated 20 |
| EMAIL-03 | Authentication supplied AND DMARC not pass: DMARC fail (on a supplier / org domain: `dmarc_fail_known_domain`), SPF+DKIM fail, or one failing with the other unknown. DMARC pass, SPF fail with DKIM pass (forwarding), or missing data -> nothing. | 15 / 8 / 6 / 3 |
| EMAIL-04 | `threadContext.previousSenders` supplied AND sender not in it AND domain differs from all previous (look-alike of one, or one other domain) | lookalike 25 / different_domain 8 |
| EMAIL-05 | Attachment name/type only: double extension (`invoice.pdf.exe`), document name with active content type, or risky type (`.html .htm .svg .iso .img .exe .js .vbs .scr .lnk ...`). A PDF/Office/image is never flagged. Nothing is opened or fetched. | double / mismatch 15, risky 8 |
| EMAIL-06 | Supplier identified AND it has an account on record AND the message / `paymentContext.accountNumber` gives a different last-4 | 30 |
| EMAIL-07 | Supplier identified AND it has known payees AND a labelled payee ("Beneficiary: ...") or `paymentContext.recipient` matches none | 30 |
| EMAIL-08 | Display name contradicts the address: embeds another domain's address, names a registry institution, or a senior title on a personal (freemail) address - only if EMAIL-02/09 did not already report it | 20 / 20 / 12 |
| EMAIL-09 | External sender whose display name is a directory person (not their address), or a look-alike of our own domain | 30 |
| EMAIL-10 | A deterministic payment request from an address at a known supplier's domain that is not on record | 8 |

**Dedupe:** EMAIL-02/04/08/09 carry `metadata.host` = the sender domain and
join the per-host group with any URL finding for that domain (one fact).
EMAIL-06 absorbs PAY-07, EMAIL-07 absorbs PAY-05/ID-02 (the record-backed
code scores, the other corroborates). Absorbed codes still count for
interactions.

**Interactions** (each once; EX-6 / EX-1 / EX-3 share one group, only the first applies):
EX-6 thread sender changed + payment-detail/payee change +15;
EX-1 supplier identity mismatch + payment request +15;
EX-3 colleague/executive impersonation + payment request +15;
EX-4 Reply-To mismatch + credential request or look-alike link +10;
EX-5 DMARC fail on a known domain + payment request +10.
**Floor** `FLOOR-EX2-EMAIL06-IDENTITY`: EMAIL-06 + any of EMAIL-01/02/04/08/09 -> at least `high`.

**SOC-07 policy** (`POLICY-SOC07-SEMANTIC` in `trace`): when a message
contains instructions aimed at automated checkers, AI-inferred findings stay
visible but cannot raise the level above what non-semantic evidence (plus
SOC-07 itself) supports. Applies to every source, not only email.

**False-positive safeguards:** each weak signal alone stays `low` (<20):
Reply-To 8, auth anomaly <= 15, attachment <= 15, unfamiliar supplier
address 8, thread newcomer 8; "external sender" is never a signal. All weak
email signals together reach only `elevated`. `high` needs an identity fact
plus a payment fact, a record-backed payment change plus an identity
anomaly, or strong language evidence.

**Passing SPF/DKIM/DMARC never means safe.** A compromised real mailbox
passes authentication; the payment-change check against the supplier record
(EMAIL-06/07) and the language checks (SOC-01/03/08, PAY-*) still apply.

**Email-specific actions** (`interventions-1.1`, deterministic):
`supplier_dont_use_details`, `supplier_contact_known`,
`supplier_verify_verbally` (EMAIL-06/07, or supplier identity + payment);
`exec_hold_transfer`, `exec_normal_approval`, `exec_no_email_contacts`
(EMAIL-09); `phish_no_password`, `phish_open_independently` (email + link /
credential findings, replacing the SMS wording); `dont_open_attachment`
(EMAIL-05); `dont_reply_to_address` (EMAIL-01).

#### Organisation intelligence and verification

Email results also include `analysis.organisation` with a pseudonymous
`observationId`, sender relation, duplicate-safe history/reputation counts,
and any deterministic campaign matches. `verification` contains matched
profile workflows (`id`, `owner`, `steps`, `requiredApprovals`,
`triggeredBy`). These are UI instructions; FraudLens does not contact anyone.

Campaigns require at least three independently flagged observations within
14 days sharing a concrete indicator: sender/reply domain or pseudonymous
freemail address, link host, normalized message-template hash, changed
account last-4, payee key, or risky attachment pattern. They also require
two recipients, two senders, or a strong account/payee/link indicator.
Claimed brand/company names are never indicators. The observation key hashes
Message-ID (when supplied), content fingerprint and recipient pseudonym, so
re-analysis is a no-op while copies sent to different recipients remain
distinct.

`GET /api/org/campaigns` lists active campaigns for the configured
organisation. `POST /api/org/outcomes` accepts `{ observationId, label }`.
Primary labels are `confirmed_phishing`, `confirmed_bec`,
`supplier_impersonation`, `false_positive`, `legitimate`, and
`insufficient_evidence`; `confirmed_fraud` and `suspicious_unconfirmed` are
retained for compatibility with the partial implementation. Outcomes affect
explainable reputation lookups only; there is no live retraining.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "message is required and must be a non-empty string" }` | `message` missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "message exceeds maximum length of 5000 characters" }` | `message.length > 5000` |
| `400` | `{ "error": "paymentContext.<field> ..." }` | invalid `paymentContext` |
| `400` | `{ "error": "emailContext.<field> ..." }` | invalid `emailContext` (wrong type, unparsable address, too many entries) |
| `500` | `{ "error": "analysis failed, try again shortly" }` | unexpected internal error only. **An LLM outage, timeout, invalid JSON or schema failure is no longer an error** — it returns `200` with `analysis.semantic.status` = `unavailable`/`invalid`. |
| `429` | `{ "error": "too many analyze requests, try again shortly" }` | per-IP rate limit exceeded (20 req/15min) |

## `POST /api/analyze/screenshot`

Not in the original placeholder contract — added to wire up screenshot/OCR
ingestion (`backend/src/services/ocr/`, tesseract.js `eng+fra`). Runs OCR,
redacts the extracted text server-side, then runs it through the same
`runPipeline()` as `/api/analyze` (with `analysis.source: "screenshot"`).

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

The full `/api/analyze` response (see above) plus:

```json
{ "extractedText": "string — redacted OCR output that was actually analyzed" }
```

The UI deliberately uses only `extractedText` (the user reviews/corrects it,
then submits it to `/api/analyze`).

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
| `500` | `{ "error": "analysis failed, try again shortly" }` | unexpected internal error after OCR succeeded. An LLM outage is **not** an error (see `/api/analyze`). |
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
  "results": [ "each item = the full /api/analyze response (see above) + { message: string (echoed), analysisFailed: boolean }" ],
  "summary": { "total": "number", "scamCount": "number", "suspiciousCount": "number", "safeCount": "number", "unanalyzedCount": "number" }
}
```

Each message runs through `runPipeline()` (`analysis.source: "batch"`).
**An LLM outage no longer fails an item**: the item still gets a normal
deterministic assessment (`analysis.semantic.status: "unavailable"`) and is
counted in scam/suspicious/safe as usual.

`verdict: "unknown"` + `analysisFailed: true` is now reserved for an
*unexpected* pipeline error on that item. Such an item is synthesized as
`{ message, verdict: "unknown", signals: [], suggestedAction: "verify_official_channel", explanation: "Analysis failed for this message.", analysisFailed: true }`
and is counted only in `unanalyzedCount`, never in the three real verdict
counts (`buildSummary` in `backend/src/services/batch/index.js`). A batch
never returns a top-level 5xx.

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

## `POST /api/check-sender`

Not in the original placeholder contract — added as the read-only
counterpart to `/api/report` (which increments the count as a side effect).
Built for the "Before You Pay" flow: it needs to show "this recipient has
been reported N times" for a payment recipient identifier the user typed in,
without that lookup itself inflating the count. Reuses `getReportCount()`
(`backend/src/db/index.js`) — the exact same lookup and normalization
`/api/analyze`'s `senderReports` field uses, just callable directly for an
arbitrary identifier instead of only one the LLM extracted.

### Request

```json
{
  "sender": "string, required, non-empty — phone number, short code, or identifier, same normalization as /api/report"
}
```

### Response — `200 OK`

```json
{
  "sender": "string — echoed back from the request",
  "reportCount": "number — 0 if never reported"
}
```

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "sender is required and must be a non-empty string" }` | `sender` missing, not a string, or empty/whitespace-only |
| `429` | `{ "error": "too many check-sender requests, try again shortly" }` | per-IP rate limit exceeded (120 req/15min, same bucket size as `/api/check-url`) |

## `POST /api/report`

### Request

```json
{
  "sender": "string, required, non-empty",
  "message": "string, optional — the (client-redacted) message text. NEW: when present and ≤ 5000 chars, it is re-redacted server-side and reduced to one-way fingerprints (template hash + SimHash + lookalike hosts) for community cluster/wave detection. The text itself is never stored. Oversized/non-string values are ignored, not rejected.",
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

**Evidence note (no shape change):** each report is also stored as a
timestamped `report_events` row with a pseudonymous reporter id (HMAC of the
client IP; raw IP never stored) and deleted after 90 days
(`COMMUNITY_EVENT_RETENTION_DAYS`). Reports keyed on an official identity
(`MCB`, `my.t`, ...) or a redaction placeholder still increment `reportCount`
as before, but never count toward that sender's community reputation.

**Normalization note (no shape change):** `reportCount` now deduplicates
internally via a normalized, digits-only canonical key (`backend/src/db/index.js`),
assuming the `230` Mauritius country code for 8-digit local numbers. So
`"+230 5789 1234"`, `"+23057891234"`, and `"57891234"` all accumulate against
the same underlying count instead of three independent rows. The `sender`
field in the response is unaffected — it still echoes back the raw string
exactly as submitted; only the counting behavior changed.

## `POST /api/check-url`

Used by the browser extension. A bare hostname/URL isn't a scam "message" to
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

## `POST /api/analyze-site`

Not in the original placeholder contract — added for the extension's
**Security Report** feature (`extension/README.md`). Passive-only: this
route never sends crafted payloads, fuzzes, or brute-forces the target
site — see `backend/src/services/site-security/index.js`'s header comment
for the exact constraint. `url` is attacker-influenced input (this is a
public route), so it's validated against an SSRF guard
(`backend/src/services/site-security/url-safety.js`) before any outbound
request; a malformed or private/internal-resolving URL is a `400`, not a
silent no-op. This is an **additive** change to the locked contract (new
route, no existing route's shape changed) — flagged to Oleg/Dhruv per the
lock policy above, not a silent break.

### Request

```json
{
  "url": "string, required, non-empty — a full http(s) URL, e.g. \"https://example.com/\"",
  "clientSignals": "object, optional — client-collected signals from extension/collect-signals.js (DOM sinks, reflected params, mixed content, insecure forms, vulnerable libraries, third-party scripts, scripts without SRI, password-field count + page protocol, API surface, libraryDataFetchedAt). Loosely validated and capped server-side; omit or send null if none collected.",
  "clientCollectionError": "string, optional — why client-side collection failed, when it did. Adds an info-severity coverage finding; never fails the request."
}
```


### Response — `200 OK`

```json
{
  "url": "string — echoed back from the request",
  "finalUrl": "string | null — the URL actually reached after following redirects, or null if the site could not be reached at all",
  "grade": "\"A\" | \"B\" | \"C\" | \"D\" | \"F\" | \"N/A\" — N/A only when the site could not be reached",
  "score": "number | null — 0-100, null only alongside grade \"N/A\"",
  "scannedAt": "string — ISO timestamp of the server-side scan",
    {
      "category": "string — e.g. \"headers\" | \"framing\" | \"cors\" | \"policy\" | \"disclosure\" | \"tls\" | \"cookies\" | \"exposed-artifacts\" | \"injection-signal\" | \"client-dom\" | \"sri\" | \"credentials\" | \"mixed-content\" | \"forms\" | \"vulnerable-library\" | \"third-party\" | \"api-surface\" | \"network\" | \"coverage\"",
      "severity": "\"info\" | \"low\" | \"medium\" | \"high\"",
      "title": "string",
      "description": "string",
      "evidence": "string, optional — the specific header/cookie name/path/match that triggered this finding",
      "recommendation": "string, optional — one-line fix for this kind of finding"
    }
  ],
  "summary": {
    "severityCounts": "{ high, medium, low, info } — number of findings per severity",
    "categories": "[{ category, area, count, points }] — points actually lost per category after scoring, sorted by points; points always sum to 100 - score",
    "areas": "[{ id, label, status: \"clean\" | \"issues\" | \"not_checked\", score: number | null, findings, pointsLost }] — eight fixed areas (transport, headers, framing, cookies, exposure, page-code, content, third-party)"
  },
  "checks": "[{ id, label, area, status: \"fail\" | \"warn\" | \"pass\" | \"not_run\", severity?, findings?: string[], reason? }] — every check the report runs (44), most pressing first: failures (worst severity first), warnings, passes, then checks that couldn't run with the reason. not_run is never a pass",
  "coverage": {
    "serverChecks": "boolean — false when the site could not be reached",
    "clientSignals": "boolean — false when no page-side signals were collected",
    "libraryDataFetchedAt": "string | null — date of the extension's Retire.js signature data"
  }
}
```

A site that's reachable but merely fails to load a *sub*-check (e.g. TLS
probe times out) still returns `200` with a partial report, not an error —
same "never a naked 5xx for a well-formed request" convention as the other
routes. Only a genuinely unsafe/malformed `url` is a `400`.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "url is required and must be a non-empty string" }` | `url` missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "<SSRF-guard message>" }` | `url` isn't http(s), resolves to a private/loopback/reserved address, or can't be resolved at all |
| `429` | `{ "error": "too many security-report requests, try again shortly" }` | per-IP rate limit exceeded (15 req/15min — tighter than check-url since each call makes roughly a dozen outbound requests to the target site) |

Scoring: the score starts at 100. Each kind of finding costs 25 / 10 / 4 / 0
(high / medium / low / info); repeats of the same kind (e.g. the same cookie
flag missing on several cookies) count a quarter after the first; each
category is capped at 35. Grade: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, else F.
`summary.categories[].points` are these capped values, so they always sum to
`100 - score`.

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

- **Email analysis has a read-mode Outlook add-in (`outlook-addin/`).** It
  analyses only the selected message after the user clicks the task-pane
  button. Microsoft Graph integration and mailbox polling do not exist.
  The supplier registry and organisation directory are **demo data**
  (`data/demo-*.json`) - there is no admin API to load real vendor/directory
  data yet. The email body shares `/api/analyze`'s 5000-character limit, so
  the add-in trims long bodies to 4800 characters after removing recognisable
  quoted history. EMAIL-10 ("new sender") only knows a
  supplier's addresses on record - there is no per-mailbox sender history.
  `extension/` and `frontend/` do not render email-specific UI; the Outlook
  task pane does. Email
  signals arrive in the normal `signals[]` with legacy `type` values the
  frontend already maps.

- **`riskCategories` and `IDENTITY_MISMATCH`/`identity_check` evidence are
  now computed on all three analyze routes** (`/api/analyze`,
  `/api/batch-scan`, `/api/analyze/screenshot` — the last one wired in
  2026-09-22, verified live with a real ImageMagick-generated PNG against
  the dev server: OCR extraction → local-model analysis → `riskCategories`
  + `IDENTITY_MISMATCH` all present, same pattern as the manual
  verification method already used for this route per the note below on
  it having no automated HTTP test). No remaining route gap for these two
  fields as of 2026-09-22.
- **Extending `/api/batch-scan` to compute these (2026-09-22) surfaced a
  real, pre-existing bug**: `summarizeBatch()`
  (`backend/src/services/batch/index.js`) was destructuring only five
  known fields (`verdict`/`signals`/`suggestedAction`/`explanation`/
  `analysisFailed`) off whatever the `analyze()` callback returned and
  rebuilding a new object from just those — silently dropping `riskScore`,
  `sender`, and `senderReports` from every batch result even before this
  session's changes existed, and would have dropped the new
  `riskCategories` too. Fixed to spread the full result through instead.
  Batch results now carry the same fields single-message `/api/analyze`
  does (verified live: `riskScore`, `sender`, `senderReports`,
  `riskCategories`, and `IDENTITY_MISMATCH` all present per-result).
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
- **`suggestedAction` is now a fixed policy value** (2026-09-23): one of
  `"block_sender, report_to_bank"`, `"verify_official_channel"`, `"none"`,
  set by `services/interventions` from the deterministic risk level. The
  concrete, per-signal advice is in `actions[]` (`{ id, text }`).
- **Registry domains are unverified** — `data/institution-registry.json`
  entries carry `verification.status: "unverified"` until someone checks
  each domain on the institution's own website. `official_phones` is
  empty on purpose (nothing verified yet).
- **OCR quality is not yet passed to the engine** — `runPipeline()` accepts
  `ocrQuality` (lowers evidence confidence) but the screenshot route does
  not compute it yet.
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
  server-side with `console.error`. `/api/batch-scan`'s per-message
  failure `explanation` is now a fixed string ("Analysis failed for this
  message.") — no `err.message` is returned.
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

## P1 campaign intelligence (additive)

The three analysis routes (`POST /api/analyze`, `/api/analyze/screenshot`,
`/api/batch-scan` per-message results) optionally include:

```ts
observedSender?: string; // explicitly present verbatim in submitted text, separate from claimed sender
scamDna?: {
  fingerprintId: string;
  matchStrength: "new" | "matched";
  relatedReports: number;
  relatedSenders: number;
  relatedDomains: number;
};
```

`scamDna` is only attached to non-safe results with a recognized
`scamProfile.type`. The fingerprint combines the scam type and a normalized
claimed-identity slug (for example `MCB_IMPERSONATION-mcb`). Counts are prior
observations **before this check**: a first sighting has all three related
counts zero and `matchStrength: "new"`. `relatedReports` counts prior analysis
checks, **not** independent community reports or verified victims. Repeated
checks of the same message increment the observation count. A matching type
and identity is a pattern grouping, not proof of a coordinated criminal campaign.

Only explicit observed sender identifiers become sender nodes; the claimed
institution is not fabricated into a sender. Redacted phone placeholders are
not stored as sender identifiers. Phone numbers redacted before analysis
cannot be recovered by the graph. No raw message body is persisted.

### GET /api/campaign/:fingerprintId

Read-only, non-LLM. Returns 404 `{ "error": "campaign not found" }` for an
unknown ID; 400 for IDs longer than 300 characters.

```ts
{
  fingerprintId: string;
  scamType: string;
  claimedIdentity: string | null;
  messageCount: number; // all observations, including the latest check
  senders: string[]; // all distinct observed sender identifiers, sorted
  domains: string[]; // all distinct deterministic lookalike domains, sorted
}
```

Sender community report counts remain a separate lookup through
`POST /api/check-sender`; graph observations never increment those counts.
Campaign and playbook reads share the existing 120 requests / 15 minutes / IP
read limiter. Campaign metadata is public in this unauthenticated demo, like
the existing sender report counts; no per-user private campaign storage is claimed.

### GET /api/sandbox/playbooks

Returns `{ maxTurns: 5, playbooks: [{ scamType, label, typicalStages: string[] }] }`.
This is the authoritative ordered stage list for the simulation UI.

### POST /api/sandbox/next

Request: `{ scamType: string, stage: string, turnIndex: number }`.
The type and stage are normalized against the finite enums above; the stage
must belong to that type's `typicalStages`. `turnIndex` is a non-negative safe
integer, starting at zero. Invalid input returns 400. Body limit 10kb;
30 requests / 15 minutes / IP, 429 when exceeded.

### GET /api/trends

Read-only, non-LLM, no request body. Real aggregate counts for the Radar
page — every number comes from the `reports` and `scam_dna*` tables
(`backend/src/db/index.js`'s `getTrendSummary()`); nothing here is
synthesized or seeded for demo effect. On a fresh/empty database every array
is `[]` and every total is `0` — the frontend must render that honestly
(see `checklist.md` / root `CLAUDE.md`'s "no fake live statistics" rule),
not pad it with invented activity.

```ts
{
  totals: { reportedSenders: number; totalReports: number; campaigns: number; domains: number };
  topSenders: { sender: string; reportCount: number }[]; // top 5 by reportCount
  topCampaigns: { fingerprintId: string; scamType: string; claimedIdentity: string | null; messageCount: number }[]; // top 5 by messageCount
  scamTypeCounts: { scamType: string; campaigns: number; messages: number }[]; // one row per scamType observed, no fixed order guarantee beyond messages DESC
}
```

`topSenders.sender` is masked to its last 4 digits (`"•••• 1234"`) when the
underlying identifier is phone-number-shaped (6+ digits); a brand/identity
name (`"MCB"`) is shown as-is, since it isn't personally identifying. This is
a public leaderboard, unlike `POST /api/check-sender`'s exact-match lookup —
it surfaces senders nobody specifically searched for, hence the masking.
Shares the 120 requests / 15 minutes / IP read limiter used by
`/check-sender` and `/campaign/:fingerprintId`.

```ts
{
  simulated: true;
  ended: boolean;
  scamType: string;
  stage: string;
  turnIndex: number;
  typicalStages: string[];
  nextStage: string | null;
  line: string | null;
  tactic: { label: string; explanation: string };
  source: "llm" | "scripted" | "ended";
}
```

`turnIndex >= 5` returns `ended: true`, `line: null`, `nextStage: null`,
`source: "ended"` without an LLM call. Earlier turns return one line. A null
`nextStage` indicates the last playbook stage or turn budget; the client then
shows its simulation-ended recap. This endpoint is stateless: it does not
track sessions or authorize communication. It **never enables real
communication**. The UI must label every line as a simulation.

Generation uses the same local/hosted-fallback `callLLM` transport as analysis,
grounded in that stage's fixed example lines. Model JSON is validated, lines
are limited to 240 characters, and contact details, links, multiline output,
and markup are rejected. On transport failure or invalid output, the response
uses a deterministic example selected by `turnIndex` (no 502). Tactic labels
and explanations always come from the fixed playbook, never the model.
Live LLM latency and hosted-fallback reachability still need a pre-demo check;
the scripted fallback keeps the lesson available during an outage.
