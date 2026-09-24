# Kreol language layer

How FraudLens understands, normalises, translates and renders Mauritian Kreol
(Kreol Morisien, `mfe`), including English/French code-switching. Counts change
as data grows, so this document names the command that produces each number
instead of hard-coding it.

## Principle: evidence stays original

FraudLens does not translate a message before detecting fraud. Detectors read
the message the sender wrote, and every piece of evidence is quoted from it.

```text
original message
  |-- deterministic rules (EN + FR + MFE, all languages always run)
  |       pass 1: original text
  |       pass 2: spelling-normalised copy, only for codes pass 1 missed;
  |               evidence + span are cut from the ORIGINAL text
  |-- semantic model (optional): enum signal codes + exact quotes,
  |       quotes validated against the original text
  v
signals -> deterministic risk engine -> decision -> template explanation
```

Anything derived (a normalised copy, an English meaning, a translation) is a
parallel representation used for matching or display. It is never the evidence
and never the verdict. Translation is not called by `/api/analyze`; the only
product use is the separate, on-demand `POST /api/translate` (see below).

## Modules (`backend/src/services/kreol/`)

| Module | Job |
|---|---|
| `entities.js` | Finds URLs, emails, amounts, dates, usernames, phones and 4+ digit codes; `protectEntities` swaps them for `<TYPE_n>` placeholders, `restoreEntities` puts the exact values back, `validateEntities` / `validateRestored` reject lost, duplicated, altered or invented entities |
| `variants.js` | Loads `data/kreol-derived/spelling-variants.classified.json` (Kaikki candidates classified against MorisienMT training text) |
| `normalizer.js` | Matching-only respelling: `nu/pu/u`, `inn/in/'nn` after a pronoun, accents. Never touches entities or negation words. Returns `originalText`, `normalizedText`, `changes[]` and `toOriginal()` |
| `language.js` | `detectLanguageMix(text)` -> `{ primary, languages, mixed, scores, kreolStrong }` for `en` / `fr` / `mfe`. `lexicon.detectLanguage()` keeps its old `en|fr|kreol` shape by delegating to it |
| `translation.js` | Auxiliary translate/generate runtime with an injected provider and strict output validation |
| `messageTranslation.js` | `translateMessage(text, target)`: detects the message's language, picks a supported direction and calls `translateText`; behind `POST /api/translate` |
| `copy.js` | Reviewable Kreol copy for signal labels and actions; serves only human-reviewed text |
| `metrics.js` | chrF |

## Understanding Kreol

- **Normalisation classes** (`spelling-variants.classified.json`):
  `safe` (Kreol-only token, rewritten anywhere), `ambiguous` (real Kreol
  spelling that is a 1-2 letter token or also an English/French word, rewritten
  only when the message is Kreol-dominant), `do_not_normalize` (unattested, or
  mostly English/French, e.g. `en`, `in`). A missing Kaikki entry means
  "unknown", never "invalid".
- **Language detection** is a weighted word vote. Ambiguous words carry half
  weight or none (`to`, `la` count for nobody; `ou` counts half for Kreol only).
  It never turns detectors off: EN, FR and MFE rules always all run.
- **Negation is never dropped.** `pa`, `pann`, `zame`, `zamai` are negations in the
  lexicon, the normaliser and retrieval (an earlier stopword list contained `pa`).
  A negation between the verb and the credential ("dir ou pa partaz ou kod")
  also negates the request; a conditional ("Si ou pa konfirm ...") turns it back
  into a threat.
- **Retrieval** (`analysis/kreolGrounding.js`) scores weighted unigram overlap plus
  phrase overlap on normalised tokens, times a trust multiplier and a domain
  multiplier, and requires a content-word overlap. Only `owner_reviewed` and
  `ported_reviewed` rows are used; `draft_generated` needs `includeDraft`.
  External MorisienMT sentences are opt-in (`includeExternal`), ranked strictly
  after reviewed rows, and are not used by the fraud-analysis prompt.
- **Safety-context rules** (negation, "contact your bank", completed-action notices,
  "sispann" as the verb *to stop*) are deterministic and unit-tested.

## Translation and generation

```text
source text -> protect entities -> retrieve reviewed terms/examples
  -> provider (injected; production = existing callLLM) -> parse
  -> validate (entities, negation, numbers, language, length, copy-through)
  -> restore exact entities -> validate again
```

- Directions: `mfe-en`, `en-mfe`, `fr-mfe`, `mfe-fr`.
- Generated Kreol keeps the spelling of the reviewed FraudLens data (`ou/nou/pou`); output using `u/nu/pu` is rejected as `nonstandard_spelling`, although those forms are understood on input.
- A rejected answer is retried once with the reasons; after that the result is
  `status: "rejected"` with `text: null`. Unvalidated model text is never returned.
