# CLAUDE.md — FraudLens Kreol Morisien Support

## Purpose

This directory contains the Kreol Morisien language resources for **FraudLens**,
built for **Finnovate Hackathon 2026 — Challenge 5, sponsored by Clarity**.

Hackathon theme:

> FinTech & Innovation

Build window:

> 72 hours

Challenge:

> How can AI help customers identify warning signs in suspicious financial
> messages before they make a payment?

FraudLens is a consumer-facing scam-detection web application.

A user submits a suspicious financial message as pasted text or a screenshot.
FraudLens analyses it and returns:

- a risk/verdict
- structured warning signals
- evidence explaining each warning
- identity/domain/payment inconsistencies where available
- uncertainty where something cannot be verified
- a concrete safe next action

Examples of signals include:

- urgency or threats
- secrecy
- requests for OTP/security codes
- suspicious or lookalike URLs
- sender/organisation mismatch
- impersonation
- unusual payment requests
- beneficiary mismatch
- social-engineering language

The goal of this directory is to make that experience work reliably for
**Mauritian Kreol / Kreol Morisien**, including realistic Mauritian
code-switching with English and French.

---

# 1. Ownership and Scope

This directory is owned by **Joshua**, whose hackathon responsibility is:

> Kreol language support

Work in this directory unless a task explicitly requires an integration change
elsewhere.

The repository-level `CLAUDE.md` remains the source of truth for:

- team ownership
- branch workflow
- repository-wide conventions
- backend/frontend ownership
- API boundaries
- general architecture

Do not override repository-level ownership rules from this file.

Do not edit another team member's area simply because an integration would be
convenient.

If backend integration is required, prepare the data structure, interface,
example payload or integration instructions first.

Only modify another owned area when the user explicitly asks for it.

---

# 2. What This Subsystem Is

This is a **domain-adapted Kreol language layer for financial scam analysis**.

It is NOT intended to become:

- a general-purpose Kreol translator
- a machine-translation research project
- a language-model training project
- a standalone NLP product
- an AML/KYC platform

Kreol support exists to make FraudLens better at understanding and explaining
suspicious financial messages encountered in Mauritius.

The system should optimise for:

1. preserving the meaning of the original message
2. preserving fraud-relevant details
3. understanding Mauritian financial/scam terminology
4. handling English/French/Kreol code-switching
5. producing understandable Kreol explanations for users
6. supporting downstream structured fraud analysis

Translation quality matters, but **fraud-analysis fidelity matters more than
literary translation quality**.

---

# 3. Product Context

FraudLens should not behave like:

```text
message
→ generic LLM
→ "this looks like a scam"
```

The wider project follows an evidence-driven workflow closer to:

```text
Message / Screenshot
        ↓
Structured extraction
        ↓
Deterministic checks
        ↓
AI scam-pattern analysis
        ↓
Evidence
        ↓
Risk assessment
        ↓
Safe action
```

Kreol support must fit into this architecture.
The Kreol layer should help the application correctly identify things such as:

```text
claimed identity
requested action
payment request
amount
currency
OTP/code request
URL/domain
phone number
beneficiary
urgency
threat
secrecy
authority pressure
impersonation
financial terminology
scam pattern
```

Do not reduce a message to a translation if doing so loses evidence needed by
the fraud-analysis pipeline.

# 4. Core Language Principle

Mauritian scam messages are often not written in clean monolingual Kreol.
Expect code-switching such as:

```text
Ou account inn suspend. Please verify ou details lor sa link la.
```

or:

```text
Bonzour, ou'nn gagn enn remboursement MRA Rs 8,400.
Klik lien la pou resevwar li avan 24h.
```

The system must tolerate mixtures of:

- Kreol Morisien
- French
- English

Do NOT assume the entire message belongs to one language.
Do NOT translate or normalise away important entities.
Preserve, where relevant:

- URLs
- domains
- phone numbers
- amounts
- currencies
- dates/times
- OTPs/security codes
- organisation names
- bank names
- usernames
- account fragments
- beneficiary names
- payment references

Example:

