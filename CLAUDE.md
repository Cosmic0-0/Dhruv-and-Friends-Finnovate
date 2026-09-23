# Repository guidance

FraudLens AI is a hackathon prototype for detecting warning signs in suspicious
financial messages before a user pays or shares credentials. Reliability during
the live demo is the highest priority, followed by visible differentiation and a
clear explanation of the evidence behind each decision.

See [`docs/JURY-EVALUATION.md`](./docs/JURY-EVALUATION.md) for the rubric and
[`docs/BUILD-CHECKLIST.md`](./docs/BUILD-CHECKLIST.md) for current demo readiness.

## Sources of truth

- `docs/API-CONTRACT.md`: implemented HTTP contract.
- `EXPLAINER.md`: current architecture, data flow, and limitations.
- `checklist.md`: security and launch-readiness status.
- `data/institution-registry.json`: institution names, aliases, and official
  domains used by deterministic checks.
- `backend/src/services/signals/registry.js`: accepted signal codes and weights.
- `backend/src/services/risk-engine/index.js`: deterministic score and level rules.
- `backend/src/services/playbooks/index.js`: finite scam-type and journey-stage
  taxonomy used by Scam Journey and the sandbox.

Do not maintain historical API sketches or session changelogs as parallel sources
of truth. Update the relevant durable document when behavior changes.

## Architecture invariants

- The LLM interprets language only. It may return enum-coded semantic signals,
  exact evidence quotes, an observed sender, a scam type, and a journey stage.
  It never owns the verdict, risk score, decision, or action plan.
- Every model-produced signal must use an allowed code and quote text present in
  the normalized message. Reject unknown codes and hallucinated evidence.
- The deterministic pipeline remains useful when the model is unavailable,
  times out, or returns invalid JSON.
- Domain matching, identity checks, payment-context checks, reputation evidence,
  and score arithmetic stay deterministic and unit-testable.
- Frontend, extension, and Outlook consumers must follow `docs/API-CONTRACT.md`.
  Detection logic belongs in the backend and must not be copied into clients.
- Never fabricate live reports, campaigns, trends, review decisions, or model
  availability. Empty data must render as empty data.
- Treat message content and screenshots as untrusted input. Preserve the current
  redaction, input limits, evidence grounding, SSRF protection, and output
  validation when extending a flow.
- Keep simulated scam content bounded by the fixed backend playbooks and clearly
  label it as fictional. The sandbox must never contact a real person or accept
  arbitrary contact details or links.

## Project structure

```text
backend/src/routes/                    HTTP validation and response handling
backend/src/services/pipeline/         shared analysis orchestration
backend/src/services/analysis/         semantic prompt, validation, LLM transport
backend/src/services/risk-engine/      deterministic score, level, confidence
backend/src/services/domain-matching/  URL extraction and lookalike checks
backend/src/services/community-signals privacy-minimised report clustering
backend/src/services/site-security/    passive site checks with SSRF protection
backend/src/services/document-forensics/         PDF/DOCX forensics, feeds a verdict
backend/src/services/document-store/             stores uploaded document bytes
backend/src/services/document-forensics-client/  HTTP client for document-forensics/
backend/src/db/                        SQLite schema and queries
frontend/                              Next.js PWA and all web product flows
extension/                             Manifest V3 client of the backend API
outlook-addin/                         Office.js read-mode client of the backend API
document-forensics/                    optional Python service: image forgery
                                       indicators for POST /api/documents, never a verdict
data/                                  registries, reviewed language data, QA data
```

`backend/`, `frontend/`, `outlook-addin/` and `extension/` are separate Node
projects. There is intentionally no root Node package.

## API and coding conventions

- Keep route handlers thin. Put detection and policy logic in services.
- Validate request shape and size on the server even when the client validates it.
- Return generic external errors; log operational details server-side.
- Preserve additive compatibility for the locked API contract unless every client
  and the contract are updated together.
- Render user content through React text nodes. Do not introduce raw HTML renderers
  for analysis evidence.
- Prefer real aggregate data and explicit unavailable/empty states over examples
  that look live.
- Keep English, French, and Kreol UI copy aligned. Kreol copy that has not been
  reviewed must not be described as reviewed.

## Verification

Use Node 22. Run checks from each project directory:

```bash
cd backend && npm test
cd frontend && npm test
cd frontend && npm run typecheck
cd frontend && npm run build
cd outlook-addin && npm test
cd outlook-addin && npm run build
cd outlook-addin && npm run validate
cd extension && npm test
cd document-forensics && python -m pytest   # Python 3.12 venv, see its README
```

Route tests bind temporary localhost servers and may need network-sandbox
permission. Frontend tests do not run under Node 20 because they are TypeScript
files executed directly by Node. ESLint is not configured yet, so `npm run lint`
is currently interactive and must not be cited as a passing automated check.

Before a demo, also run `npm run test:fallback` in `backend/`, check
`GET /health/llm`, exercise at least one real English/French/Kreol message, and
complete the extension checklist in `extension/README.md`.

## Repository hygiene

- Preserve unrelated work in a dirty worktree.
- Do not commit `.env`, database files, trained OCR data, generated build output,
  or secrets.
- Commits and pull requests are attributed to the human pushing them. Do not add
  AI co-author trailers.
- The backend owner is referred to by role in project documentation. The personal
  name previously used for that role should not be added elsewhere.
