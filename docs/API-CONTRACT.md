# API Contract (as implemented)

**Status: LOCKED.** This documents the backend routes as implemented in
`backend/src/routes/index.js`, `backend/src/services/pipeline/index.js`, and
`backend/src/index.js`. Shapes change only additively, and only when this
file and every consumer (frontend, extension, Outlook add-in) are updated
together.

Base URL: `http://localhost:4000` in local dev (`PORT` in `.env`).

## Routes at a glance

Every route with a body declares its own JSON body limit. A body over it gets
`413 { "error": "request body is too large" }`, and malformed JSON gets
`400 { "error": "invalid JSON body" }` (`backend/src/services/http-errors`).
Rate limits are per client IP and return `429` with a JSON `error` and
standard `RateLimit-*` headers. There is no authentication on any route.

| Method and path | Body limit | Rate limit |
|---|---|---|
| `POST /api/analyze` | 300kb | 20 / 15 min (analyze) |
| `POST /api/analyze/screenshot` | 8mb | 20 / 15 min (analyze) |
| `POST /api/analyze/document` | 14mb | 20 / 15 min (analyze) |
| `POST /api/analyze/conversation` | 3mb | 20 / 15 min (its own counter) |
| `POST /api/documents` | 20mb | 15 / 15 min |
| `POST /api/batch-scan` | 300kb | 10 / 15 min |
| `POST /api/text-profile` | 60kb | 600 / 15 min |
| `POST /api/check-url` | 10kb | 120 / 15 min |
| `POST /api/analyze-site` | 300kb | 15 / 15 min |
| `POST /api/check-sender` | 10kb | 120 / 15 min (read) |
| `POST /api/check-payee` | 10kb | 120 / 15 min (read) |
| `POST /api/report` | 300kb | 5 / hour (report) |
| `GET /api/campaign/:fingerprintId` | none | 120 / 15 min (read) |
| `GET /api/org/campaigns` | none | 120 / 15 min (read) |
| `POST /api/org/outcomes` | 10kb | 5 / hour (report) |
| `GET /api/trends` | none | 120 / 15 min (read) |
| `GET /api/sandbox/playbooks` | none | 120 / 15 min (read) |
| `POST /api/sandbox/next` | 10kb | 30 / 15 min |
| `GET /health` | none | none |
| `GET /health/llm` | none | none |
| `GET /health/document-forensics` | none | none |

Routes marked "(analyze)", "(read)" or "(report)" share one limiter per
group, and so one counter per IP: for example, five `/api/org/outcomes` calls
use up the same hourly budget as five `/api/report` calls.

## `POST /api/analyze`

The same response is returned by `/api/analyze/screenshot` (plus
`extractedText` and `imageForensics`), by `/api/analyze/document` (plus
`documentId`, `extractedText` and `document`), by `/api/analyze/conversation`
(plus `conversation`) and by each `/api/batch-scan` result, because all of
them call one function: `runPipeline()` in
`backend/src/services/pipeline/index.js`.

The compatibility fields are computed by the deterministic engine, never by
the LLM:

- `verdict` is derived from the risk level (`low → safe`,
  `elevated → suspicious`, `high|critical → scam`).
- `riskScore` is the deterministic rule score from the active ruleset
  (`rs-1.6`). It is always present.
- `suggestedAction` is a fixed policy key (`"block_sender, report_to_bank"` |
  `"verify_official_channel"` | `"none"`) set by `services/interventions`.
  Concrete advice is in `actions[]` (`{ id, text }`).

There is no `adjustedRiskScore`; the community contribution is inside
`riskScore`.

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
  "shareSamples": "boolean, optional, default true — false = store nothing derived from this request (see \"Sharing samples\" under /api/analyze)",
  "pageForms": "array, optional, at most 10 — Scan This Page only, ignored without pageUrl: [{ actionHost: string|null (where a password/card form submits; null = the page itself), hasPassword: boolean, hasCard: boolean }]. Field values are never sent. Feeds URL-10. A malformed value is a 400.",
  "channel": "string, optional — how the user says the message arrived (the web Check screen's \"Received by\"): \"sms\" | \"whatsapp\" | \"email\" | \"facebook\" | \"call\". Context only: passed to the semantic model as a labelled, may-be-wrong hint (prompt semantic-1.3) and echoed as analysis.channel; it never adds a signal or changes the score. Any other value is a 400 (\"channel must be one of: ...\").",
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
`paymentContext` returns `400` with a field-specific message. No current
client (web app, extension, Outlook add-in) sends `paymentContext`; the web
app's Before You Pay screen uses `POST /api/check-payee` instead.

#### Sharing samples (`shareSamples`)