```text
"MCB pe demann ou confirm OTP 482913 lor secure-mcb-login.top"
```

must retain:

```text
MCB
OTP
482913
secure-mcb-login.top
```

even if surrounding language is translated or normalised.

# 5. Translation Memory

Primary file:

```text
translation-memory.csv
```

Current schema:

```text
english,
kreol_morisien,
domain,
status,
reviewed_by,
notes
```

Keep this schema stable unless the user explicitly approves a migration.
The translation memory is intended for:

- consistent terminology
- recurring UI phrases
- scam terminology
- banking/payment vocabulary
- prompt grounding
- retrieval-assisted translation
- evaluation references

It is NOT itself a sentence-level scam corpus.

# 6. Trust and Review Status

Never represent AI-authored Kreol as human-reviewed.
Use explicit review states.
Preferred statuses:

```text
owner_reviewed
ported_reviewed
draft_generated
rejected
```

Meaning:

`owner_reviewed`
Joshua has explicitly reviewed and approved the Kreol translation.
This is the highest-trust tier.

`ported_reviewed`
The entry was ported from the previous BlueNet Kreol project and had already
been reviewed there.
Keep provenance in `notes`.

`draft_generated`
The translation was generated or proposed without owner review.
It may be useful for review, experimentation or development, but must not be
silently treated as authoritative language data.

`rejected`
The translation was reviewed and should not be used.

# 7. Critical Rule: Never Fabricate Review

Claude MUST NOT:

- set `owner_reviewed` itself
- claim Joshua reviewed something when he did not
- convert `draft_generated` to `owner_reviewed`
- invent a reviewer name
- infer approval because a translation "looks correct"
- silently repair a reviewed translation and leave it marked reviewed

If a reviewed row appears questionable:

1. leave the original evidence intact
2. flag the issue
3. propose a replacement
4. mark the proposed version as draft
5. ask for owner review where necessary

Human review is a data property, not an AI confidence score.

# 8. Previous Project

The initial Kreol resources were ported from Joshua's previous project:

```text
C:\Users\joshw\OneDrive\Desktop\Hackathon\Gemma-Blue-Mauritius-Beyond
```

That project may be used as a source of:

- reviewed translations
- orthography conventions
- reusable scripts
- translation-memory tooling
- general/UI terminology

Do NOT blindly import domain-specific material.
In particular, maritime vocabulary from BlueNet is not relevant to FraudLens
unless a particular phrase is genuinely domain-independent.
When porting content:

- preserve provenance
- distinguish ported reviewed material from newly generated material
- do not claim old domain-specific language is valid for financial scams
- prefer quality over dataset size

# 9. Financial/Scam Domain

New language work should prioritise terminology encountered in FraudLens.
Important areas include:

Banking

```text
bank account
account blocked
account suspended
balance
transaction
transfer
beneficiary
bank details
verification
security alert
refund
payment received
```

Authentication

```text
OTP
one-time code
security code
PIN
password
login
verification code
confirm identity
```

Payments

```text
payment
send money
transfer money
beneficiary
recipient
QR payment
mobile payment
bank transfer
refund
fee
charge
```

Scam behaviour

```text
urgent
immediately
within 24 hours
account will be blocked
do not tell anyone
click this link
confirm now
send the code
new number
guaranteed return
prize
refund
parcel fee
customs fee
investment
```

FraudLens concepts

```text
warning sign
suspicious message
likely scam
high risk
verify safely
claimed sender
identity mismatch
domain mismatch
payment mismatch
reported by others
do not click
do not pay
contact your bank
report this message
```

Prefer terminology users in Mauritius would actually understand over literal
word-for-word translation.

# 10. Scam Corpus

A phrase-level translation memory is not enough for realistic evaluation.
Maintain a separate sentence/message-level corpus.
Preferred file:

```text
scam-corpus.csv
```

Recommended schema:

```text
id,
original_message,
language_mix,
english_meaning,
scam_type,
risk_signals,
entities,
status,
reviewed_by,
notes
```

The corpus should contain realistic financial-message contexts rather than only
isolated vocabulary.
Target categories include:

