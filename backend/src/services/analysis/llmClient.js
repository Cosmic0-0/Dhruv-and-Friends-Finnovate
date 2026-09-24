// Transport + failover for LLM calls. Callers get back { text, provider } and
// never need to know whether Ollama or a hosted fallback served the request.

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";
const FALLBACK_PROVIDER = process.env.FALLBACK_PROVIDER || "anthropic";
const FALLBACK_API_KEY = process.env.FALLBACK_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "liquid/lfm-2.5-2.6b:free";
const FALLBACK_MODELS = { anthropic: "claude-haiku-4-5-20251001", openai: "gpt-4o-mini", openrouter: OPENROUTER_MODEL };
// 15s was measured to be unsafe, and this is NOT a one-off: liquid/lfm-2.5-
// 2.6b:free has MANDATORY reasoning (OpenRouter rejects
// `reasoning: {enabled: false}` for it with "Reasoning is mandatory for this
// endpoint") and burns a highly variable number of hidden reasoning tokens
// before the actual JSON answer. Five live runs against the real analyze
// prompt on 2026-09-22 (Ollama down, this exact fallback path) took 19.5s,
// 27.4s, 38.8s, 43.8s, and one that didn't finish inside 35s - reasoning
// token counts of 323-1811 on the SAME prompt shape. This is not solvable by
// picking a bigger number: it's an open reliability risk in the free-tier
// fallback choice, not just a timeout tuning problem - see
// backend/.env.example's FALLBACK_PROVIDER comment and
// npm run test:fallback before assuming this is fixed. The default is 20s:
// Ollama with thinking off answers in ~12s, and a dead tailnet should cost
// 20s per provider, not 60s, before the deterministic verdict appears. At
// this budget the slow fallback usually times out, which is acceptable
// because the rules engine owns the verdict either way.
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 20000;
const LLM_MODE = process.env.LLM_MODE || "auto"; // local | fallback | auto

const FALLBACK_CONFIGURED = Boolean(FALLBACK_API_KEY);

async function withTimeout(fn, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function callOllama(prompt, signal) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // think:false measured ~5x faster (10s vs 48.6s, same GPU/prompt) with
    // no quality difference observed on a same-prompt A/B (both think modes
    // gave the identical wrong verdict on a legitimate-but-alarming OTP
    // message - the miss is a prompt-tuning gap, not something thinking
    // mode fixes). qwen3 supports toggling this (unlike the OpenRouter
    // fallback model, which has thinking mode mandatory) - see
    // backend/src/services/analysis/llmClient.js's LLM_TIMEOUT_MS comment
    // for the fallback-side version of this same reasoning-latency problem.
    // temperature: 0 + a fixed seed - this is a structured-extraction task
    // (fixed codes, evidence must quote the message verbatim), not creative
    // writing, so we want the same read every time, not a sample from the
    // distribution. Ollama's default temperature (~0.8) is exactly why the
    // same Kreol message could get different signals on different runs -
    // Kreol has the least training data of the three languages, so the
    // model's distribution over "what code applies here" is flattest there,
    // and default sampling made that flatness visible as flip-flopping.
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, format: "json", think: false, options: { temperature: 0, seed: 0 } }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama request failed: ${res.status}`);
  const { response } = await res.json();
  return response;
}

async function callAnthropic(prompt, signal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": FALLBACK_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: FALLBACK_MODELS.anthropic,
      max_tokens: 1024,
      temperature: 0, // deterministic signal extraction, see callOllama's comment
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Anthropic request failed: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

async function callOpenAI(prompt, signal) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FALLBACK_API_KEY}` },
    body: JSON.stringify({
      model: FALLBACK_MODELS.openai,
      temperature: 0, // deterministic signal extraction, see callOllama's comment
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callOpenRouter(prompt, signal) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FALLBACK_API_KEY}` },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0, // deterministic signal extraction, see callOllama's comment
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`OpenRouter request failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

const FALLBACK_CALLERS = { anthropic: callAnthropic, openai: callOpenAI, openrouter: callOpenRouter };

/**
 * @param {string} prompt
 * @param {{ timeoutMs?: number }} [opts] per-call timeout (defaults to LLM_TIMEOUT_MS)
 * @returns {Promise<{ text: string, provider: string, model: string }>}
 */
export async function callLLM(prompt, { timeoutMs = LLM_TIMEOUT_MS } = {}) {
  if (LLM_MODE !== "fallback") {
    try {
      const text = await withTimeout((signal) => callOllama(prompt, signal), timeoutMs);
      console.log("[llm] served by ollama");
      return { text, provider: "ollama", model: OLLAMA_MODEL };
    } catch (err) {
      console.log(`[llm] ollama unavailable (${err.message})`);
      if (LLM_MODE !== "auto") throw err;
    }
  }

  if (!FALLBACK_CONFIGURED) throw new Error("LLM unreachable and no fallback provider configured");
  const caller = FALLBACK_CALLERS[FALLBACK_PROVIDER];
  if (!caller) throw new Error(`Unknown fallback provider: ${FALLBACK_PROVIDER}`);
  const text = await withTimeout((signal) => caller(prompt, signal), timeoutMs);
  console.log(`[llm] served by fallback:${FALLBACK_PROVIDER}`);
  return { text, provider: FALLBACK_PROVIDER, model: FALLBACK_MODELS[FALLBACK_PROVIDER] ?? FALLBACK_PROVIDER };
}

export async function checkOllamaHealth() {
  try {
    const res = await withTimeout((signal) => fetch(`${OLLAMA_URL}/api/tags`, { signal }), 3000);
    return res.ok;
  } catch {
    return false;
  }
}

export function llmStatus() {
  return { mode: LLM_MODE, fallbackConfigured: FALLBACK_CONFIGURED, fallbackProvider: FALLBACK_PROVIDER };
}