- With no provider the result is `status: "unavailable"`.
- **In the product:** `POST /api/translate` (`messageTranslation.js`) backs the
  "Translate this message" panel on the web Check result. It runs only when the
  user clicks, after the verdict is already shown, and shows the answer under a
  "machine translation, not reviewed" label. Supported: Kreol <-> English and
  Kreol <-> French; the message's language is detected, not chosen by the user.
  The web client sends the redacted message with redaction placeholders swapped for
  opaque `<PRIV_n>` tokens, which `entities.js` protects like any entity. A model
  outage returns `status: "unavailable"` and the result screen is unaffected.
  Messages over 2000 characters are not offered translation (no partial
  translations). The extension and Outlook add-in do not call it.
- **Status:** the runtime and its safety envelope are implemented and tested with a
  stub provider. Live quality is not measured: run
  `npm run eval:kreol:translate` (needs a reachable model). Without one it reports
  `pending_model_access` rather than a score.

## Product copy

`data/kreol-derived/copy/candidate-*.csv` hold AI-drafted Kreol for signal labels
and action text, keyed by stable ids. `copy.js` returns them only when a human
sets `status = owner_reviewed`; `{ allowDraft: true }` is for previews. The UI
audit (`candidate-ui-translations.csv`) lists every `TODO_KREOL` call that still
shows English in Kreol mode. Nothing in the product reads `copy.js` yet.

## Data and provenance

| Source | Where | Best used for | Status label |
|---|---|---|---|
| FraudLens reviewed data | `data/kreol-dataset/*.csv` | scam/banking language, grounding, rules | `owner_reviewed`, `ported_reviewed` (human-set only), `draft_generated`, `rejected` |
| MorisienMT | `data/kreol-dataset/additional/*.zip` | general parallel language, translation evaluation | `external_morisienmt` |
| Kaikki | `data/kreol-dataset/additional/*.jsonl` | lexicon, spelling variants | `external_kaikki` / `external_candidate` |
| Evaluation fixtures | `data/evaluation/kreol/` | benchmarks only, never grounding or rules | `draft_generated` / `synthetic_claude` |

Raw external files are never modified and are **not committed**: MorisienMT states only
"released for research purposes" and Kaikki/Wiktionary is CC BY-SA, so `data/.gitignore`
excludes them and everything that reproduces their text. `data/kreol-derived/README.md`
lists how to recreate them; the backend runs without them (built-in `nu/pu/u` fallback).
Derived files live in `data/kreol-derived/`
and every row keeps its origin. MorisienMT dev/test are for language evaluation
only; test stays inside the zip and is not exported. MorisienMT is Bible/news
text and mostly single-word glosses, not fraud-domain evidence.

Regenerate derived data:

```bash
cd data/kreol-dataset
python scripts/morisienmt_audit.py
python scripts/kaikki_audit.py
python scripts/build_variant_resource.py
```

## Evaluation

```bash
cd backend
npm run eval               # existing deterministic FraudLens evaluation
npm run eval:kreol         # Kreol fixtures: fraud, negation, variants, code-switch, language, entities
npm run eval:kreol:translate   # live translation/generation (needs a model)
```

Fixtures carry a `split`. `dev` cases may guide rule work; `heldout` cases are
read for the final number only, and rules are not written around their wording.
Fixtures are AI-drafted and unreviewed; a human should review them before they
are quoted as a benchmark. Numbers before/after live in
`data/kreol-derived/reports/`.

## Known limitations

- Deterministic Kreol coverage is phrase-based. Threats and secrecy phrased in ways
  the lexicon has not seen (e.g. "aksion legal", "Pa dir mo fami") are missed;
  the semantic model is the intended backstop.
- Language detection mislabels French-led messages that use Kreol pronouns.
- Quoting a scam phrase inside a warning ("Eskrok pou dir ou partaz ou kod. Pa fer sa.")
  can still look like a request.
- OCR runs `eng+fra` with no Kreol pack; accent loss is partly recoverable by the
  normaliser, other misreads are not. No OCR audit was run: the repository has no Kreol
  screenshots (`npm run test:ocr -- <image>` needs one), and OCR training is out of scope.
- The repository targets Node 22; this work was developed and verified on Node 24.
- No human evaluation yet. Naturalness of any generated Kreol is unmeasured.
- Kreol orthography differs between sources: MorisienMT uses `u/nu/pu` about as
  often as `ou/nou/pou`; the reviewed FraudLens data uses only `ou/nou/pou`.
  The style guide draft records the evidence and leaves the decision to the owner.
