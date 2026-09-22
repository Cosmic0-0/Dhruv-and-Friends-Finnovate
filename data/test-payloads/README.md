# Test payloads

Owner: **Caellum**. See `CLAUDE.md` → Role gating.

Scam message test set across English, French, and Kreol (Kreol set
coordinated with Joshua — see `../kreol-dataset`). Used for edge-case
testing of `POST /api/analyze` and `POST /api/batch-scan`, and for the
final demo script.

## Files

- `en.json` — English payloads.
- `fr.json` — French payloads.
- Kreol coverage lives in `../kreol-dataset/scam-corpus.csv` (owned by
  Joshua) — not duplicated here.
- `FINDINGS.md` — QA findings log against the backend, numbered
  sequentially across rounds.

## Payload schema

```json
{
  "id": "EN-01",
  "language": "en",
  "scamType": "bank_impersonation",
  "message": "raw message text, exactly as POSTed to /api/analyze",
  "expected": {
    "verdict": "safe" | "suspicious" | "scam",
    "signals": ["lookalike_url", "urgency_language"]
  },
  "notes": "why this payload exists / what it's stress-testing"
}
```

`scamType` reuses Joshua's `VALID_SCAM_TYPES` vocabulary
(`../kreol-dataset/scripts/corpus_tool.py`) so scam categories are
comparable across the Kreol, English, and French sets.

## Matching semantics (for whoever writes the runner)

- **`verdict`** — exact match against the response's `verdict`.
- **`signals`** — **subset** match only: every `type` listed in
  `expected.signals` must appear somewhere in the response's `signals`
  array, but the response may contain additional signals not listed.
  Never assert exact equality on the signals array — the LLM's signal set
  isn't a fixed enum (see `docs/API-CONTRACT.md` Known Gaps), and
  `checkUrls()` may append its own `lookalike_url` signal independent of
  whatever the LLM returned.
- **`explanation`** — never asserted on. It's a free-form, localized
  human-readable string; asserting on its content would be asserting on
  LLM prose.
- An empty `expected.signals` array means "no signal is required" — it's
  not a claim that the response will have zero signals.

`lookalike_url` is the one signal type that's actually deterministic
(`backend/src/services/domain-matching/index.js`, not the LLM), so it's
used wherever a payload's message contains a URL that
`checkUrls()` is known to flag — verified directly against the module,
not assumed. Everything else is LLM-driven and inherently probabilistic;
keep those `expected.signals` conservative and treat mismatches there as
prompt-tuning signal, not necessarily a bug.

## Genuine-but-alarming payloads

Roughly a third of each language's set (6/20 in both `en.json` and
`fr.json`) are real, benign messages that use alarming language on
purpose — real OTP deliveries, real transaction alerts, real password-
change notices — with `expected.verdict: "safe"`. Without these, a
verdict-accuracy measurement only tells you the recall on scams, not the
false-positive rate on legitimate messages, which is just as important
for a tool users are meant to trust day to day.

## Verdict tier coverage (2026-09-22 revision)

Both files are 20 entries: 11 `scam`, 3 `suspicious`, 6 `safe`. An
independent Opus + Sonnet subagent review of the original 18-entry sets
found zero `suspicious`-verdict coverage — every payload was `scam` or
`safe`, so the middle tier of the contract's three-way `verdict` enum was
entirely unmeasured. Fixed by:

- Relabeling `EN-12`/`FR-12` (merchant payment/beneficiary change) from
  `scam` to `suspicious` — both reviewers independently flagged the
  original `scam` assertion as unsupported: the message has zero textual
  red flags by design (BEC fraud is inherently indistinguishable from a
  legitimate vendor notice without out-of-band verification), so a
  confident `scam` label wasn't something a text-only classifier could
  reasonably be expected to hit.
- Adding `EN-19`/`EN-20` and `FR-19`/`FR-20` — deliberately ambiguous
  "opening move" payloads (an unsolicited job offer, an unsolicited
  investment tip) that are the same social-engineering pattern as
  `EN-11`/`EN-10` one step earlier, before the fee ask or return
  guarantee that makes the confirmed-scam versions unambiguous.

Also normalized `EN-06`/`FR-06`'s scammer callback number from a
fully-specified, realistic-looking Mauritius mobile number to the same
`5xxx-xxxx` placeholder already used in `EN-07`/`FR-07`, per the same
review.
