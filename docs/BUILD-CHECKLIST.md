# Build Checklist (ordered by rubric weighting)

Local Ollama over Tailscale is the primary LLM path for the demo; with
thinking disabled it is the fast, reliable one. The free-tier hosted fallback
is the flaky backup, because its model's reasoning mode cannot be turned off.
Check `GET /health/llm` and run `npm run test:fallback` on the demo machine
shortly before presenting, and remember that the deterministic verdict still
works when both are down.

See [`JURY-EVALUATION.md`](./JURY-EVALUATION.md) for the full rubric these groups
are weighted against.

## Implementation & Functionality — 35 marks
- [x] Core message analysis working end-to-end (`POST /api/analyze`).
      Last verified live 2026-09-22 in a real browser through both LLM
      paths: the hosted fallback, and the local Ollama model on GPU hardware
      with thinking disabled in `callOllama()`
      (`backend/src/services/analysis/llmClient.js`), about 12s end to end
      with the correct verdict and all structured signals.
- [ ] Fallback provider tested under simulated Tailscale/laptop failure.
      It works but is not reliable: on 2026-09-22 `npm run test:fallback`
      against the real analyze prompt took 19.5s to 43.8s, and one run did
      not finish inside 35s. `LLM_TIMEOUT_MS` is 60000 in
      `backend/.env.example` so it does not fail outright. Leave this
      unchecked until a faster, non-reasoning fallback model is found or
      the demo plan accepts up to about 60s per check when Ollama is down.
- [x] Batch scan functional (`POST /api/batch-scan`). Each result carries
      the full `/api/analyze` response. Last verified live 2026-09-22
      through the local model: a 4-message batch gave the correct verdicts
      and summary counts with 0 unanalysed, in about 30s.
- [x] OCR ingestion functional (screenshot upload → extracted text →
      analysis). `frontend/components/ScreenshotUpload.tsx` compresses the
      image client-side and posts it to `/api/analyze/screenshot`;
      `frontend/components/check/Workspace.tsx` keeps the OCR text in
      memory, not shown, and sends it to `/api/analyze` when the user
      presses Check. That second call means the verdict shown ignores the
      screenshot's image-forensics signals (DOC-09..13); see
      `docs/API-CONTRACT.md` Known Gaps. The backend path was last verified
      live on 2026-09-22 with a generated PNG and the local model (about
      9s), before image forensics was added; the current UI flow has not
      been verified live.
- [x] Document forensics (`POST /api/analyze/document`, `/document` in the
      web app). Last verified 2026-09-23:
      - Backend tests cover every DOC detector, each demo fixture end to end
        through the real worker, the route's error states, a worker timeout,
        the busy cap and an LLM outage.
      - Fixtures and expected verdicts are in `data/test-payloads/documents/README.md`.
        Regenerate them with `npm run fixtures:documents`.
      - Uploads went through the Next proxy against a live backend. Next's
        10MB request-body clone limit was truncating uploads, so
        `middlewareClientMaxBodySize` is set to 15mb in
        `frontend/next.config.ts`.
- [ ] Document demo rehearsal: upload `forged-signature.pdf` (expect HIGH, the
      pasted-signature preview and "iLovePDF"), then `legit-scan.pdf` (a genuine
      form, LOW). Also run the `edited-amount.pdf`, a renamed `.txt` and
      `encrypted.pdf` error states in the real browser in EN/FR/Kreol.
      Kreol document copy is an unreviewed English fallback (`TODO_KREOL`).
      With the tailnet Ollama reachable (qwen3:8b), a document took 3-10s
      end to end on 2026-09-23. If the backend cannot reach Ollama (check that
      `OLLAMA_URL` points at the tailnet host, not `localhost`), each document
      waits for the LLM timeout (about 60s) before the deterministic verdict
      appears.
- [x] No crashes on malformed input (empty message, non-text upload,
      oversized batch). Last verified 2026-09-22: empty/missing `message`,
      6000-char oversized `message`, malformed JSON body, 60-item
      oversized batch, empty batch array, and a non-image upload to
      `/api/analyze/screenshot` all returned clean 400s with no crash;
      `/health` stayed green throughout.

## Innovation & Technical Excellence — 25 marks
- [x] Kreol dataset integrated and demonstrably working. Reviewed corpus
      entries are retrieved as prompt grounding
      (`backend/src/services/analysis/kreolGrounding.js`) and unit-tested
      with a mocked LLM. Last verified live 2026-09-22: a mfe+en
      code-switched message ("Ou kont pou bloke azordi. Klik lor
      mcb-secure.top...") returned a scam verdict with the identity-mismatch
      check. Not checked: whether grounding measurably improves output
      compared with no grounding (no A/B run).
- [x] Structured signal breakdown visible in UI output (not a single
      score). Last verified live 2026-09-22: a scam check rendered separate,
      titled, severity-tagged signal cards and a Link Check panel.
- [x] Domain matching catching real lookalike examples in test payloads.
      `backend/src/services/domain-matching/test-payloads.test.js`
      cross-checks `checkUrls()` against all 40 of the QA owner's en/fr
      payloads in both directions (every expected `lookalike_url` fires, and
      none fires on payloads that don't expect one). Passing on
      2026-09-23.

## Impact & Problem Solving — 25 marks
- [x] Vulnerable-user protection mode implemented as the result screen's
      action-first Simple mode, including read-aloud support when available.
- [x] Crowdsourced threat-feed seed data and loader exist under
      `data/sender-reputation-seed/`; load and verify it on the demo database.
- [x] Scalability and privacy trade-offs are documented in `EXPLAINER.md`;
      the presenter still needs to rehearse the short version.

## Presentation & Demonstration — 15 marks
- [ ] Presenter roles assigned per team member
- [ ] Demo script covering explanation of the local-LLM architecture choice
- [ ] Q&A prep for "why self-hosted instead of a hosted API"
