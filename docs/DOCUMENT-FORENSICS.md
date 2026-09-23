# Document forensics

**Status: ingestion only.** `POST /api/documents` (see
`docs/API-CONTRACT.md`) stores an uploaded document's exact original bytes
and OCRs image documents. The forensics pipeline that actually inspects a
stored document for tampering indicators — metadata/PDF forensics, error
level analysis, forgery localization, and layout/template comparison — is
being added on top of this ingestion path. This file will describe what
each check does, how results are aggregated, and — explicitly — what the
feature does and does not claim, once those checks land.

## What this will not claim, even once complete

- No identity verification. A signature-consistency check (stroke-width/
  pressure irregularity) never claims to identify or match a signer — there
  is no reference signature to compare against.
- No legal authentication. Nothing this pipeline produces is "forged" or
  "authentic" — only indicators with a confidence label, the same pattern
  used by `scanForErrorSignatures()` in `backend/src/services/site-
  security/checks.js` for the SQL/OS-command error-string scan: a possible
  weakness, not a confirmed one.
- "No tampering indicators found" is not the same claim as "verified" or
  "authentic," and the response never uses those words.