- bank impersonation
- MRA/refund impersonation
- mobile-payment scams
- OTP theft
- account suspension
- fake payment alerts
- parcel/customs fee scams
- WhatsApp family impersonation
- changed-number scams
- fake jobs
- investment/crypto scams
- prize/lottery scams
- phishing links
- account-verification scams
- urgent-transfer scams
- fake merchant/payment-detail changes

Do not use real personal information.
Synthetic examples must be identified as synthetic.
Do not label generated examples as real-world scam reports.

# 11. Mauritius Context

FraudLens is being built for a Mauritian hackathon and Kreol support should feel
local rather than generic.
Where appropriate, datasets and test examples may reference common Mauritian
contexts such as:

- local banks
- MRA-style impersonation
- mobile payments
- MUR / Rs amounts
- local phone-number formats
- parcel/customs scams
- mixed French/English/Kreol wording

However:

- do not claim a real organisation sent a scam message
- do not fabricate actual incidents
- clearly mark fictional demonstration organisations where appropriate
- avoid implying an organisation has a security problem without evidence

For generic demos, names such as `OceanBank` are safe fictional examples.

# 12. Retrieval-Assisted Translation

For the hackathon, prefer retrieval/prompt grounding over fine-tuning.
Recommended conceptual flow:

```text
incoming message
        ↓
detect Kreol/French/English mixture
        ↓
extract protected entities
        ↓
retrieve relevant approved TM entries
        ↓
translate / normalise with grounded examples
        ↓
restore/preserve protected entities
        ↓
pass structured result to fraud analysis
```

Approved translation-memory entries should be preferred as prompt context.
By default, production-quality retrieval should prioritise:

```text
owner_reviewed
ported_reviewed
```

Do not allow large amounts of unreviewed generated text to become
self-reinforcing prompt context.
`draft_generated` entries may be included only when the caller explicitly
requests experimental/draft retrieval.

# 13. No Fine-Tuning by Default

Do NOT introduce:

- LoRA
- QLoRA
- model training
- GPU training pipelines
- fine-tuning datasets
- model-weight management
- training/evaluation infrastructure copied from BlueNet

unless the user explicitly changes the scope.
This is a 72-hour hackathon.
The default strategy is:

```text
good data
+
retrieval
+
prompt grounding
+
evaluation
```

not model training.

# 14. Orthography

Maintain consistent Kreol Morisien spelling.
The existing reviewed corpus should be treated as useful evidence for
orthographic conventions, but not as an infallible dictionary.
`tm_tool.py` may enforce mechanical quality checks.
Checks may include:

- malformed CSV
- missing required values
- duplicate entries
- invalid status
- accidental French drift
- accidental Haitian Creole markers
- obvious placeholder content
- malformed Unicode
- suspicious punctuation/whitespace
- duplicate English source with conflicting approved translations

Automated orthography checks are warnings, not proof that a translation is
linguistically correct.
Do not automatically rewrite owner-reviewed text solely because a heuristic
flags it.

# 15. `tm_tool.py`

Location:

```text
scripts/tm_tool.py
```

The tool is a standalone dataset utility.
Expected responsibilities:

```text
check
to-jsonl
to-csv
```

It should:

- validate the translation-memory schema
- validate review statuses
- detect obvious data-quality problems
- preserve UTF-8 correctly
- generate deterministic JSONL
- avoid silently modifying reviewed content

The generated JSONL is derived data.
The CSV is the human-editable source of truth unless documented otherwise.
Do not introduce a database merely for this dataset during the hackathon.

# 16. Evaluation

Translation quality must eventually be measured against a small,
high-quality reviewed evaluation set.
Preferred file:

```text
evaluation-set.csv
```

Evaluation should focus on FraudLens requirements, not just generic translation
similarity.
Important dimensions:

Meaning preservation
Did the translated/normalised version retain what the sender is asking?

Fraud-signal preservation
Were things such as urgency, secrecy, threats and authority pressure retained?

Entity preservation
Were URLs, numbers, organisation names, amounts and codes preserved?