Accepted by `/api/analyze`, `/api/analyze/screenshot`, `/api/analyze/document`,
`/api/analyze/conversation` and `/api/batch-scan`
(`backend/src/services/sharing`). By default an analysis may add to
FraudLens's shared evidence: a community evidence event (message fingerprint
hashes, normalised sender, claimed brand, lookalike hosts, a hashed reporter
IP, never the message text), a ScamDNA observation (claimed identity, sender,
lookalike domains), Radar's daily counters, an organisation email observation
(email analyses only), a batch's summary counts, and, for
`/api/analyze/document`, the uploaded file's original bytes.
`POST /api/documents` does not accept `shareSamples` and always stores the
upload. The web app's
Settings → "Share anonymous scam samples" sends `shareSamples: false` when
turned off; the backend then skips all of those writes. The analysis itself
is unchanged: existing community evidence and known ScamDNA campaigns are
still read (a known campaign still returns `scamDna` with `matchStrength:
"matched"`; an unknown one returns no `scamDna`, and `/api/analyze/document`
returns `documentId: null`). The only write that remains is
`risk_audit_log`, and only when OTHER users' community evidence changed this
verdict: it records the rule and those evidence rows so the adjusted verdict
stays explainable, and holds nothing from this request. Explicit reports
(`POST /api/report`) are a separate user action and are not affected. A
non-boolean value is a `400 { "error": "shareSamples must be a boolean" }`.

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
    "rulesetVersion": "rs-1.6",
    "source": "pasted_text" | "screenshot" | "batch" | "email" | "document" | "conversation",
    "inputHash": "sha256 of the normalised (already redacted) text",
    "detectorVersions": { "url": "url-2.2", "lexicon": "lexicon-1.1", "institutions": "institutions-1.0", "community": "wave-rules-v2", "interventions": "interventions-1.2", "email": "email-1.1 (only for email)", "organisation": "org-identity-1.0", "verification": "verification-1.0", "document": "document-1.0 (only for documents)", "imageForensics": "image-forensics-1.0 (only for screenshots)" },
    "semantic": { "status": "ok" | "unavailable" | "invalid" | "skipped", "model": "string, optional", "provider": "string, optional", "promptVersion": "semantic-1.3", "rejectedSignals": 0, "error": "timeout | provider_unavailable | invalid_json | schema_mismatch, optional" },
    "channel": "sms | whatsapp | email | facebook | call — optional, only when the request sent `channel`",
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
  "category": "technical" | "identity" | "social" | "payment" | "credential" | "reputation" | "email_identity" | "email_auth" | "email_attachment" | "email_payment" | "document_integrity",
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
| URL-01 | Lookalike of an official domain (edit distance scaled by label length), or of a global brand in `data/global-brands.json` (visual fold, or a typo keeping the first letter) | rule |
| URL-02 | Brand token as the registrable label of an unofficial domain; for global brands, the brand (plain or disguised) as one hyphen part (`micros0ft-login.com`) | rule |
| URL-03 | Brand in subdomain or path of an unrelated host | rule |
| URL-04 | Punycode / homoglyph host (NFKC + confusables skeleton; names the institution or global brand imitated when it matches) | rule |
| URL-05 | URL shortener (weak) | rule |
| URL-06 | Raw IP link | rule |
| URL-07 | `user@host` link disguise | rule |
| URL-08 | Verify/log-in/claim call-to-action through an unofficial link | rule |
| URL-10 | Scan This Page: the page text claims a known institution, the page is not its official site, and a password/card form submits cross-site to a host that is neither official nor on the trusted-domains list (SSO). High; rs-1.5 weight 30 plus floor FLOOR-URL10-CREDENTIAL-FORM | rule |
| URL-11 | `/api/check-url` only: the site runs on a tunnel or dynamic-DNS host (ngrok, trycloudflare, duckdns, no-ip …). Medium; no risk-engine weight | rule |
| CERT-01 | `/api/check-url` only: the site's TLS certificate is expired, not yet valid, self-signed, issued for another host, or not trusted. A missing intermediate alone (browsers fill it in) is not reported. High; no risk-engine weight | rule |
| CERT-02 | `/api/check-url` only: a lookalike host (URL-01..04) whose certificate was issued in the last 7 days. Medium; never fires without a lookalike | rule |
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
| DOC-01..DOC-08 | Structural evidence in an uploaded PDF/DOCX - see `POST /api/analyze/document` | rule (document forensics) |
| DOC-09..DOC-13 | Image-forensics findings on a screenshot from the Python service: TruFor (09), error-level analysis (10), layout mismatch (11), image metadata (12), signature inconsistency (13); `metadata.variant` is the service's confidence (high/medium/low) - see `POST /api/analyze/screenshot` | rule (image forensics, `document-forensics-client/toSignals.js`) |

#### Risk engine (`backend/src/services/risk-engine`, active ruleset `rs-1.6`)

`rs-1.1` = `rs-1.0` with every weight, cap, interaction, floor and band
unchanged, plus SOC-08, the EMAIL-* weights / interactions / floor and the
SOC-07 policy described under "Email analysis". `rs-1.0` stays selectable
(`score(signals, ctx, "rs-1.0")`).

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

`rs-1.5` is `rs-1.4` plus URL-10 (weight 30) and floor
FLOOR-URL10-CREDENTIAL-FORM (high, requires a claimed institution). Nothing
else changes, and only Scan This Page requests with `pageForms` can emit
URL-10, so every other analysis scores exactly as under rs-1.4.

`rs-1.6` (active) is `rs-1.5` plus weights for the screenshot image-forensics
codes, keyed by the service's confidence (high / medium / low): DOC-09
30/15/8, DOC-10 18/10/5, DOC-11 15/8/4, DOC-12 8/5/3, DOC-13 15/8/4. DX-1 also
applies to DOC-09 at high or medium confidence. It adds no floor. Only
`/api/analyze/screenshot` can emit DOC-09..13, so every other analysis scores
exactly as under rs-1.5.

`rs-1.4` keeps `rs-1.0`..`rs-1.3` frozen (a test pins their content
fingerprints) and adds the document-forensics weights and interaction DX-1
(see `POST /api/analyze/document`). It adds no floor; its floors are
`rs-1.3`'s. Text-only analyses score identically under `rs-1.3` and `rs-1.4`
because they cannot emit a DOC-* code. The engine supports `anyVariants` on
a floor, which narrows its `any` codes by `metadata.variant` exactly as an
interaction's `aVariants` narrows `a`; no published ruleset uses it.

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
`communityEvidence` object (`rulesVersion: "wave-rules-v2"`). Its points come
from the risk engine, and a `risk_audit_log` row records the rule, versions
(`wave-rules-v2+<active ruleset>`), evidence ids and the level with and
without it (`levelFrom`/`levelTo` in `riskAdjustments`). Crowd evidence alone
is worth 10/20 points (elevated at most), and only the wave +
technical-impersonation floor lifts to critical. `riskCategories`
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

`GET /api/org/campaigns` lists these campaigns and `POST /api/org/outcomes`
records an analyst's label for one observation; both are described in their
own sections below. Outcomes affect explainable reputation lookups and
campaign counts only; there is no live retraining.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "message is required and must be a non-empty string" }` | `message` missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "message exceeds maximum length of 5000 characters" }` | `message.length > 5000` |
| `400` | `{ "error": "paymentContext.<field> ..." }` | invalid `paymentContext` |
| `400` | `{ "error": "emailContext.<field> ..." }` | invalid `emailContext` (wrong type, unparsable address, too many entries) |
| `400` | `{ "error": "shareSamples must be a boolean" }` | `shareSamples` present but not a boolean (same on screenshot, document and batch-scan) |
| `500` | `{ "error": "analysis failed, try again shortly" }` | unexpected internal error only. **An LLM outage, timeout, invalid JSON or schema failure is not an error** — it returns `200` with `analysis.semantic.status` = `unavailable`/`invalid`. |
| `413` | `{ "error": "request body is too large" }` | the body exceeds the route's JSON limit. This applies to every route and is mapped in `backend/src/services/http-errors`. Malformed JSON is `400 { "error": "invalid JSON body" }`. |
| `429` | `{ "error": "too many analyze requests, try again shortly" }` | per-IP rate limit exceeded (20 req/15min) |

## `POST /api/analyze/screenshot`

Screenshot/OCR ingestion (`backend/src/services/ocr/`, tesseract.js
`eng+fra`). Runs OCR, redacts the extracted text server-side, then runs it
through the same `runPipeline()` as `/api/analyze` (with
`analysis.source: "screenshot"`). The image is not stored.

The image also goes through the local Python document-forensics service
(`backend/src/services/document-forensics-client/`: TruFor, Error Level
Analysis, Donut layout comparison, EXIF/metadata, signature consistency)
concurrently with OCR. Its findings become ordinary `DOC-09`..`DOC-13`
entries in `signals[]` (via `document-forensics-client/toSignals.js`, scored
by `rs-1.6`), the same "extraSignals feed runPipeline()" pattern
`/api/analyze/document` uses for PDF/DOCX, so one deterministic verdict covers
both the message's language and the image itself. The LLM only ever sees the
redacted OCR text, never the image or the forensic facts. A down or slow
forensics service degrades to no extra signals and never fails the request;
see `imageForensics.status` in the response.
`analysis.detectorVersions.imageForensics` (`"image-forensics-1.0"`) is
present on every screenshot response, whether or not a DOC-09..13 signal
fired.

