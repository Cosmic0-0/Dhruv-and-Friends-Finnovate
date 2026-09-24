# Backend

Node.js REST API for the deterministic analysis pipeline, bounded semantic
analysis (local Ollama plus hosted fallback), OCR, campaign intelligence,
passive site-security checks, and SQLite persistence.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev   # http://localhost:4000/health
```

## Local LLM Setup

The backend never runs the LLM itself — it calls Ollama over HTTP. In
production the backend runs on a CPU-only VPS and reaches Ollama on a
teammate's GPU laptop over Tailscale. This is a two-machine setup: follow
**Part A** on whichever laptop will actually serve the model, and **Part B**
wherever the backend runs (the VPS, or your own machine for local dev).

### Part A — on the model-serving laptop

1. **Install Ollama and pull the model:**
   - Linux: `curl -fsSL https://ollama.com/install.sh | sh`
   - macOS: `brew install ollama` (or download from https://ollama.com/download)
   - Windows: download the installer from https://ollama.com/download

   Then:
   ```bash
   ollama pull qwen3:8b
   ollama serve   # macOS/Windows: the Ollama app runs this for you
   ```

2. **Install Tailscale and join the tailnet** (manual device auth in the
   browser, done outside this repo):
   - Linux (Fedora/RHEL example, see https://tailscale.com/download for others):
     ```bash
     sudo dnf config-manager addrepo --from-repofile=https://pkgs.tailscale.com/stable/fedora/tailscale.repo
     sudo dnf install tailscale
     sudo systemctl enable --now tailscaled
     sudo tailscale up
     ```
   - macOS: `brew install tailscale` then open the Tailscale app and sign in,
     or `brew install --cask tailscale`.
   - Windows: install from https://tailscale.com/download/windows, sign in
     via the tray app.

   Then get this machine's tailnet IP:
   ```bash
   tailscale ip -4
   ```

3. **Bind Ollama to the Tailscale interface** — by default Ollama only
   listens on `127.0.0.1`, so it's unreachable from the VPS even once both
   machines are on the tailnet. Bind it to the Tailscale IP specifically
   (not `0.0.0.0`, to avoid exposing it on whatever other network the laptop
   is on, e.g. venue/hotel wifi):
   - Linux (systemd service):
     ```bash
     sudo tee -a /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<'EOF'
     Environment="OLLAMA_HOST=<tailscale-ip>:11434"
     EOF
     sudo systemctl daemon-reload
     sudo systemctl restart ollama
     ```
   - macOS/Windows: set the `OLLAMA_HOST` environment variable to
     `<tailscale-ip>:11434` (Ollama app → Settings on macOS, System
     Environment Variables on Windows) and restart the Ollama app.

4. **Verify locally** that it's listening on the tailnet IP, not just
   localhost:
   ```bash
   curl http://<tailscale-ip>:11434/api/tags
   ```

### Part B — on the backend machine (VPS or your own dev machine)

5. **Install Tailscale** the same way as step 2 above, join the *same*
   tailnet, and confirm you can reach the model laptop:
   ```bash
   curl http://<model-laptop-tailscale-ip>:11434/api/tags
   ```

6. **Set `OLLAMA_URL` in `.env`** to that IP:
   ```bash
   OLLAMA_URL=http://100.x.x.x:11434
   ```
   For local dev where Ollama runs on the same machine as the backend, leave
   it as `http://localhost:11434` instead — no Tailscale needed in that case.

7. **Fallback (required before the demo, not optional polish):** set
   `FALLBACK_PROVIDER` (`anthropic`, `openai`, or `openrouter`) and
   `FALLBACK_API_KEY` in `.env`, with `LLM_MODE=auto`, so the backend fails
   over to a hosted API if Ollama is unreachable or times out
   (`LLM_TIMEOUT_MS`, currently 60s in `.env.example`). `openrouter` is a
   single key that can route to different models (set `OPENROUTER_MODEL`;
   see `.env.example` for the current tested default and its latency warning).
   Fallback stays inactive until a key is set — never
   commit a real key, `.env` is gitignored. After setting it, run
   `npm run test:fallback` (see below) to confirm it actually works, on
   whichever machine will run the backend during the demo.

8. **Sanity-check before a demo:** `GET /health/llm` reports whether Ollama
   is reachable, the current `LLM_MODE`, and which provider would actually
   serve a request right now. Use it pre-demo only, not during the live demo
   flow.

9. **Confirm the fallback actually fires:** `npm run test:fallback` forces
   Ollama unreachable in-process (without touching `.env`) and fires a real
   request through the fallback provider, printing PASS/FAIL and exit code
   0/1. Run this on whichever machine is actually running the backend
   during the demo — a passing run on a laptop doesn't confirm the VPS has
   a working key.

**The model-serving laptop must stay powered on, unlocked, and connected to
Tailscale** for local inference to work — there's no automatic wake-up.

## Document forensics service (optional)

Three routes look for signs of editing. Two of them use a separate Python
service:

- `POST /api/analyze/document` (PDF/DOCX) runs entirely inside this backend
  (`src/services/document-forensics/`) and returns a normal verdict.
- `POST /api/analyze/screenshot` sends the image to the Python service while
  it runs OCR; the service's findings become DOC-09..13 signals in the normal
  verdict (`src/services/document-forensics-client/toSignals.js`).
- `POST /api/documents` (PDF, PNG, JPEG, WEBP) stores the upload
  (`src/services/document-store/`), OCRs images, and asks the Python service
  in `document-forensics/` for forgery indicators
  (`src/services/document-forensics-client/`). It never returns a verdict.

The backend reaches the Python service over HTTP, the same way it reaches
Ollama:

| Variable | Default | Purpose |
|---|---|---|
| `DOCUMENT_FORENSICS_URL` | `http://127.0.0.1:8081` | Base URL of the Python service |
| `DOCUMENT_FORENSICS_TIMEOUT_MS` | `90000` | Per-request timeout. The first call after the service starts can be slow while models load. |

`GET /health/document-forensics` returns `{ "reachable": true }` or
`{ "reachable": false }` from a call to the service's own `/health` with a
3-second timeout.

The service is optional. When it is not running, is unreachable, times out
or returns an error, `POST /api/documents` still returns `201` with the
stored document's id and any OCR text, and its `forensics` field is
`{ "status": "unavailable", "reason": "..." }`. A screenshot check still
returns a verdict from the OCR text alone, with `imageForensics.status:
"unavailable"`. Nothing else in the backend depends on it.

Setup and tests: [`document-forensics/README.md`](../document-forensics/README.md).
What each path claims and stores: [`docs/DOCUMENT-FORENSICS.md`](../docs/DOCUMENT-FORENSICS.md).
