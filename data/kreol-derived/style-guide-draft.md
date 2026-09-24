# Kreol style guide (DRAFT - not reviewed)

Purpose: keep generated and displayed Kreol consistent. Every rule is tagged with
how much evidence stands behind it. **Nothing here is approved by a Kreol reviewer.**
Numbers come from `data/kreol-derived/reports/orthography-evidence.json`
(FraudLens reviewed rows vs MorisienMT training text).

Legend: **[reviewed]** observed in `owner_reviewed` / `ported_reviewed` FraudLens data.
**[observed]** observed in external data (MorisienMT / Kaikki) only.
**[proposed]** a suggestion with little or no evidence.

## Orthography

| Topic | Evidence | Status |
|---|---|---|
| `ou / nou / pou` | FraudLens reviewed data uses these exclusively (37 / 5 / 21 occurrences, `u/nu/pu` never). MorisienMT uses `u/nu/pu` about as often as `ou/nou/pou` (u 751 vs ou 468) | [reviewed] use `ou nou pou`; [observed] `u nu pu` are common real spellings, so *understand* them (the normalizer does) but do not *produce* them |
| perfective marker | reviewed data: `finn` 7, `inn` 6, `ou'nn` contraction present. MorisienMT: `finn` 954, `inn` 82 | [observed] `finn` is dominant; [proposed] generate `finn` |
| `lien` vs `lyen` | reviewed rows disagree: corpus uses `lien`, translation memory uses `lyen` (1 vs 5); the product UI uses `lien` | [reviewed, conflicting] decision needed from the owner; drafts here use `lien` to match the UI |
| `pa` / `pann` / `zame` / `zamai` | `pa` everywhere; `pann` and `zame` attested in MorisienMT (`zame` 64, `zamai` 0) | [observed] `zamai` is not attested in the training text; the lexicon keeps both. Negation must never be dropped in output |
| `pey` / `peye`, `gagn` / `gagne` | Kaikki: `gagn` is the medial form of `gagne`; `peye` = to pay | [observed] both forms are valid; keep as the source has them |
| accents | reviewed data has none in Kreol words; SMS text often adds French accents (`bloke` vs `bloké`) | [proposed] generate without accents |

## Register and pronouns

- Reviewed banking rows address the reader as `ou` (formal) and also `to` (informal)
  in prize/scam phrasing (`ou` 37, `to` 7 in reviewed text). [reviewed] use `ou` in
  safety guidance.
- Imperatives are short: `Pa partaz ou PIN ar personn.` [reviewed]

## Loanwords

Mauritian text keeps English/French technical words. [reviewed] `OTP`, `PIN`, `mobile money`,
`channel`, `fraud`, `Kont labank` (Kreol) beside `Verifye`, `Konfirm`. Do not invent
replacements for `OTP`, `PIN`, `account`, `link`, `WhatsApp`, `Juice`. [proposed] prefer
Kreol for everyday verbs (`avoy`, `partaz`, `klik`) and keep the loanword for the object.

## Fraud vocabulary in reviewed data

`larnak` (scam), `fer koumadir li labank` (bank impersonation), `mesaz sispe`, `fo lyen`,
`irzan`, `azir aster`, `kont pou bloke`. [reviewed] `eskrokri` / `siny danze` appear in the
product UI. [observed] `eskrok` = swindler in the fixtures (unreviewed).

## Open questions for the reviewer

1. `lien` or `lyen`?
2. Should generated text ever use `u/nu/pu`? (Recommendation: no.)
3. `siny danze` vs `siny` alone for "warning signs".
4. `larnak` vs `eskrokri` for "scam".
