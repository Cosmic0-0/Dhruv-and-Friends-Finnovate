# Analysis service

Owner: **the backend owner**. See `CLAUDE.md` → Role gating.

Prompt design + structured output schema for `POST /api/analyze`. Calls a
**local** LLM inference endpoint (`LLM_BASE_URL` / `LLM_MODEL` in `.env` —
model choice TBD, decide later). Always parse/validate the model's output
against the schema in `CLAUDE.md` → API Contract before returning it —
never pass raw model text straight through.
