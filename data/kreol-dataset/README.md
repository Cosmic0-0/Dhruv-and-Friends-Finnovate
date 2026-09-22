# Kreol scam dataset

Owner: **Joshua**. See `CLAUDE.md` → Role gating.

Kreol / French / English (and code-switched) scam message samples used to
tune prompts in `backend/src/services/analysis`. Drop raw samples here as
`.json` or `.csv`; note the source and language mix for each.

## Translation memory

Ported as a base from a prior hackathon project
(`Gemma-Blue-Mauritius-Beyond`, BlueNet Ocean Watch — same team, maritime
domain) — its Kreol Morisien orthography conventions, the CSV-as-source-of-
truth workflow, and `tm_tool.py` validator carried over unchanged. Its
vocabulary was maritime-specific (boats, fishing, coast guard) and did not
transfer; `translation-memory.csv` here starts from that project's 9
domain-agnostic UI/general rows (reviewed by Joshua there, so `ported_reviewed`
— not `owner_reviewed`, since that review happened in the other project, not
this one) plus 30 new `draft_generated` rows for banking/scam/mobile-money
vocabulary that still need native-speaker review. See `CLAUDE.md` → Trust and
Review Status for the full status taxonomy.

`translation-memory.csv` is the single source of truth. **Edit the CSV,
never the generated JSONL directly.**

| Column | Meaning |
|---|---|
| `english` | English source text. Must be unique (case/whitespace-insensitive). |
| `kreol_morisien` | Kreol Morisien translation. |
| `domain` | `banking`, `scam`, `mobile-money`, `ui`, or `general`. |
| `status` | `owner_reviewed` (Joshua reviewed it here), `ported_reviewed` (reviewed in BlueNet, not here), `draft_generated` (unreviewed), or `rejected`. |
| `reviewed_by` | Name/initials of whoever performed the review. Required when `owner_reviewed`. |
| `notes` | Why a term was chosen, what it corrects, open questions. |

**Only `owner_reviewed` and `ported_reviewed` rows should feed the analysis
prompt.** `draft_generated` rows are unreviewed proposals. 30 of 39 rows here
are still `draft_generated`; review and promote before backend prompt-tuning
relies on them. Claude must never set a row to `owner_reviewed` itself — see
`CLAUDE.md` § Critical Rule: Never Fabricate Review.

### Regenerating the JSONL

After editing the CSV, from `data/kreol-dataset/`:

```bash
python scripts/tm_tool.py check      # validate only
python scripts/tm_tool.py to-jsonl   # regenerate translation-memory.jsonl
```

The script warns (does not block) on likely Haitian Creole markers or
French-heavy phrasing in the Kreol column — same anti-drift heuristic as
the BlueNet source. A human reviewer decides.

## Scam corpus

`translation-memory.csv` is terminology / short phrase mappings.
`scam-corpus.csv` is different: complete, realistic scam **messages** in
context, so the Kreol layer can be tested against what the fraud-analysis
pipeline actually needs — entity preservation (organisation, amount, URL,
OTP, deadline), risk-signal preservation (urgency, threat, secrecy,
impersonation), and English/French/Kreol code-switching. It is not itself
a translation dictionary.

No file in the BlueNet source project does this job — its "corpus" was
just the translation memory split for LoRA fine-tuning, not a
message+entities+risk-signals schema. `scam-corpus.csv` and its validator
are new to this project, though `corpus_tool.py` imports `tm_tool.py`'s
Haitian/French drift-detection helpers rather than re-deriving them.

Schema: `id,original_message,language_mix,english_meaning,scam_type,risk_signals,entities,status,reviewed_by,provenance,notes`

| Column | Meaning |
|---|---|
| `id` | Stable ID, `FL-KM-####`. Never renumber existing IDs. |
| `original_message` | Full message as a user would receive it. May mix Kreol/English/French. Synthetic only — no real personal data. |
| `language_mix` | One of `mfe`, `mfe+en`, `mfe+fr`, `mfe+en+fr`, `en`, `fr`. `mfe` = Kreol Morisien. |
| `english_meaning` | Faithful English rendering for evaluation reference — no added interpretation. |
| `scam_type` | Controlled taxonomy (see `corpus_tool.py` `VALID_SCAM_TYPES`) — includes `legitimate` for false-positive controls. |
| `risk_signals` | Pipe-separated controlled taxonomy (see `VALID_RISK_SIGNALS`), reflecting evidence actually present in the message. |
| `entities` | Compact JSON object — organisation, amount, url, phone, otp, deadline, etc. Only what's actually in the message. `.test` domains for synthetic URLs. |
| `status` | Same four-value taxonomy as the translation memory. |
| `reviewed_by` | Required when `owner_reviewed`. |
| `provenance` | `synthetic_claude`, `ported_bluenet`, or `owner_authored` — separate from `status`: this says where a row came from, `status` says how trustworthy it currently is. A row can start `draft_generated`/`synthetic_claude` and later become `owner_reviewed`/`synthetic_claude` once reviewed — provenance doesn't change. |
| `notes` | Brief — what the row tests, not prose. |

Current seed: **24 rows, all `draft_generated` / `synthetic_claude`** —
Claude-authored synthetic examples across bank/government/mobile-payment/
family/parcel/investment/job/prize impersonation plus legitimate controls
(so the model doesn't learn "financial message = scam"). None of these are
real scam reports and none have been reviewed. **All require Joshua's
review before any becomes `owner_reviewed`.**

### Validator

```bash
python scripts/corpus_tool.py check      # validate only
python scripts/corpus_tool.py stats      # coverage breakdown
python scripts/corpus_tool.py to-jsonl   # regenerate scam-corpus.jsonl
```

`check` enforces schema, ID format/uniqueness, controlled taxonomies for
language mix/scam type/risk signals, JSON-object `entities`, and review
integrity (`owner_reviewed` requires `reviewed_by`; `draft_generated`
shouldn't have one). It warns (doesn't block) on: near-duplicate messages,
`legitimate` rows with signals set (or non-legitimate rows with none),
`OTP_REQUEST` without OTP/PIN/code wording, `DOMAIN_MISMATCH` without a
url/domain in `entities`, 9+ digit runs (possible real account/ID number),
and the same Haitian Creole / French-drift heuristics as the translation
memory.

## Known gaps

- Only 24 seed corpus rows — intentionally small so conventions get fixed
  before scaling. Do not bulk-generate more until these are reviewed.
- No retrieval/prompt-grounding integration yet (`CLAUDE.md` P3) and no
  evaluation harness yet (P4) — both come after this seed corpus is
  reviewed.
- Draft rows (translation memory and corpus alike) are unverified
  machine-drafted content — treat every one as wrong until Joshua reviews
  it.
