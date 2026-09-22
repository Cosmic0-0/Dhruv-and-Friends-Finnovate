/**
 * Typed client for the FraudLens backend (docs/API-CONTRACT.md).
 *
 * Every call resolves to an ApiResult; it never throws. Failures are
 * classified into distinct kinds so the UI can respond appropriately, and
 * every user-facing message is authored here. Raw server error text (which
 * can contain internal LLM/provider details) is logged to the console only,
 * never returned for display.
 */

import type {
  AnalyzeRequest,
  AnalyzeResponse,
  BatchScanRequest,
  BatchScanResponse,
  BatchScanResult,
  ReportRequest,
  ReportResponse,
  Signal,
  Verdict,
} from "./types";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");

export type ApiErrorKind =
  | "validation" // 400: request rejected by backend validation
  | "llm_unavailable" // 502 (or other 5xx): analysis service failed
  | "network" // backend unreachable / not running / CORS
  | "timeout" // no response within the timeout
  | "aborted" // cancelled by the caller (e.g. user navigated away)
  | "unexpected"; // 2xx body that doesn't match the contract, or an unknown status

export interface ApiError {
  kind: ApiErrorKind;
  /** Safe, friendly copy for display. */
  message: string;
  /** HTTP status when a response was received. */
  status?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface RequestOptions {
  /** Milliseconds before giving up. */
  timeoutMs?: number;
  /** Caller-controlled cancellation; reported as kind "aborted", not "timeout". */
  signal?: AbortSignal;
}

/** Local LLM inference can be slow on first token; batch runs messages sequentially server-side. */
const DEFAULT_TIMEOUTS = {
  analyze: 45_000,
  batch: 180_000,
  report: 15_000,
} as const;

const FRIENDLY = {
  validationGeneric: "Something about that input didn't look right. Please check it and try again.",
  messageEmpty: "Paste a message first, then tap analyse.",
  messageTooLong: "That message is too long. Please keep it under 5,000 characters.",
  batchEmpty: "Add at least one message to scan.",
  batchTooMany: "You can scan up to 50 messages at a time.",
  batchItemEmpty: "One of the messages is empty. Remove it or add some text.",
  batchItemTooLong: "One of the messages is over 5,000 characters. Please shorten it.",
  senderEmpty: "Enter the sender's number or name to report it.",
  llm: "Our analysis service is busy right now. Please try again in a moment.",
  network: "We can't reach FraudLens right now. Check your connection and try again.",
  timeout: "This is taking longer than usual. Please try again.",
  aborted: "Request cancelled.",
  unexpected: "Something went wrong on our side. Please try again.",
  batchItemFailed: "We couldn't analyse this message. Treat it with caution and verify through an official channel.",
} as const;

/**
 * Backend 400 bodies are developer-worded; map the known ones to friendly
 * copy. Unknown strings fall back to a generic message.
 */
const VALIDATION_MAP: Array<[RegExp, string]> = [
  [/^message is required/i, FRIENDLY.messageEmpty],
  [/^message exceeds maximum length/i, FRIENDLY.messageTooLong],
  [/^messages must be a non-empty array/i, FRIENDLY.batchEmpty],
  [/^messages exceeds maximum batch size/i, FRIENDLY.batchTooMany],
  [/^every message in the batch must be a non-empty string/i, FRIENDLY.batchItemEmpty],
  [/^every message must be 5000 characters or fewer/i, FRIENDLY.batchItemTooLong],
  [/^sender is required/i, FRIENDLY.senderEmpty],
];

function friendlyValidation(raw: string | undefined): string {
  if (raw) {
    for (const [pattern, copy] of VALIDATION_MAP) if (pattern.test(raw)) return copy;
  }
  return FRIENDLY.validationGeneric;
}

async function readErrorText(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    if (isObj(body) && isStr(body.error)) return body.error;
  } catch {
    /* non-JSON error body */
  }
  return undefined;
}

function fail(kind: ApiErrorKind, message: string, status?: number): { ok: false; error: ApiError } {
  return { ok: false, error: { kind, message, status } };
}

