"""Local-only FastAPI service. Called by the Node backend
(backend/src/services/document-forensics-client/) over localhost HTTP -
never exposed publicly, never called from a browser. Mirrors how the Node
backend already talks to a local Ollama instance: another local process
over HTTP, not a third-party API.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, File, HTTPException, UploadFile, Form
from fastapi.responses import JSONResponse

from app.models import ForensicsReport
from app.orchestrator import analyze

app = FastAPI(title="FraudLens document forensics", version="0.1.0")

MAX_BYTES = 15 * 1024 * 1024  # matches backend's MAX_DOCUMENT_BYTES (routes/index.js)
SUPPORTED_MIME_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/webp"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=ForensicsReport)
async def analyze_document(
    file: UploadFile = File(...),
    mime_type: str = Form(...),
    document_id: str | None = Form(None),
):
    if mime_type not in SUPPORTED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"unsupported mime_type: {mime_type}")

    body = await file.read()
    if not body:
        raise HTTPException(status_code=400, detail="uploaded file is empty")
    if len(body) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"document exceeds maximum size of {MAX_BYTES // (1024 * 1024)}MB")

    report = analyze(body, mime_type, document_id=document_id)
    return JSONResponse(content=report.model_dump(mode="json"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ.get("PORT", "8081")), reload=False)
