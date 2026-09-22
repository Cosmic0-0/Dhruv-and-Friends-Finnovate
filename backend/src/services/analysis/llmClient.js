// Transport + failover for LLM calls. Callers get back { text, provider } and
// never need to know whether Ollama or a hosted fallback served the request.

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";
const FALLBACK_PROVIDER = process.env.FALLBACK_PROVIDER || "anthropic";
const FALLBACK_API_KEY = process.env.FALLBACK_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "liquid/lfm-2.5-2.6b:free";
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 15000;
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
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, format: "json", think: true }),
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
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
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
      model: "gpt-4o-mini",
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

export async function callLLM(prompt) {
  if (LLM_MODE !== "fallback") {
    try {
      const text = await withTimeout((signal) => callOllama(prompt, signal), LLM_TIMEOUT_MS);
      console.log("[llm] served by ollama");
      return { text, provider: "ollama" };
    } catch (err) {
      console.log(`[llm] ollama unavailable (${err.message})`);
      if (LLM_MODE !== "auto") throw err;
    }
  }

  if (!FALLBACK_CONFIGURED) throw new Error("LLM unreachable and no fallback provider configured");
  const caller = FALLBACK_CALLERS[FALLBACK_PROVIDER];
  if (!caller) throw new Error(`Unknown fallback provider: ${FALLBACK_PROVIDER}`);
  const text = await withTimeout((signal) => caller(prompt, signal), LLM_TIMEOUT_MS);
  console.log(`[llm] served by fallback:${FALLBACK_PROVIDER}`);
  return { text, provider: FALLBACK_PROVIDER };
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
