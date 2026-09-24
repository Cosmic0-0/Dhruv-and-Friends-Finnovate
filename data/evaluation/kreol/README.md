# Kreol evaluation fixtures

Held-out benchmarks for the Kreol language layer. **Everything here is AI-drafted
(`draft_generated` / `synthetic_claude`) and has not been reviewed by a human.**
Review columns are intentionally blank; nothing here may be promoted to
`owner_reviewed` or `ported_reviewed` by AI.

These files are evaluation data only. They must never be copied into
`translation-memory.*`, `scam-corpus.*`, production Kreol grounding, or used to
generate detection rules.

| File | Used by | What it checks |
|---|---|---|
| `fraud-cases.jsonl` | `npm run eval:kreol` | expected / forbidden signal codes per message; families: scam request, legitimate warning/notice, negation pairs, conditional threats, code-switching, orthographic variants |
| `language-classification.jsonl` | `npm run eval:kreol` | primary language, language set, mixed flag |
| `generation-cases.jsonl` | `npm run eval:kreol:translate` | English/French -> Kreol and Kreol -> English source sentences |
| `generation-review.csv` | human reviewers | naturalness / terminology sheet; `generated_output` is filled from a live run, human columns stay blank |
| `morisienmt-dev.jsonl` | `npm run eval:kreol:translate -- --suite morisienmt-dev` | MorisienMT DEV split (3-way aligned) for translation evaluation only. The TEST split stays in the raw zip and is not exported |

## Splits and leakage

Each fraud / language case has `split: dev | heldout`.

- `dev` cases may be used while improving rules.
- `heldout` cases are read for the final number only. A heldout failure is
  reported, not fixed by adding that exact wording to a rule.

Semantic families (a scam request, its negated safety-advice twin, its
conditional-threat form, spelling variants of each) make wording-level tuning
visible: the negated twin must stay silent while the request fires.

## Fields

`id, split, family, group, language_mix, message, expectedSignals[],
forbiddenSignals[], rationale, status, provenance, reviewed_by, review_notes`.
Expected signals are limited to codes the deterministic lexicon is meant to
cover. `group` ties variant/negation pairs together: variant groups must give
identical results, negation pairs must differ.

Synthetic organisations only (OceanBank, IslandTrust). Phone-like and OTP-like
numbers are made up.
