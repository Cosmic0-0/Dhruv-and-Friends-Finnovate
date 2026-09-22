# Backend

See `../CLAUDE.md` → Role gating for ownership.

Node.js REST API: routes, LLM analysis (local Ollama + hosted fallback),
domain matching, and the reports/batch-history DB.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev   # http://localhost:4000/health
```

## Local LLM Setup

The backend never runs the LLM itself — it calls Ollama over HTTP. In
production the backend runs on a CPU-only VPS and reaches Ollama on a
teammate's GPU machine over Tailscale; locally, everyone just runs Ollama on
their own machine and leaves `OLLAMA_URL` at its default.

1. **Install and run Ollama on the machine serving the model** (the GPU
   machine in production, or your own machine locally):
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ollama pull qwen3:8b
   ollama serve   # often already running as a systemd/background service
   ```

2. **Install Tailscale** on both the backend/VPS machine and the model-serving
   machine, and join the same tailnet (manual device auth, done outside this
   repo). Then find the model machine's Tailscale IP:
   ```bash
   tailscale ip -4
   ```

3. **Set `OLLAMA_URL` in `.env`** on the backend/VPS to that IP:
   ```bash
   OLLAMA_URL=http://100.x.x.x:11434
   ```
   Locally, leave it as `http://localhost:11434`.

4. **Test connectivity manually** from the backend machine before wiring
   anything else up:
   ```bash
   curl http://<tailscale-ip>:11434/api/tags
   ```

5. **Fallback (optional):** set `FALLBACK_PROVIDER` (`anthropic` or `openai`)
   and `FALLBACK_API_KEY` in `.env`, with `LLM_MODE=auto`, so the backend
   fails over to a hosted API if Ollama is unreachable or times out
   (`LLM_TIMEOUT_MS`, default 15s). Fallback stays inactive until a key is
   set — never commit a real key, `.env` is gitignored.

6. **Sanity-check before a demo:** `GET /health/llm` reports whether Ollama
   is reachable, the current `LLM_MODE`, and which provider would actually
   serve a request right now. Use it pre-demo only, not during the live demo
   flow.

**The model-serving machine must stay powered on, unlocked, and connected to
Tailscale** for local inference to work — there's no automatic wake-up.
