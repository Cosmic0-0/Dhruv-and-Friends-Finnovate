# OCR ingestion

Screenshot upload handling and OCR extraction pipeline. It exposes a plain
`extractTextFromImage(buffer)` function used by `routes/` and stays independent
of Express so preprocessing and extraction can be tested directly.
