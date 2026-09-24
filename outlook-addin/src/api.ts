import { validResponse, validScreenshotResponse } from "./response";
import type { AnalyzePayload, AnalyzeResponse, AnalyzeScreenshotPayload, AnalyzeScreenshotResponse } from "./types";

const DEFAULT_TIMEOUT_MS = 70_000;
// OCR plus document forensics run server-side before the shared pipeline, so a
// screenshot can take noticeably longer than a plain-text email analysis.
const DEFAULT_SCREENSHOT_TIMEOUT_MS = 90_000;

function apiBase(): string {
  const configured = String(import.meta.env.VITE_FRAUDLENS_API_URL || "/fraudlens-api").trim();
  return configured.replace(/\/$/, "");
}

async function postJson<T>(
  path: string,
  payload: unknown,
  isValid: (value: unknown) => value is T,
  errorPrefix: string,
  { fetchImpl = fetch, timeoutMs }: { fetchImpl?: typeof fetch; timeoutMs: number }
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data && typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
      throw new Error(`${errorPrefix}: ${detail}`);
    }
    if (!isValid(data)) throw new Error("FraudLens returned an invalid response.");
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("FraudLens took too long to respond. Try again.");
    // fetch rejects with a bare TypeError ("Failed to fetch") when offline,
    // blocked by CORS or the host is unreachable; never show that raw text.
    if (error instanceof TypeError) throw new Error("Could not reach FraudLens. Check your connection and the backend address, then try again.");
    if (error instanceof Error) throw error;
    throw new Error("FraudLens is unavailable. Check the backend connection and try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function analyzeCurrentEmail(
  payload: AnalyzePayload,
  { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<AnalyzeResponse> {
  if (!payload.message.trim() || !payload.emailContext) throw new Error("The Outlook request must include both message text and email metadata.");
  return postJson(`/analyze`, payload, validResponse, "FraudLens could not analyse this email", { fetchImpl, timeoutMs });
}

export async function analyzeScreenshot(
  payload: AnalyzeScreenshotPayload,
  { fetchImpl, timeoutMs = DEFAULT_SCREENSHOT_TIMEOUT_MS }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<AnalyzeScreenshotResponse> {
  if (!payload.image.trim()) throw new Error("Choose a screenshot image before checking it.");
  return postJson(`/analyze/screenshot`, payload, validScreenshotResponse, "FraudLens could not analyse this screenshot", { fetchImpl, timeoutMs });
}

export { validResponse, validScreenshotResponse };
