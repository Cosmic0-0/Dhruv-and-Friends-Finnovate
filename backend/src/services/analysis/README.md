# Analysis service

Bounded **semantic** analysis for `POST /api/analyze` (called from
`services/pipeline`). The model interprets language only: it returns
enum-coded semantic signals (`SEMANTIC_CODES` in `services/signals/registry.js`)
with an exact quote from the message, plus a scam type/stage from fixed
enums. It does **not** return a verdict, score or advice - the deterministic
risk engine (`services/risk-engine`) decides.

- The message is fenced as `<untrusted_message>` data; instructions inside
  it are reported as `SOC-07`, never followed.
- Every quote is grounded against the normalised message
  (`normalize.locateEvidence`); ungrounded or off-enum signals are rejected.
- `analyzeSemantics()` never throws: timeout / provider down / invalid JSON
  resolve to `status: "unavailable" | "invalid"`, and the pipeline carries
  on deterministically.

Transport + failover (Ollama over Tailscale → hosted fallback) is in
`llmClient.js`; `npm run test:fallback` checks it before the demo.
