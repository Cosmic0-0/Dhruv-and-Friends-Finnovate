# email-signals (backend owner)

Deterministic workplace-email detectors (`EMAIL-01`..`EMAIL-10`) for BEC,
supplier impersonation, invoice / payment-redirection fraud, executive
impersonation and conversation hijack. The question they help answer: *should
an employee act on the financial instruction in this email?*

```
Outlook / email client (future add-in)
  -> POST /api/analyze { message: <body>, emailContext }
  -> services/email-context      validate + normalise (every field optional)
  -> services/pipeline runPipeline()   the SAME pipeline as SMS/screenshot
       -> email-signals detectEmailSignals()   EMAIL-* (this module, no scoring)
       -> URL / identity / lexicon / payment detectors, one semantic call (body only)
  -> signal registry -> dedupe -> risk engine rs-1.3 -> interventions-1.1
```

- **No scoring here.** Points, interactions (EX-1..EX-6), the EX-2 floor and
  the SOC-07 policy live in `services/risk-engine` (rs-1.1, carried into rs-1.2/rs-1.3 unchanged).
- **No fabricated certainty.** Each code needs its evidence: no thread
  history -> no EMAIL-04; no account on record -> no EMAIL-06; missing auth
  results -> no EMAIL-03. `analysis.email.checks` reports what actually ran.
- **Authentication is evidence, not proof.** DMARC pass -> no EMAIL-03; SPF
  fail with DKIM pass (forwarding) -> no EMAIL-03. Passing authentication
  never makes an email "safe" (compromised mailboxes pass it).
- **No LLM on metadata.** Addresses, auth results, attachments and registry
  data are compared in code; the model only ever sees subject + body.
- **Reference data is demo data**: `services/workplace-registry` loads
  `data/demo-supplier-registry.json` and `data/demo-organisation-directory.json`
  (fictional, `.example` domains). Tests can pass their own registries.
- Domain comparison reuses `domain-matching.compareDomains()` (same
  edit-distance and confusable skeleton as URL-01 / URL-04).

Full contract, weights and false-positive safeguards: `docs/API-CONTRACT.md`
"Email analysis". Demo fixtures: `backend/fixtures/email-demo.json`.

## Demo script (Outlook story)

1. `legitimate-supplier-invoice` - quiet: known supplier, account on record.
2. `supplier-bank-change-fraud` - look-alike `abc-suppiies`, Reply-To Gmail,
   account `****6789` vs `****4491` on record. Point out that DMARC **passed**.
3. `bank-change-no-baseline` - same wording, unknown account history: no
   EMAIL-06 ("we don't claim what we can't verify").
4. `compromised-legitimate-sender` - real address, all auth passes, still
   stopped: account not on record + "keep this between us" + "no need to call".
5. `ceo-bec-request` - "Jane Smith - CEO" from Gmail: EMAIL-09 + secrecy +
   skip-finance -> critical, "confirm via normal approval process".

Pre-demo reliability: all five run with the LLM off (`semantic` unavailable)
and give the same level - covered by `src/services/pipeline/email.test.js`.
