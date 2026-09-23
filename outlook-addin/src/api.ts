import type { AnalyzePayload, AnalyzeResponse } from "./types";

const DEFAULT_TIMEOUT_MS = 70_000;

function apiBase(): string {
  const configured = String(import.meta.env.VITE_FRAUDLENS_API_URL || "/fraudlens-api").trim();
  return configured.replace(/\/$/, "");
}

function validResponse(value: unknown): value is AnalyzeResponse {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<AnalyzeResponse>;
  return Boolean(
    result.risk && typeof result.risk.score === "number" && typeof result.risk.level === "string" &&
    Array.isArray(result.signals) && Array.isArray(result.trace) && Array.isArray(result.actions) &&
    result.analysis && typeof result.analysis.rulesetVersion === "string"
  );
}

export async function analyzeCurrentEmail(
  payload: AnalyzePayload,
  { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<AnalyzeResponse> {
  if (!payload.message.trim() || !payload.emailContext) throw new Error("The Outlook request must include both message text and email metadata.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${apiBase()}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data && typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
      throw new Error(`FraudLens could not analyse this email: ${detail}`);
    }
    if (!validResponse(data)) throw new Error("FraudLens returned an invalid response.");
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("FraudLens took too long to respond. Try again.");
    if (error instanceof Error) throw error;
    throw new Error("FraudLens is unavailable. Check the backend connection and try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export { validResponse };
