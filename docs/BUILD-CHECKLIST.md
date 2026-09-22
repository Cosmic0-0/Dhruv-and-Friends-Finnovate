# Build Checklist (ordered by rubric weighting)

> Add a reliability stress test for the local LLM path around hour 55-60 of the
> 72-hour window. If Tailscale/laptop inference proves flaky under demo-like
> conditions, switch to fallback-only for the submission and keep local inference
> as an architecture talking point rather than a live dependency.

See [`JURY-EVALUATION.md`](./JURY-EVALUATION.md) for the full rubric these groups
are weighted against.

## Implementation & Functionality — 35 marks
- [x] Core message analysis working end-to-end (`POST /api/analyze`) —
      verified 2026-09-22 live in a real browser: paste → verdict → full
      structured result screen, through the actual (fallback) LLM path.
- [ ] Fallback provider tested under simulated Tailscale/laptop failure —
      tested 2026-09-22, and it's WORKING but NOT reliable: `npm run
      test:fallback` against the real analyze prompt took 19.5s/27.4s/
      38.8s/43.8s across runs, and one run didn't finish inside 35s.
      `LLM_TIMEOUT_MS` raised 15000→60000 (see `backend/.env.example`) to
      stop it failing outright, but the free-tier model's reasoning
      overhead is inherently unbounded — do not check this box until
      either a faster/non-reasoning fallback model is found or the demo
      plan explicitly accepts "up to ~60s per check if Ollama is down."
- [ ] Batch scan functional (`POST /api/batch-scan`) — not exercised this
      session (would need several sequential LLM calls through the same
      unreliable free fallback tested above; not attempted to avoid
      burning more rate-limited free-tier budget).
- [ ] OCR ingestion functional (screenshot upload → extracted text →
      analysis) — backend route exists and is unit-tested, but the
      frontend upload button is still disabled ("coming soon" —
      `frontend/components/CheckForm.tsx`), so there's no live UI path to
      exercise end-to-end yet.
- [x] No crashes on malformed input (empty message, non-text upload,
      oversized batch) — verified 2026-09-22: empty/missing `message`,
      6000-char oversized `message`, malformed JSON body, 60-item
      oversized batch, empty batch array, and a non-image upload to
      `/api/analyze/screenshot` all returned clean 400s with no crash;
      `/health` stayed green throughout.

## Innovation & Technical Excellence — 25 marks
- [ ] Kreol dataset integrated and demonstrably working — the corpus is
      now wired into the LLM prompt as grounding (2026-09-22,
      `backend/src/services/analysis/kreolGrounding.js`) and unit-tested
      with a mocked LLM, but "demonstrably working" against the REAL
      model hasn't been checked — nobody has yet reviewed what an actual
      Ollama/fallback response looks like for a Kreol message with
      grounding applied, in either language quality or signal accuracy.
- [x] Structured signal breakdown visible in UI output (not a single
      score) — verified 2026-09-22 live: a real scam check rendered 5
      distinct, titled, severity-tagged signal cards plus a separate Link
      Check panel, never a bare score.
- [x] Domain matching catching real lookalike examples in test payloads —
      verified 2026-09-22 by an automated test
      (`backend/src/services/domain-matching/test-payloads.test.js`)
      cross-checking `checkUrls()` against all 40 of Caellum's en/fr QA
      payloads in both directions (every expected `lookalike_url` fires,
      no false positives on payloads that don't expect one).

## Impact & Problem Solving — 25 marks
- [ ] Vulnerable-user protection mode working
- [ ] Crowdsourced threat feed has seeded demo data
- [ ] Scalability story ready to state verbally (local inference cost/privacy argument)

## Presentation & Demonstration — 15 marks
- [ ] Presenter roles assigned per team member
- [ ] Demo script covering explanation of the local-LLM architecture choice
- [ ] Q&A prep for "why self-hosted instead of a hosted API"