### Request

```json
{
  "image": "string, required — base64-encoded image bytes, max 5MB decoded. A `data:<mime>;base64,` prefix is accepted and stripped if present.",
  "language": "string, optional — same free-form hint as /api/analyze",
  "shareSamples": "boolean, optional, default true — see /api/analyze \"Sharing samples\""
}
```

The image type is **not** taken from a client-supplied field — there isn't
one. The decoded bytes are sniffed by magic number and must be PNG, JPEG, or
WEBP, regardless of anything the client claims.

### Response — `200 OK`

The full `/api/analyze` response (see above) plus:

```json
{
  "extractedText": "string — redacted OCR output that was actually analyzed",
  "imageForensics": {
    "status": "\"ok\" | \"unavailable\" — whether the forensics service actually ran",
    "checksRun": "string[] — which of metadata_pdf/error_level_analysis/trufor/layout_comparison actually executed (the service escalates only when cheaper checks are inconclusive)",
    "checksSkipped": "{ check: string, reason: string }[] — the rest, and why"
  }
}
```

The UI never shows `extractedText` to the user - the screenshot thumbnail is
the only visible confirmation of what was scanned. The text is held in
memory client-side and submitted to `/api/analyze` once "Check" is pressed.
`imageForensics` is transparency about what ran, not a second verdict — its
actual findings are already in `signals[]` as `DOC-09`..`DOC-13`.

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

## `POST /api/analyze/document`

Document forensics for PDF/DOCX. The route looks
for structural warning signs in an uploaded PDF or Word (.docx) file: a
signature pasted onto a scan, text typed onto a scan, a change after
digital signing, editing-tool metadata, hidden text and active content. It
also runs the document's text through the same `runPipeline()` as every
other route.

The result is **one deterministic verdict**. The structural findings are
ordinary `DOC-*` entries in `signals[]`, scored by the active ruleset (their
weights were added in `rs-1.4` and are unchanged since). The LLM sees
only the redacted text, never the file, its images or the forensic facts.
An LLM outage still returns `200` with the full deterministic verdict.

A PDF's uploaded bytes are also stored byte-exact in SQLite
(`backend/src/services/document-store/`, the same storage `POST
/api/documents` below uses). `documentId` in the response is an internal
reference only, not a public retrieval endpoint (see that route's own
Security note). A DOCX is not stored, because the document store accepts
only PDF and image types, so `documentId` is always `null` for a DOCX.
Storage failing does not fail the analysis; `documentId` is `null` in that
case too.

### Request

```json
{
  "file": "string, required - the file's bytes as base64, or a data URL (the data:...;base64, prefix is stripped). Max 10MB decoded.",
  "fileName": "string, optional - display only; ignored by the backend and never echoed",
  "shareSamples": "boolean, optional, default true - false: the file's bytes are NOT stored (documentId is null) and nothing else is recorded; see /api/analyze \"Sharing samples\"",
  "language": "string, optional - same free-form hint as /api/analyze"
}
```

The type is decided **by magic bytes only**:

- `%PDF-` is a PDF.
- A ZIP (`PK\x03\x04`) must declare a Word main document in
  `[Content_Types].xml`. The .docx/.dotx and macro-enabled .docm/.dotm content
  types all count.

The body limit is 14MB, the base64 size of a 10MB file. The route shares the
analyze rate limit (20 req/15min/IP). Standalone images (a phone photo of a
document, not a proper scan-to-PDF) aren't PDF/DOCX and go through
`POST /api/documents` below instead.

How it runs (`backend/src/services/document-forensics`):

- Parsing happens in a `worker_threads` worker with a 256MB heap limit and a
  hard timeout (`DOCUMENT_TIMEOUT_MS`, default 15s). A hostile or huge file can
  only exhaust that worker, which is then terminated.
- At most 2 documents are analysed at once.
- The first 10 PDF pages are inspected.
- The text comes from the file's text layer when that layer has at least 50
  letters/digits. Otherwise the scans on the first 3 pages are OCR'd.
  `ocrQuality` reaches the engine. An OCR failure is not an error: the result
  then says `textSource: "none"`.
- The text is redacted server-side with the same `redact()` as screenshot OCR.
  **Unlike a screenshot, text over 5000 characters is cut at a line or word
  boundary rather than rejected.** `document.textTruncated` says when that
  happened.

The parsed content (text/previews) is never stored. Only a PDF's raw uploaded
bytes are, per `documentId` above. Like every check, the pipeline may
record the same privacy-minimised aggregate observations (ScamDNA
type/claimed-identity counts) that text checks record.

### Response - `200 OK`

The full `/api/analyze` response (`analysis.source: "document"`,
`analysis.detectorVersions.document: "document-1.0"`) plus:

```jsonc
{
  "documentId": "string (UUID) | null - see Request above",
  "extractedText": "string - the redacted (and possibly truncated) text that was analysed",
  "document": {
    "fileType": "pdf" | "docx",
    "pageCount": 3,            // number | null (DOCX: from docProps/app.xml when present)
    "pagesAnalyzed": 3,        // number | null (null for DOCX); at most 10
    "textSource": "text_layer" | "ocr" | "none",
    "textTruncated": false,
    "metadata": {              // tool names and dates only - author/person fields are never returned
      "producer": "iLovePDF",  // string | null, sanitised, <= 120 chars (DOCX: the Application)
      "creator": "iLovePDF",   // string | null (always null for DOCX)
      "created": "2026-09-01T09:30:00.000Z",   // ISO string | null
      "modified": "2026-09-15T14:12:00.000Z",  // ISO string | null
      "incrementalUpdates": 1, // saved revisions after the first; null for DOCX
      "signed": false          // a digital signature (/ByteRange) is present
    },
    "previews": [              // <= 4, one per flagged pasted image (DOC-04)
      {
        "signalCode": "DOC-04",
        "page": 1,             // null for DOCX
        "widthPx": 116, "heightPx": 44,
        "effectiveDpi": 48,    // pixels per placed inch (the worse axis)
        "backgroundDpi": 150,  // the scan's own dpi; null for DOCX
        "hasAlpha": true,
        "hardEdgeRatio": 1,    // 0..1: opaque pixels next to fully transparent ones vs anti-aliased edge pixels; null if no edges
        "dataUrl": "data:image/png;base64,..."   // <= 256px on the long side, palette PNG
      }
    ]
  }
}
```

A DOC-04 signal that has a preview carries `metadata.previewIndex`, its index in
`document.previews`.

