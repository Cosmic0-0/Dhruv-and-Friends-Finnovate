# Batch scan

Owner: **Dhruv**. See `CLAUDE.md` → Role gating.

Multi-message upload + summary view logic for `POST /api/batch-scan`. Calls
into `../analysis` for per-message verdicts (owned by the backend owner) — don't
reimplement analysis logic here, only aggregation/summary.