async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
  isValid: (data: unknown) => data is T,
  callerSignal?: AbortSignal,
): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }

  // Shared by both await points below: a rejection is a timeout, a caller
  // abort, or (only for the fetch itself) a network failure.
  const abortFailure = () => {
    if (timedOut) {
      console.warn(`[api] ${path} timed out after ${timeoutMs}ms`);
      return fail("timeout", FRIENDLY.timeout);
    }
    if (callerSignal?.aborted) return fail("aborted", FRIENDLY.aborted);
    return null;
  };

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = abortFailure();
      if (aborted) return aborted;
      console.error(`[api] ${path} network error (is the backend running at ${API_BASE_URL}?)`, err);
      return fail("network", FRIENDLY.network);
    }

    if (!res.ok) {
      const raw = await readErrorText(res);
      if (res.status === 400) {
        console.warn(`[api] ${path} 400:`, raw);
        return fail("validation", friendlyValidation(raw), 400);
      }
      if (res.status >= 500) {
        // 502 carries raw LLM/provider error text: log only, never display.
        console.error(`[api] ${path} ${res.status}:`, raw);
        return fail("llm_unavailable", FRIENDLY.llm, res.status);
      }
      console.error(`[api] ${path} unexpected status ${res.status}:`, raw);
      return fail("unexpected", FRIENDLY.unexpected, res.status);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (err) {
      const aborted = abortFailure();
      if (aborted) return aborted;
      console.error(`[api] ${path} returned a non-JSON body`, err);
      return fail("unexpected", FRIENDLY.unexpected, res.status);
    }
    if (!isValid(data)) {
      console.error(`[api] ${path} response did not match the contract`, data);
      return fail("unexpected", FRIENDLY.unexpected, res.status);
    }
    return { ok: true, data };
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

// ---- Runtime shape guards (keep the UI from rendering a malformed verdict) ----

const VERDICTS: readonly unknown[] = ["safe", "suspicious", "scam"] satisfies Verdict[];
const SEVERITIES: readonly unknown[] = ["low", "medium", "high"];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isSignal(v: unknown): v is Signal {
  return isObj(v) && isStr(v.type) && isStr(v.description) && SEVERITIES.includes(v.severity);
}

function isAnalyzeResponse(v: unknown): v is AnalyzeResponse {
  return (
    isObj(v) &&
    VERDICTS.includes(v.verdict) &&
    Array.isArray(v.signals) &&
    v.signals.every(isSignal) &&
    isStr(v.suggestedAction) &&
    isStr(v.explanation)
  );
}

function isBatchScanResult(v: unknown): v is BatchScanResult {
  return isAnalyzeResponse(v) && isStr((v as unknown as Record<string, unknown>).message);
}

function isBatchScanResponse(v: unknown): v is BatchScanResponse {
  return (
    isObj(v) &&
    Array.isArray(v.results) &&
    v.results.every(isBatchScanResult) &&
    isObj(v.summary) &&
    isNum(v.summary.total) &&
    isNum(v.summary.scamCount) &&
    isNum(v.summary.suspiciousCount) &&
    isNum(v.summary.safeCount)
  );
}

function isReportResponse(v: unknown): v is ReportResponse {
  return isObj(v) && isStr(v.sender) && isNum(v.reportCount) && typeof v.recorded === "boolean";
}

// ---- Batch failure normalisation ----

/**
 * The backend overloads verdict "suspicious" for a per-message analysis
 * failure and puts the raw error in `explanation` ("Analysis failed: ...").
 * We flag those results client-side and replace the raw text with safe copy,
 * so the UI can show "couldn't analyse" instead of a fake verdict.
 */
export interface ClientBatchResult extends BatchScanResult {
  /** Client-derived; not part of the API contract. */
  analysisFailed: boolean;
}

export interface ClientBatchScanResponse extends Omit<BatchScanResponse, "results"> {
  results: ClientBatchResult[];
  /** Results that were analysis failures. The backend counts these in summary.suspiciousCount. */
  failedCount: number;
}

const BATCH_FAILURE_PREFIX = "Analysis failed:";

function normaliseBatch(data: BatchScanResponse): ClientBatchScanResponse {
  let failedCount = 0;
  const results = data.results.map((r): ClientBatchResult => {
    const failed = r.explanation.startsWith(BATCH_FAILURE_PREFIX) && r.signals.length === 0;
    if (!failed) return { ...r, analysisFailed: false };
    failedCount++;
    console.error("[api] /api/batch-scan item failed:", r.explanation);
    return { ...r, explanation: FRIENDLY.batchItemFailed, analysisFailed: true };
  });
  return { ...data, results, failedCount };
}

// ---- Public API ----

export function analyzeMessage(req: AnalyzeRequest, opts: RequestOptions = {}): Promise<ApiResult<AnalyzeResponse>> {
  return postJson("/api/analyze", req, opts.timeoutMs ?? DEFAULT_TIMEOUTS.analyze, isAnalyzeResponse, opts.signal);
}

export async function batchScan(
  req: BatchScanRequest,
  opts: RequestOptions = {},
): Promise<ApiResult<ClientBatchScanResponse>> {
  const res = await postJson(
    "/api/batch-scan",
    req,
    opts.timeoutMs ?? DEFAULT_TIMEOUTS.batch,
    isBatchScanResponse,
    opts.signal,
  );
  return res.ok ? { ok: true, data: normaliseBatch(res.data) } : res;
}

export function reportSender(req: ReportRequest, opts: RequestOptions = {}): Promise<ApiResult<ReportResponse>> {
  return postJson("/api/report", req, opts.timeoutMs ?? DEFAULT_TIMEOUTS.report, isReportResponse, opts.signal);
}