#### Document reason codes (detector `document-1.0`, weights from `rs-1.4`, unchanged in `rs-1.6`)

Each one is a warning sign, not proof. All of them are `sourceType: "rule"` and
`category: "document_integrity"`, which feeds `riskCategories.technical_risk`.
Their legacy `type` has the form `document_*`.

| Code | Emitted when (evidence required) | rs-1.4 points |
|---|---|---|
| DOC-01 | Producer/Creator (Info or XMP), or the DOCX Application/creator fields, name a consumer editing or design tool from `CONSUMER_EDITING_TOOLS` (Canva, iLovePDF, Smallpdf, Sejda, PDFescape, PDF24, Photoshop, GIMP, ...). Word, LibreOffice, scanners and PDF libraries are never flagged. The tools are in `metadata.tools`. | 10 |
| DOC-02 | `after_signature`: bytes were appended after the last signed `/ByteRange`, and they are not DSS/VRI validation data. `incremental_update`: there is a saved revision after the first that is not a signature being added, DSS data or linearization. | 30 / 8 |
| DOC-03 | `mod_before_create` (by more than 60s), `future_date` (more than 24h ahead), or `producer_mismatch` (the Info and XMP producers share no word) | 6 |
| DOC-04 | Only on a **scan page**, meaning a raster covering at least 85% of the page with at most 400 visible text characters. Fires on an image drawn over the scan. `transparent_overlay`: at least 1% of its pixels are transparent. `resolution_mismatch`: below 0.5x the scan's dpi. `overlay`: neither. Stencil masks at or above the scan's dpi (compact/MRC scans) and extra full-page layers are ignored. The DOCX variant `docx_transparent_image` is a floating (`wp:anchor`) PNG with transparency. | 25 / 20 / 10 / 8 |
| DOC-05 | Visible text (render mode not 3/7, not white) drawn on a scan page. The evidence is up to 3 redacted snippets of up to 120 characters each. | 20 |
| DOC-06 | At least 20 hidden characters on a page without a full-page image. Variants: `invisible_render_mode`, `white_text` (only on pages with no images and no coloured fills), `tiny_font` (under 1pt). The hidden text also flows into the pipeline, where SOC-07 can fire. | 10 |
| DOC-07 | PDF: `javascript`, `launch_action`, `embedded_file`, or `submit_form` to an external URL. Found by enumerating every object, including compressed object streams. DOCX: `macro` (`vbaProject.bin`), `external_template` (an attachedTemplate with `TargetMode="External"`; the host is in `metadata.host`), or `ole_object`. Nothing is executed or fetched. | 20 / 30 / 10 / 15; 30 / 30 / 15 |
| DOC-08 | Native pages only. Needs at least 10 visible text items, with one font family on at least half of them. Fires on an amount, account number, IBAN or date item in a family used by at most 2 items. Bold or italic of the same family never counts. The fonts are in `metadata.font` and `metadata.dominantFont`. | 12 |

- Several variants of the same code make one finding, at the strongest weight
  (normal dedupe).
- **DX-1** (+15, applied once) combines a forgery artefact with ID-01..04 or
  PAY-01..07. The forgery artefacts are DOC-04 (not the DOCX variant),
  DOC-05, DOC-08 and DOC-02 `after_signature`.
- There is no document-specific floor. A single heuristic structural signal
  never forces a `high`/`scam` verdict on a claimed-institution document;
  DOC-* signals contribute only through their own weights and DX-1 (see
  `docs/DOCUMENT-FORENSICS.md`).
- Each weak signal alone stays `low`. Alone, DOC-04 (transparent or
  upscaled), DOC-05, DOC-02 after-signing and the high-severity DOC-07 variants
  reach `elevated`, never `high`.
