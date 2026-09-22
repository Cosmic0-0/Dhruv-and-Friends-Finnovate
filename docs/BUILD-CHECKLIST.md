# Build Checklist (ordered by rubric weighting)

> Add a reliability stress test for the local LLM path around hour 55-60 of the
> 72-hour window. If Tailscale/laptop inference proves flaky under demo-like
> conditions, switch to fallback-only for the submission and keep local inference
> as an architecture talking point rather than a live dependency.

See [`JURY-EVALUATION.md`](./JURY-EVALUATION.md) for the full rubric these groups
are weighted against.

## Implementation & Functionality — 35 marks
- [ ] Core message analysis working end-to-end (`POST /api/analyze`)
- [ ] Fallback provider tested under simulated Tailscale/laptop failure
- [ ] Batch scan functional (`POST /api/batch-scan`)
- [ ] OCR ingestion functional (screenshot upload → extracted text → analysis)
- [ ] No crashes on malformed input (empty message, non-text upload, oversized batch)

## Innovation & Technical Excellence — 25 marks
- [ ] Kreol dataset integrated and demonstrably working
- [ ] Structured signal breakdown visible in UI output (not a single score)
- [ ] Domain matching catching real lookalike examples in test payloads

## Impact & Problem Solving — 25 marks
- [ ] Vulnerable-user protection mode working
- [ ] Crowdsourced threat feed has seeded demo data
- [ ] Scalability story ready to state verbally (local inference cost/privacy argument)

## Presentation & Demonstration — 15 marks
- [ ] Presenter roles assigned per team member
- [ ] Demo script covering explanation of the local-LLM architecture choice
- [ ] Q&A prep for "why self-hosted instead of a hosted API"