Financial terminology
Were financial concepts translated consistently and correctly?

Code-switch handling
Did the system correctly handle mixed-language messages?

Hallucination
Did it introduce facts that were not present?

Omission
Did it remove information relevant to scam detection?

A fluent translation that destroys a fraud signal is a failure.

# 17. Evidence Preservation

FraudLens is evidence-driven.
The wider application distinguishes objective signals from contextual AI
analysis.
Examples of deterministic signals:

```text
DOMAIN_MISMATCH
OTP_REQUEST
URL_SHORTENER
RECENT_DOMAIN
BENEFICIARY_MISMATCH
```

Examples of contextual signals:

```text
URGENCY
THREAT
AUTHORITY_PRESSURE
SECRECY
IMPERSONATION
SOCIAL_ENGINEERING
```

Kreol processing must preserve enough of the source message for these signals
to be justified.
When possible, retain mappings between:

```text
original text span
        ↕
normalised/translated meaning
        ↕
detected signal
```

Do not make explanations impossible to trace back to the user's message.

# 18. Privacy

FraudLens is designed around privacy-aware analysis.
Do not add real user data to the translation memory, corpus or test fixtures.
Never commit:

- real account numbers
- real OTPs
- private phone numbers
- personal email addresses
- confidential financial details
- screenshots containing identifiable personal information

Use synthetic placeholders where needed.
Example:

```text
[PERSON]
[ACCOUNT]
[PHONE]
[EMAIL]
```

Fraud-relevant entities such as suspicious domains may need to remain available
to the wider analysis pipeline, so do not blindly redact everything.

# 19. Output Style for Consumer Kreol

User-facing Kreol should be:

- clear
- concise
- natural
- understandable to ordinary Mauritian users
- appropriate for financial safety messaging

Avoid:

- unnecessarily academic wording
- obscure linguistic terminology
- literal translation that sounds unnatural
- overly formal French-like phrasing when normal Kreol is clearer

For safety guidance, clarity outranks stylistic creativity.
Example intent:

```text
Pa klik lor sa link-la.
```

is preferable to a complicated sentence when the objective is simply to tell
the user not to click.
Do not invent banking policy.

# 20. Risk Communication

Kreol localisation must preserve the product's risk discipline.
FraudLens should not blindly convert uncertain outputs into definitive claims.
Prefer concepts such as:

```text
low risk
caution
high risk
critical
could not verify
likely scam
warning signs detected
```

over unsupported certainty.
The system should be able to explain:

```text
what was detected
why it matters
what remains unknown
what the user should safely do next
```

The product must not imply that absence of warning signs proves a message is
genuine.

# 21. Do Not Create Fake Evidence

Never fabricate:

- domain registration dates
- community report counts
- bank verification results
- beneficiary verification
- phone-number reputation
- fraud campaign matches
- scam-report statistics

Demo fixtures may contain synthetic values, but they must be clearly identifiable
as demo/test data.
Translation work must not turn fictional test evidence into purported real-world
evidence.

# 22. Relationship to Fraud Analysis

Kreol language support should make downstream fraud detection stronger.
A useful language result may therefore contain more than plain translated text.
Potential internal structure:

```json
{
  "source_language": ["mfe", "en"],
  "original_text": "...",
  "normalized_text": "...",
  "english_meaning": "...",
  "protected_entities": [],
  "financial_terms": [],
  "possible_fraud_phrases": [],
  "translation_sources": []
}
```

This is illustrative, not a repository-wide API contract.
Before introducing a new contract:

1. inspect the current implementation
2. inspect `docs/API-CONTRACT.md`
3. avoid breaking another owner's code
4. propose the smallest compatible integration

The implemented API contract takes precedence over examples in this file.

# 23. Do Not Over-Engineer

This is a hackathon subsystem.
Optimise for:

```text
correct
testable
demonstrable
easy to integrate
```

before:

```text
perfect
large-scale
research-grade
production-complete
```

Avoid unnecessary:

- microservices
- vector databases if simple in-memory retrieval is enough
- graph databases
- training pipelines
- elaborate orchestration
- new infrastructure
- abstractions with only one implementation