- Actions (`interventions-1.2`): `doc_verify_with_issuer` for a forgery
  artefact, and `doc_dont_enable_content` for DOC-07.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "document is required and must be a base64-encoded string" }` | `file` missing, not a string, or empty |
| `400` | `{ "error": "document could not be decoded as base64" }` | decodes to zero bytes |
| `400` | `{ "error": "document exceeds maximum size of 10MB" }` | decoded file over 10MB |
| `400` | `{ "error": "document must be a PDF or Word (.docx) file (checked by content, not the file name)" }` | unrecognised magic bytes, a ZIP that is not a Word document, or a legacy .doc |
| `400` | `{ "error": "document is password-protected" }` | a PDF that needs a password to open, or a password-encrypted Office file. PDFs with permissions-only encryption open without a password and **are analysed**. |
| `400` | `{ "error": "document could not be read" }` | the file could not be parsed, the worker timed out, or it ran out of memory. The real reason is logged server-side only. |
| `413` | `{ "error": "request body is too large" }` | body over 14MB |
| `429` | `{ "error": "too many analyze requests, try again shortly" }` | shares the 20 req/15min analyze bucket |
| `503` | `{ "error": "document analysis is busy, try again shortly" }` | 2 documents are already being analysed |
| `500` | `{ "error": "analysis failed, try again shortly" }` | unexpected internal error. An LLM outage is **not** an error. |

## `POST /api/documents`

Complementary to `/api/analyze/document` above, not a duplicate: that route
is PDF/DOCX with a full deterministic verdict; this one is for **images**
(a phone photo of a document, not a proper scan-to-PDF) plus PDF
metadata-only checks, using the local `document-forensics/` Python service
(TruFor/Donut ML models — see `docs/DOCUMENT-FORENSICS.md`) for
**indicators with a confidence label, never a verdict** — there is no
`verdict`, `riskScore`, or `signals` in this route's response, matching the
existing pattern `scanForErrorSignatures()` uses in
`backend/src/services/site-security/checks.js`. It stores the uploaded
bytes unmodified (`backend/src/services/document-store/`) rather than
discarding them.

### Request

```json
{
  "document": "string, required — base64-encoded file bytes, max 15MB decoded. A `data:<mime>;base64,` prefix is accepted and stripped if present.",
  "filename": "string, optional — original filename as reported by the browser, stored as-is, never trusted for the file's actual type"
}
```

The document type is **not** taken from a client-supplied field. The
decoded bytes are sniffed by magic number and must be PDF, PNG, JPEG, or
WEBP, regardless of anything the client or `filename` claims.

### Response — `201 Created`

```json
{
  "documentId": "string (UUID) — internal id; not itself a public retrieval endpoint (see Security below)",
  "mimeType": "\"application/pdf\" | \"image/png\" | \"image/jpeg\" | \"image/webp\"",
  "byteLength": "number",
  "receivedAt": "string — ISO timestamp",
  "extractedText": "string | null — redacted OCR text for an image document; always null for a PDF (its text layer, if any, is read by the metadata/PDF forensics check instead)",
  "forensics": {
    "status": "\"ok\" | \"unavailable\"",
    "reason": "string, only present when status is \"unavailable\" — the forensics service was unreachable, timed out, or errored. Never fails the request (see Reliability below).",
    "report": {
      "_": "only present when status is \"ok\" — see document-forensics/app/models.py's ForensicsReport for the source of truth; this is that schema's fields camelCased at the Node boundary (backend/src/services/document-forensics-client/index.js), e.g. checks_run -> checksRun",
      "documentId": "string | null",
      "mimeType": "string",
      "confidence": "\"low\" | \"medium\" | \"high\" | null — confidence IN the indicators found, never a verdict; null means no indicators were found",
      "summary": "string — \"no tampering indicators found\" when indicators is empty; never \"authentic\" or \"verified\"",
      "indicators": "[{ check, title, description, confidence, evidence }]",
      "signature": "{ present, note, indicators } | null — a separate, narrower claim (internal stroke consistency only); never identity verification, see docs/DOCUMENT-FORENSICS.md",
      "checksRun": "string[]",
      "checksSkipped": "[{ check, reason }]",
      "scannedAt": "string — ISO timestamp"
    }
  }
}
```

### Reliability

`forensics` never fails this request. The Python service is a separate
local process (`document-forensics/`); if it isn't running, is unreachable,
times out, or errors, `forensics.status` is `"unavailable"` and every other
field in the response is still returned normally — same "enrichment, not a
precondition" stance `/api/analyze`'s response takes toward an LLM outage
(`analysis.semantic.status`). A cold forensics process (first call after it
starts) can take up to `DOCUMENT_FORENSICS_TIMEOUT_MS` (90s by default,
`backend/.env.example`) before degrading, since PyTorch/transformers model
load happens on the first request that actually needs it.

### Security

There is no `GET /api/documents/:id` route. A stored document can contain a
bank statement, an ID, or other sensitive personal data, and this backend
has no per-user auth layer — a UUID alone is not real access control, so
byte retrieval is only ever an internal function call
(`getStoredDocument()`), never a public HTTP path.

Stored bytes, the client-supplied `filename`, MIME type, size, SHA-256 and
receive time are kept in the SQLite `documents` table, unencrypted. There is
no retention period and no delete route.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "document is required and must be a base64-encoded string" }` | `document` missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "document could not be decoded as base64" }` | decoding `document` (after stripping any `data:...;base64,` prefix) produces a zero-length buffer |
| `400` | `{ "error": "document exceeds maximum size of 15MB" }` | decoded buffer exceeds 15MB |
| `400` | `{ "error": "document must be a valid PDF, PNG, JPEG, or WEBP file (checked by content, not the declared type)" }` | magic-byte sniff doesn't match any supported type |
| `429` | `{ "error": "too many document-check requests, try again shortly" }` | per-IP rate limit exceeded (15 req/15min, its own counter, separate from the analyze routes) |

A failure of OCR itself is not an error for this route: ingestion has
already succeeded and the bytes are safely stored by the time OCR runs, so
`extractedText` is simply `null` if OCR throws.

## `POST /api/batch-scan`

### Request

```json
{
  "messages": ["string, required — 1-50 items, each 1-5000 characters"],
  "shareSamples": "boolean, optional, default true — false: no batch history row and no per-message evidence is stored; see /api/analyze \"Sharing samples\""
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
**An LLM outage does not fail an item**: the item still gets a normal
deterministic assessment (`analysis.semantic.status: "unavailable"`) and is
counted in scam/suspicious/safe as usual.

`verdict: "unknown"` + `analysisFailed: true` is reserved for an
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

## `POST /api/analyze/conversation`

Analyses a whole chat as ONE message: the other party's messages, in order,
are joined into a single transcript and run through `runPipeline()` once
(`backend/src/services/conversation`, `analysis.source: "conversation"`).
That keeps every guarantee of `/api/analyze` — one deterministic verdict and
score, grounded semantic evidence, the same intervention policy — instead of
a separate, inconsistent verdict per bubble. The caller's own ("me") messages
are accepted and echoed back via indices but are never analysed.

### Request

```json
{
  "messages": [
    { "from": "me" | "them", "text": "string, required, 1-5000 characters" }
  ],
  "language": "string, optional — same free-form hint as /api/analyze",
  "shareSamples": "boolean, optional, default true — see /api/analyze \"Sharing samples\""
}
```

`messages`: 1-500 items, at least one `"them"` message. Longer chats keep the
most recent `"them"` text up to 12,000 characters combined; the response says
where analysis started (`conversation.firstAnalysedIndex`).

### Response — `200 OK`

The full `/api/analyze` response (see above; `verdict`, `signals`,
`suggestedAction`, `explanation`, `riskScore`, `actions`, `scamProfile`,
`journey`, `scamDna`, `analysis`, …) plus:

```jsonc
{
  "conversation": {
    "messageCount": 4,          // messages.length, as sent
    "theirMessageCount": 3,     // how many were from "them"
    "analysedMessageCount": 3,  // how many of those fit in the 12,000-char budget
    "truncated": false,         // true when older "them" messages were dropped
    "firstAnalysedIndex": 0,    // index (into `messages`) analysis started at, or null
    "flags": [
      { "index": 3, "code": "SEC-01", "severity": "high", "label": "Requested a one-time code", "evidence": "the OTP you received" }
    ],
    "stages": [
      { "stage": "TRUST_BUILDING", "index": 2 }
    ]
  }
}
```

`flags`: one entry per signal whose evidence quote is grounded inside one of
the `"them"` messages (community-sourced signals, which describe the sender
rather than quote text, are never attached). `label` is the signal's display
name (`backend/src/services/signals/registry.js`); `evidence` is the exact
quoted text, already redacted the same way the request was. `stages`: the
first message index each fixed playbook stage (`backend/src/services/
playbooks`) was observed at, via a fixed signal-code → stage table
(`CODE_STAGE` in `backend/src/services/conversation/index.js`); only signal
codes whose meaning maps onto one stage unambiguously are included.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "messages must be a non-empty array" }` | `messages` missing, not an array, or empty |
| `400` | `{ "error": "messages exceeds the maximum of 500" }` | `messages.length > 500` |
| `400` | `{ "error": "every message must be an object" }` | an item is not an object |
| `400` | `{ "error": "every message needs from: \"me\" or \"them\"" }` | an item's `from` is missing or not `"me"`/`"them"` |
| `400` | `{ "error": "every message needs non-empty text" }` | an item's `text` is missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "every message must be 5000 characters or fewer" }` | an item's `text` exceeds 5000 characters |
| `400` | `{ "error": "the conversation has no messages from the other person" }` | every message has `from: "me"` |
| `400` | `{ "error": "shareSamples must be a boolean" }` | `shareSamples` present but not a boolean |
| `429` | `{ "error": "too many conversation checks, try again shortly" }` | per-IP rate limit exceeded (20 req/15min) |
| `500` | `{ "error": "conversation analysis failed" }` | unexpected internal error only — an LLM outage/timeout/invalid JSON is not an error; it returns `200` with `analysis.semantic.status` not `"ok"`, same as `/api/analyze` |

