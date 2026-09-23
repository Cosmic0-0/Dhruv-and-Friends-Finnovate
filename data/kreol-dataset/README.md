# Kreol scam dataset

Kreol / French / English (and code-switched) scam message samples used to
tune prompts in `backend/src/services/analysis`. Drop raw samples here as
`.json` or `.csv`; note the source and language mix for each.

## Translation memory

Ported as a base from a prior Kreol project by the same team — its Kreol
Morisien orthography conventions, the CSV-as-source-of-truth workflow, and
`tm_tool.py` validator carried over. Only domain-agnostic rows were kept;
`translation-memory.csv` here holds 9 UI/general rows from that project
(reviewed by Joshua there, so `ported_reviewed` — not `owner_reviewed`,
since that review happened in the other project, not this one) plus 28
banking/scam/mobile-money rows authored for FraudLens. See `CLAUDE.md` →
Trust and Review Status for the full status taxonomy.

`translation-memory.csv` is the single source of truth. **Edit the CSV,
never the generated JSONL directly.**

| Column | Meaning |
|---|---|
| `english` | English source text. Must be unique (case/whitespace-insensitive). |
| `kreol_morisien` | Kreol Morisien translation. |
| `domain` | `banking`, `scam`, `mobile-money`, `ui`, or `general`. |
| `status` | `owner_reviewed` (Joshua reviewed it here), `ported_reviewed` (reviewed in a prior project, not here), `draft_generated` (unreviewed), or `rejected`. |
| `reviewed_by` | Name/initials of whoever performed the review. Required when `owner_reviewed`. |
| `notes` | Why a term was chosen, what it corrects, open questions. |

**Only `owner_reviewed` and `ported_reviewed` rows should feed the analysis
prompt.** `draft_generated` rows are unreviewed proposals; review and
promote before backend prompt-tuning relies on them. Claude must never set a row to `owner_reviewed` itself — see
`CLAUDE.md` § Critical Rule: Never Fabricate Review.

### Regenerating the JSONL

After editing the CSV, from `data/kreol-dataset/`:

```bash
python scripts/tm_tool.py check      # validate only
python scripts/tm_tool.py to-jsonl   # regenerate translation-memory.jsonl
```

The script warns (does not block) on likely Haitian Creole markers or
French-heavy phrasing in the Kreol column. A human reviewer decides.

## Scam corpus

`translation-memory.csv` is terminology / short phrase mappings.
`scam-corpus.csv` is different: complete, realistic scam **messages** in
context, so the Kreol layer can be tested against what the fraud-analysis
pipeline actually needs — entity preservation (organisation, amount, URL,
OTP, deadline), risk-signal preservation (urgency, threat, secrecy,
impersonation), and English/French/Kreol code-switching. It is not itself
a translation dictionary.

`scam-corpus.csv` and its validator are new to this project, though `corpus_tool.py` imports `tm_tool.py`'s
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
| `provenance` | `synthetic_claude`, `owner_authored`, or `real_report_redacted` — separate from `status`: this says where a row came from, `status` says how trustworthy it currently is. A row can start `draft_generated`/`synthetic_claude` and later become `owner_reviewed`/`synthetic_claude` once reviewed — provenance doesn't change. |
| `notes` | Brief — what the row tests, not prose. |

Current seed: **24 rows, all `owner_reviewed` / `synthetic_claude`** —
Claude-authored synthetic examples across bank/government/mobile-payment/
family/parcel/investment/job/prize impersonation plus legitimate controls
(so the model doesn't learn "financial message = scam"), fictional
organisation names (e.g. `OceanBank`), Joshua-reviewed for Kreol accuracy.
None are real scam reports.

**Real reports (`real_report_redacted`):** rows sourced from actual
screenshots (family/friends, forwarded by Joshua). Real organisation name
kept as the impersonation target (that's the fraud signal); all PII —
account numbers, OTPs, phone numbers, personal names — stripped before the
row is added. Starts `draft_generated` until Joshua reviews the Kreol
rendering. The frontend reads `provenance` directly to distinguish real
from synthetic per-round — see `frontend/lib/learn-content.ts`.

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

## Collaborative review app

Two datasets need independent human review before anything in them can be
trusted: the 24-row `scam-corpus.csv` and the 30 `draft_generated` rows in
`translation-memory.csv`. `review/review_app.py` is a local Streamlit tool
that lets Joshua and Caellum review either one, independently, without seeing
each other's decisions until a separate read-only comparison view.

```bash
pip install -r data/kreol-dataset/review/requirements.txt
streamlit run data/kreol-dataset/review/review_app.py
```

- The reviewer picks their identity (Joshua or Caellum) in the sidebar — never
  inferred from Git/OS username — then picks a dataset (**Scam Corpus** or
  **Translation Memory**) from a second sidebar selector. Progress, filters,
  and navigation are all scoped to whichever dataset is active.
- Per row, a reviewer marks `APPROVE` (row is fine as-is), `EDIT` (retain the
  row, correct the Kreol/English/signals/notes), or `REJECT` (unsuitable for
  the trusted dataset). Decisions are stored separately per dataset —
  `review/review-decisions.csv` for the scam corpus, `review/tm-review-decisions.csv`
  for the translation memory — one record per `(id, reviewer)` (for TM, `id`
  is the `english` column, since it's the existing unique key). Joshua's and
  Caellum's reviews never overwrite each other.
- The **app itself** never writes to `scam-corpus.csv`, `translation-memory.csv`,
  or their `.jsonl` outputs, never promotes a row to `owner_reviewed`, and
  never merges the two reviewers' corrections — see `CLAUDE.md` § Critical
  Rule: Never Fabricate Review. (`scam-corpus.csv` has since been promoted to
  24/24 `owner_reviewed` via a separate, explicit apply step outside this app,
  after Joshua completed his review — see git history. The translation memory
  has not been promoted yet.)
- The **Review Comparison** / **TM Comparison** tab (read-only) shows
  agreement/disagreement state per row (`AGREED_APPROVE`/`AGREED_EDIT`/
  `AGREED_REJECT`/`DISAGREEMENT`/`ONE_REVIEW_PENDING`/`BOTH_PENDING`) so the
  team can find rows that need human reconciliation. It does not decide who
  is right and does not merge anything.
- Applying reconciled decisions back to the source CSVs (and deciding what
  becomes `owner_reviewed`) is a separate, explicit task each time — not done
  by this app.
- The decisions CSVs are plain CSV, not a database: concurrent writes from two
  people running the app at the same moment could race. In practice this is
  fine since each person owns their own `(id, reviewer)` rows and the app
  re-reads the file before every write, but true simultaneous saves are not
  locked.

## Known gaps

- Only 24 seed corpus rows — intentionally small so conventions get fixed
  before scaling. Do not bulk-generate more until these are reviewed.
- Reviewed rows are integrated into semantic prompt grounding through
  `backend/src/services/analysis/kreolGrounding.js`. The payload consistency
  runner in `data/test-payloads/consistency.mjs` measures live model variance;
  broader language-quality evaluation is still needed.
- Draft rows (translation memory and corpus alike) are unverified
  machine-drafted content — treat every one as wrong until Joshua reviews
  it.