Every addition should answer:
Does this materially improve Kreol scam-message understanding or the demo?
If not, defer it.

# 24. Recommended Directory Shape

Aim toward:

```text
data/kreol-dataset/
├── CLAUDE.md
├── README.md
├── translation-memory.csv
├── translation-memory.jsonl
├── scam-corpus.csv
├── evaluation-set.csv
├── scripts/
│   ├── tm_tool.py
│   ├── corpus_tool.py
│   └── evaluate_translation.py
└── tests/
```

Do not create empty files/directories simply to match this diagram.
Create them only when they have an actual purpose.

# 25. Working Method

Before changing files in this directory:

1. inspect the existing files
2. inspect the root `CLAUDE.md`
3. inspect the current Git diff/status
4. determine whether the requested change affects another owner's area
5. preserve existing reviewed language data
6. make the smallest useful change
7. validate the dataset/scripts
8. report exactly what changed

When modifying schemas or interfaces:

1. identify all readers/writers
2. state affected callers
3. preserve backward compatibility where practical
4. do not silently migrate user-reviewed data

# 26. Testing Expectations

For dataset/script changes, test at least:

```bash
python scripts/tm_tool.py check
```

and any relevant conversion command.
Where tests exist, run them.
Important cases include:

- UTF-8 Kreol characters
- commas/quotes/newlines inside CSV fields
- duplicate entries
- unknown status
- empty translations
- code-switched input
- URLs inside Kreol text
- amounts such as `Rs 8,400`
- OTP/code preservation
- English financial terms embedded in Kreol
- French phrases embedded in Kreol
- rejected/draft rows excluded where appropriate

Do not report a command as passing unless it was actually executed.

# 27. Current Priorities

In priority order:

P0 — Protect and clean the existing translation memory

- preserve provenance
- establish trustworthy review statuses
- validate data
- remove accidental domain leakage from BlueNet

P1 — Build financial/scam terminology
Focus on terms actually required by FraudLens.

P2 — Build a sentence-level scam corpus
Include realistic Mauritian code-switching.

P3 — Retrieval-assisted translation
Ground translation using approved terminology/examples.

P4 — Evaluation harness
Measure whether the Kreol layer preserves meaning, entities and fraud signals.

P5 — Backend integration
Integrate only after the language layer has a stable useful interface.

Fine-tuning is explicitly outside the current default scope.

# 28. Definition of Done

Kreol support is successful for the hackathon when FraudLens can take realistic
Mauritian financial messages such as:

```text
Bonzour, ou'nn gagn enn remboursement MRA Rs 8,400.
Klik lien la pou resevwar li avan 24h.
```

or mixed-language messages such as:

```text
Ou account pou suspend azordi.
Please verify your details lor sa link-la.
```

and reliably preserve enough meaning for FraudLens to identify:

```text
claimed organisation
financial request
urgency
link
requested action
possible impersonation
other scam signals
```

while also being able to explain the result to a Kreol-speaking user in clear
Mauritian Kreol.

The objective is not:
"We built a Kreol translator."

The objective is:
"FraudLens can understand and explain financial scam messages in the language
Mauritians actually use."

## Natural Code-Switching

Do not create code-switched messages by writing an English or French sentence
and mechanically replacing individual words with Kreol equivalents.

Bad pattern:

English sentence structure
+ isolated Kreol substitutions
+ English banking vocabulary

Code-switching should reflect plausible Mauritian usage.

A message may naturally keep terms such as:

- OTP
- account
- bank
- transfer
- payment
- security
- transaction
- link

in English or French while the surrounding sentence follows natural Kreol
speech patterns.

The objective is not to maximise the number of languages in a row.

`mfe+en`, `mfe+fr`, and `mfe+en+fr` should only be assigned when the message
contains natural, meaningful code-switching.

If natural phrasing is uncertain, generate the row as `draft_generated` and
explicitly flag:

`needs_native_code_switch_review`

Do not attempt to manufacture multilinguality merely to satisfy dataset
distribution targets.