## `POST /api/check-sender`

The read-only counterpart to `/api/report` (which increments the count as
a side effect). Used by the "Before You Pay" flow to show "this recipient has
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

## `POST /api/check-payee`

The "Before paying" payee check (`backend/src/services/payee-check`). It is
deterministic: no LLM and no outbound call. Like `/api/check-sender` it is
read-only; the lookup never counts as a report, and the identifier, name and
amount are neither stored nor logged. It cannot know who an account or number
is registered to, so it never says whether a name matches.

### Request

```json
{
  "method": "string, required — \"phone\" | \"bank_account\" | \"iban\"",
  "identifier": "string, required, non-empty, at most 64 characters — the number, account or IBAN",
  "name": "string, optional, at most 100 characters — who the payee claims to be",
  "amount": "number, optional, 0 to 1e12 — in rupees",
  "purpose": "string, optional — \"car\" | \"rent_deposit\" | \"online_shop\" | \"family\" | \"invoice\""
}
```

### Response — `200 OK`

```jsonc
{
  "method": "phone",                   // echoed
  "purpose": "online_shop",            // echoed, only when sent
  "verdict": "stop" | "caution" | "clear", // stop if any finding is red, caution if any is amber
  "findings": [ { "code": "PHONE_VALID", "severity": "red" | "amber" | "ok", "params": { } } ],
  "reportCount": 0                     // same count /api/check-sender returns for the identifier
}
```

Finding codes: `REPORTED` (red, reported at least once), `NOT_REPORTED`
(ok); for an IBAN `IBAN_FORMAT_INVALID`, `IBAN_CHECKSUM_FAILED`,
`IBAN_LENGTH_WRONG` (red), `IBAN_FOREIGN` (amber) or `IBAN_VALID` (ok); for
a phone `PHONE_VALID` (ok, an 8-digit Mauritian mobile starting with 5) or
`PHONE_NOT_MU_MOBILE` (amber); for a bank account `ACCOUNT_FORMAT_ODD`
(amber, not 6-20 digits); `ORGANISATION_ON_PERSONAL_NUMBER` (amber, `name`
names a registry institution on a phone payee); `LARGE_AMOUNT` (amber,
`amount` of Rs 50,000 or more).

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "request body must be an object" }` | body is not a JSON object |
| `400` | `{ "error": "method must be one of: phone, bank_account, iban" }` | missing or unknown `method` |
| `400` | `{ "error": "identifier is required and must be a non-empty string" }` | missing or empty `identifier` |
| `400` | `{ "error": "identifier exceeds maximum length of 64 characters" }` | `identifier` over 64 characters |
| `400` | `{ "error": "name must be a string of at most 100 characters" }` | invalid `name` |
| `400` | `{ "error": "amount must be a non-negative number" }` | invalid `amount` |
| `400` | `{ "error": "purpose must be one of: car, rent_deposit, online_shop, family, invoice" }` | unknown `purpose` |
| `429` | `{ "error": "too many check-sender requests, try again shortly" }` | shares the 120 req/15min read counter |

## `POST /api/report`

### Request

```json
{
  "sender": "string, required, non-empty",
  "message": "string, optional — the (client-redacted) message text. When present and ≤ 5000 chars, it is re-redacted server-side and reduced to one-way fingerprints (template hash + SimHash + lookalike hosts) for community cluster/wave detection. The text itself is never stored. Oversized/non-string values are ignored, not rejected.",
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

**Normalization note (no shape change):** `reportCount` deduplicates
internally via a normalized, digits-only canonical key (`backend/src/db/index.js`),
assuming the `230` Mauritius country code for 8-digit local numbers. So
`"+230 5789 1234"`, `"+23057891234"`, and `"57891234"` all accumulate against
the same underlying count instead of three independent rows. The `sender`
field in the response echoes back the raw string exactly as submitted.

## `POST /api/text-profile`

Describes pasted text for the web Check screen's meta row while the user
types. Descriptive only: no signal, score, verdict, LLM call or storage. It
reuses the pipeline's language markers (`services/lexicon`) and link
extraction (`services/domain-matching`).

Request: `{ "text": "string, required, 0-5000 characters" }`

Response `200`:

```json
{ "language": "en | fr | kreol | mixed | null (null = too few marker words to tell)", "links": 1, "hosts": ["mcb-secure.top"] }
```

Errors: `400` when `text` is missing, not a string or over 5000 characters;
`429` over 600 requests / 15 min per IP.

## `POST /api/check-url`

Used by the browser extension. A bare hostname/URL isn't a scam "message" to
run through the LLM, and the extension needs a fast per-navigation check, so
this route skips `runPipeline()` and calls `assessUrl()`
(`backend/src/services/url-reputation/index.js`). That runs the same
non-LLM domain-matching check `/api/analyze` uses (`checkUrls()`), selected
link-hygiene rules, the local threat-intel list, the sender-report count for
the host, and a domain-age lookup.

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
  "host": "string | null — normalized hostname, null when the url can't be parsed",
  "flagged": "boolean — true if any signal fired",
  "signals": "[signal] — same shape as /api/analyze signals: lookalike (URL-01..04), shortener / raw IP / @ disguise (URL-05..07), known-phishing list (REP-05), new domain (URL-09), repeated reports (REP-03), tunnel / dynamic-DNS host (URL-11), certificate problem (CERT-01), days-old certificate on a lookalike (CERT-02)",
  "reportCount": "number — user reports for this host (0 for official/trusted hosts)",
  "officialInstitution": "string | null — display name when the host is an institution's official domain",
  "trusted": "boolean — host is on data/trusted-domains.json",
  "domainAgeDays": "number | null — registration age from RDAP, null when unknown",
  "resolvedUrl": "string | null — for a known URL shortener only: where it points, read from ONE redirect response of the shortener (the destination is never fetched). Signals for the destination are included in `signals` with metadata.viaShortener set to the shortener host. null when not a shortener or unresolvable",
  "firstCertificateDays": "number | null — days since the domain's first certificate in Certificate Transparency logs (crt.sh), looked up on every check for non-official, non-trusted hosts; null when unknown",
  "certificate": "null | { validation: \"EV\" | \"OV\" | \"DV\" | null, organization: string|null, issuer: string|null, validFrom, validTo, issuedDaysAgo, expiresInDays, trusted: boolean, problem: null | \"expired\" | \"not_yet_valid\" | \"self_signed\" | \"wrong_host\" | \"untrusted\" } — read from a bare TLS handshake on EVERY https check, official sites included (the old browser green bar: EV/OV name a verified organisation). SSRF-guarded, 2.5 s timeout, cached per host for 1 h, null when unreachable or plain HTTP",
  "version": "string — url-reputation detector version, currently \"url-rep-1.2\""
}
```

Known-malicious lists (REP-05) are the local files in `data/threat-intel/`
(OpenPhish phishing and URLhaus malware feeds, refreshed by
`npm run update:threat-feed`, plus the committed local blocklist) and, only
when `SAFE_BROWSING_API_KEY` is set, Google Safe Browsing (2 s timeout,
fail-open, cached 30 min). When RDAP returns no registration date (a registry
without RDAP, or a slow/failed lookup), URL-09 falls back to the domain's first certificate in
Certificate Transparency logs (crt.sh): worded as "first appeared in public
certificate logs", capped at medium, and `domainAgeDays` stays null.

Short-link resolution contacts only hosts on the fixed shortener list in
`services/domain-matching`, over HTTPS, after the SSRF guard, with a 3 s
timeout (`services/url-reputation/short-links.js`).

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "url is required and must be a non-empty string" }` | `url` missing, not a string, or empty/whitespace-only |
| `400` | `{ "error": "url exceeds maximum length of 2048 characters" }` | `url.length > 2048` |
| `429` | `{ "error": "too many check-url requests, try again shortly" }` | per-IP rate limit exceeded (120 req/15min) |
| `500` | `{ "error": "link check failed, try again shortly" }` | unexpected internal error |

