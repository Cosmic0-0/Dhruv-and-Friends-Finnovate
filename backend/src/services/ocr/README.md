# OCR ingestion

Owner: **Dhruv**. See `CLAUDE.md` → Role gating.

Screenshot upload handling + OCR extraction pipeline. Should expose a plain
function (e.g. `extractTextFromImage(buffer) -> string`) that `routes/` calls
into — keep it independent of Express so it can be unit tested directly.