## `POST /api/analyze-site`

The extension's **Security Report** feature (`extension/README.md`).
Passive-only: this
route never sends crafted payloads, fuzzes, or brute-forces the target
site — see `backend/src/services/site-security/index.js`'s header comment
for the exact constraint. `url` is attacker-influenced input (this is a
public route), so it's validated against an SSRF guard
(`backend/src/services/site-security/url-safety.js`) before any outbound
request; a malformed or private/internal-resolving URL is a `400`, not a
silent no-op.

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
  "url": "string, the request's url after parsing (normalised, e.g. a trailing slash added), not a byte-for-byte echo",
  "finalUrl": "string | null — the URL actually reached after following redirects, or null if the site could not be reached at all",
  "grade": "\"A\" | \"B\" | \"C\" | \"D\" | \"F\" | \"N/A\" — N/A only when the site could not be reached",
  "score": "number | null — 0-100, null only alongside grade \"N/A\"",
  "scannedAt": "string — ISO timestamp of the server-side scan",
  "findings": [
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
  "checks": "[{ id, label, area, status: \"fail\" | \"warn\" | \"pass\" | \"info\" | \"not_run\", severity?, findings?: string[], reason? }] — every check the report runs (44), most pressing first: failures (worst severity first), warnings, passes, informational inventories (info: lists what was seen, e.g. API calls, and is never a pass), then checks that couldn't run with the reason. not_run is never a pass",
  "intent": "{ kind: \"malicious\" | \"suspicious\" | \"weak_security\" | \"ok\", headline, explanation, reasons: string[], trustFacts: string[], reputationChecked: boolean } — badly built vs hostile. The grade measures engineering hygiene; intent comes from the same reputation assessment as /api/check-url (threat lists, lookalikes, tunnel hosts, certificate, domain age). weak_security = real gaps but no sign of bad intent (common on older and government sites), with the facts that show the site is genuine",
  "reputation": "null | { signals, officialInstitution, domainAgeDays, firstCertificateDays, certificate } — the /api/check-url assessment used for intent; null when it timed out (5 s cap, fail-open)",
  "findings[].locations": "optional [{ file, line?, code }] (at most 3) — where the finding is: for page-code findings the script URL or page URL, 1-based line and that line of source as collected by the extension; for server findings the part of the response (e.g. \"HTTP response headers · <url>\") and the header/evidence. Untrusted page text, capped and stripped of control characters; clients must render it as text. checks[].locations carries the first three from the findings a check matched",
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
| `500` | `{ "error": "security report failed, try again shortly" }` | unexpected internal error |

Scoring: the score starts at 100. Each kind of finding costs 25 / 10 / 4 / 0
(high / medium / low / info); repeats of the same kind (e.g. the same cookie
flag missing on several cookies) count a quarter after the first; each
category is capped at 35. Grade: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, else F.
`summary.categories[].points` are these capped values, so they always sum to
`100 - score`.

## `GET /api/org/campaigns`

Organisation-scoped campaign list for the Outlook analyst view. The demo has
one configured organisation (`services/workplace-registry`); callers cannot
choose an organisation id. No request body. Read-only, non-LLM.

### Response - `200 OK`

```jsonc
{
  "organisationId": "string, the configured demo organisation",
  "campaigns": [
    {
      "campaignId": "OC-<12 hex>",          // stable per organisation + indicator
      "indicator": "string, the shared indicator, e.g. \"link:<host>\" (type prefix before the first colon)",
      "indicatorType": "string, e.g. sender_domain, link, account, payee",
      "messages": 3,                       // distinct flagged observations
      "senders": 2,                        // distinct pseudonymous senders
      "recipients": 2,                     // distinct pseudonymous recipients
      "firstSeen": "ISO timestamp",
      "lastSeen": "ISO timestamp",
      "rulesVersion": "org-campaign-1.0"
    }
  ]
}
```

Only campaigns that meet the rules in "Organisation intelligence and
verification" are listed (at least 3 flagged observations in the last 14
days, plus two recipients, two senders, or a strong account/payee/link
indicator), sorted by `messages` descending. Observations whose consensus
outcome label is `legitimate` or `false_positive` are left out. An empty
database returns `"campaigns": []`.

### Errors

| Status | Body | When |
|---|---|---|
| `429` | `{ "error": "too many check-sender requests, try again shortly" }` | shares the 120 req/15min read counter |

## `POST /api/org/outcomes`

Records an analyst's outcome label for an email the organisation already
analysed. One label per analyst per observation; a later label from the same
analyst replaces the earlier one. The analyst is identified by an HMAC
pseudonym of the client IP. There is no authentication.

### Request

```json
{
  "observationId": "string, required, 64 lowercase hex characters, the analysis.organisation.observationId of an email result",
  "label": "string, required, one of the labels below"
}
```

Labels: `confirmed_phishing`, `confirmed_bec`, `supplier_impersonation`,
`false_positive`, `legitimate`, `insufficient_evidence`, and, kept for
compatibility, `confirmed_fraud` and `suspicious_unconfirmed`.

### Response - `200 OK`

```jsonc
{
  "inputHash": "string, the observationId",
  "label": "string, the label just recorded",
  "consensus": "string, the most common label across analysts (latest wins a tie)",
  "votes": 1                               // number of analysts who labelled it
}
```

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "error": "observationId must be a 64-character hexadecimal identifier" }` | missing or malformed `observationId` |
| `400` | `{ "error": "label must be one of: ..." }` | `label` not in the list |
| `404` | `{ "error": "organisation observation not found" }` | no stored observation with that id |
| `429` | `{ "error": "too many report submissions from this address, try again later" }` | shares the 5 req/hour counter with `/api/report` |

## `GET /health`

Liveness check. No request body, no rate limit. Always `200`:

```json
{ "status": "ok" }
```

## `GET /health/llm`

The pre-demo check for which provider will actually serve `/api/analyze`
right now. Do not call this during the live demo flow itself.

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

## `GET /health/document-forensics`

Whether the optional Python document-forensics service
(`document-forensics/`, `DOCUMENT_FORENSICS_URL`) answers its own `/health`
within 3 seconds. No request body, no rate limit. Always `200`:

```json
{ "reachable": "boolean" }
```

`false` does not mean `POST /api/documents` fails; it means that route will
return `forensics.status: "unavailable"`.

## Known Gaps

Current limitations of the implemented API. Each one is open unless it says
otherwise.

- **No authentication on any route.** There is no user or session concept.
  See `checklist.md` § Security.
- **Stored documents.** `POST /api/documents` and (for PDFs, unless
  `shareSamples: false`) `POST /api/analyze/document` store original file
  bytes in SQLite, unencrypted, with no retention period and no delete route.
  No route returns them.
- **Organisation outcomes are unauthenticated.** Any caller can post a
  `legitimate` or `false_positive` label for an observation id, which removes
  that observation from `GET /api/org/campaigns` counts. The only protection
  is the shared 5 req/hour report limit.
- **The web app discards screenshot image forensics.** The Check screen
  (`frontend/components/ScreenshotUpload.tsx`,
  `frontend/components/check/Workspace.tsx`) keeps only `extractedText` from
  `/api/analyze/screenshot` and then sends that text to `/api/analyze`. The
  verdict it shows therefore never includes DOC-09..13, and each screenshot
  uses two requests from the analyze rate-limit counter and two semantic-model
  calls.
- **`POST /api/documents` ignores `shareSamples`.** It always stores the
  upload, unlike `/api/analyze/document`.
- **Radar mixes seeded demo counts with live ones.** `npm run seed:radar`
  writes rows tagged `demo_seed`; `GET /api/trends?range=` sums both sources
  and the response does not say which part is seeded.
- **`POST /api/documents` echoes an internal error.** `forensics.reason` is
  the error message from the call to the Python service, which can include up
  to 200 characters of that service's error body.
- **Email analysis is read-mode only (`outlook-addin/`).** It analyses only
  the selected message after the user clicks the task-pane button. There is
  no Microsoft Graph integration or mailbox polling. The supplier registry and
  organisation directory are **demo data** (`data/demo-*.json`) with no admin
  API to load real data. The email body shares `/api/analyze`'s 5000-character
  limit, so the add-in trims long bodies to 4800 characters after removing
  recognisable quoted history. EMAIL-10 ("new sender") only knows a
  supplier's addresses on record; there is no per-mailbox sender history.
  `extension/` and `frontend/` do not render email-specific UI; email
  signals arrive in the normal `signals[]` with legacy `type` values the
  frontend already maps.
- **`/api/report` accepts `reportedBy` but ignores it.** Its `message` is
  reduced to fingerprints for community detection and not stored.
- **`verdict: "unknown"` exists only on `/api/batch-scan` items**, for an
  unexpected pipeline error on that item (`analysisFailed: true`, counted in
  `unanalyzedCount`). `/api/analyze` never returns it.
- **Registry domains are unverified.** Every `data/institution-registry.json`
  entry carries `verification.status: "unverified"` until someone checks each
  domain on the institution's own website. `official_phones` is empty on
  purpose.
- **OCR quality reaches the engine only for documents.** The document route
  passes `ocrQuality` when it had to OCR a scan. The screenshot route does
  not compute it.
- **`/api/analyze/screenshot` has no HTTP-level automated test.**
  `backend/src/services/ocr/index.test.js` covers `extractTextFromImage` and
  `cleanExtractedText` directly.
- **Tesseract has no Kreol Morisien language pack.** OCR runs with
  `eng+fra`, which covers Kreol's Latin script but is not Kreol-tuned.
  Recheck against the Kreol owner's dataset once real Kreol screenshots are
  available.
- **Rate limits are in-process.** They reset when the backend restarts and
  are not shared between instances.
- **Document forensics limits** (`POST /api/analyze/document`):
  - Metadata can be stripped or forged, so DOC-01/03 prove nothing on their own.
  - A forgery that was printed and scanned again leaves no structural trace.
  - There is no error-level analysis or ML model on this route (the Python
    service used by `/api/documents` has them).
  - PDF annotations (e.g. form fields filled on a scan) and XFA forms are not
    inspected.
  - For PDFs with permissions-only encryption, the active-content scan is
    best-effort: their compressed object streams are ciphertext to the object
    enumerator.
  - Only the first 10 pages are inspected, and at most 3 scanned pages are OCR'd.
  - Through the web app's Next.js proxy, request bodies are cloned up to
    `middlewareClientMaxBodySize` (15mb, `frontend/next.config.ts`). A body
    larger than that is cut short by Next and comes back as a generic proxy 500
    rather than the backend's 413. The web app never sends one: it refuses
    files over 10MB before uploading.

## Campaign intelligence

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

Response `200 OK`:

**Optional `?range=7d|30d|12m` (additive).** Adds a `radar` object with
ranged aggregates for the Radar page; any other `range` value is `400`.
Without `range` the response is unchanged. Source: `backend/src/services/radar`,
two daily counter tables (`radar_daily`: day, verdict, scam type, claimed
institution, user-reported channel, count; `radar_domain_daily`: day,
lookalike domain, institution it imitates, count). Only `scam`/`suspicious`
checks are counted; no text, sender, IP or pseudonym is stored; requests with
`shareSamples: false` record nothing; rows are purged after
`RADAR_RETENTION_DAYS` (default 730). Days are Mauritius calendar days (UTC+4).
Each row carries a `source` of `live` or `demo_seed` (written by
`npm run seed:radar` in `backend/`); the aggregates below add both together.

```ts
radar?: {
  range: "7d" | "30d" | "12m";
  unit: "day" | "month";          // bucket size of `series`
  from: string; to: string;        // YYYY-MM-DD, to exclusive
  scamsCaught: number;             // checks with verdict "scam" in the range
  flaggedChecks: number;           // scam + suspicious
  change: { previous: number; pct: number } | null; // vs the previous equal period; null when it had no scams
  series: { start: string; scams: number }[];       // 7, 30 or 12 buckets, oldest first
  topImpersonated: { name: string; checks: number; sharePct: number } | null; // share of flaggedChecks
  rising: { scamType: string; current: number; previous: number; mainChannel: string | null } | null; // largest growth vs previous period; null if nothing grew
  topScamTypes: { scamType: string; checks: number; pct: number }[]; // top 5, pct of typed checks
  fakeLinks: { domain: string; imitates: string | null; times: number }[]; // top 5 lookalike domains
}
```

Every value is a sum over stored counters; an empty database returns zeros,
`null`s and `[]`, which the client renders as an empty state.

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
