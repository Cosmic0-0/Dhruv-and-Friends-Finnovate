/**
 * Typed client for the FraudLens backend (docs/API-CONTRACT.md).
 *
 * Every call resolves to an ApiResult; it never throws. Failures are
 * classified into distinct kinds so the UI can respond appropriately, and
 * every user-facing message is authored here. Raw server error text (which
 * can contain internal LLM/provider details) is logged to the console only,
 * never returned for display.
 *
 * Failures are logged with console.warn, not console.error: they're handled
 * and shown to the user, and Next's dev overlay flags every console.error as
 * an "Issue" badge, which would appear mid-demo.
 */

import type {
  AnalyzeRequest,
  AnalyzeResponse,
  BatchScanRequest,
  BatchScanResponse,
  BatchScanResult,
  ReportRequest,
  ReportResponse,
  ScreenshotRequest,
  ScreenshotResponse,
  Signal,
  Verdict,
} from "./types";

/*
 * Requests go to same-origin `/api/*` paths exactly as written below;
 * next.config.ts rewrites them to the backend (BACKEND_URL). The browser
 * never makes a cross-origin call, so the backend needs no CORS and the app
 * works from a phone on the LAN. lib/api.test.ts pins the exact URLs.
 */

export type ApiErrorKind =
  | "validation" // 400: request rejected by backend validation
  | "llm_unavailable" // 502 (or other 5xx): analysis service failed
  | "network" // frontend server unreachable, or the /api proxy can't reach the backend
  | "timeout" // no response within the timeout
  | "aborted" // cancelled by the caller (e.g. user navigated away)
  | "ocr_failed" // /api/analyze/screenshot: the OCR worker itself failed (502 "OCR failed: …")
  | "unexpected"; // 2xx body that doesn't match the contract, or an unknown status

export interface ApiError {
  kind: ApiErrorKind;
  /** Safe, friendly copy for display. */
  message: string;
  /** HTTP status when a response was received. */
  status?: number;
  /** For kind "validation": which rule was broken, so the UI can show localized copy. */
  reason?: ValidationReason;
}

export type ValidationReason =
  | "message_empty"
  | "message_too_long"
  | "batch_empty"
  | "batch_too_many"
  | "batch_item_empty"
  | "batch_item_too_long"
  | "sender_empty"
  | "image_missing"
  | "image_unreadable"
  | "image_too_large"
  | "image_not_supported"
  | "image_no_text"
  | "image_text_too_long"
  | "invalid";

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
  // OCR, then a full LLM analysis server-side, before the text comes back.
  screenshot: 150_000,
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
  imageGeneric: "We couldn't read that screenshot. Try another image, or type the message instead.",
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
const VALIDATION_MAP: Array<[RegExp, ValidationReason, string]> = [
  [/^message is required/i, "message_empty", FRIENDLY.messageEmpty],
  [/^message exceeds maximum length/i, "message_too_long", FRIENDLY.messageTooLong],
  [/^messages must be a non-empty array/i, "batch_empty", FRIENDLY.batchEmpty],
  [/^messages exceeds maximum batch size/i, "batch_too_many", FRIENDLY.batchTooMany],
  [/^every message in the batch must be a non-empty string/i, "batch_item_empty", FRIENDLY.batchItemEmpty],
  [/^every message must be 5000 characters or fewer/i, "batch_item_too_long", FRIENDLY.batchItemTooLong],
  [/^sender is required/i, "sender_empty", FRIENDLY.senderEmpty],
  [/^image is required/i, "image_missing", FRIENDLY.imageGeneric],
  [/^image could not be decoded/i, "image_unreadable", FRIENDLY.imageGeneric],
  [/^image exceeds maximum size/i, "image_too_large", FRIENDLY.imageGeneric],
  [/^image must be a valid/i, "image_not_supported", FRIENDLY.imageGeneric],
  [/^no readable text was found/i, "image_no_text", FRIENDLY.imageGeneric],
  [/^extracted text exceeds maximum length/i, "image_text_too_long", FRIENDLY.imageGeneric],
];

function friendlyValidation(raw: string | undefined): { reason: ValidationReason; message: string } {
  if (raw) {
    for (const [pattern, reason, message] of VALIDATION_MAP) if (pattern.test(raw)) return { reason, message };
  }
  return { reason: "invalid", message: FRIENDLY.validationGeneric };
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

function fail(
  kind: ApiErrorKind,
  message: string,
  status?: number,
  reason?: ValidationReason,
): { ok: false; error: ApiError } {
  return { ok: false, error: { kind, message, status, ...(reason ? { reason } : {}) } };
}

async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
  isValid: (data: unknown) => data is T,
  callerSignal?: AbortSignal,
): Promise<ApiResult<T>> {
  const url = path; // already the full same-origin path, e.g. "/api/analyze"
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
      console.warn(`[api] ${path} network error (is the frontend server reachable?)`, err);
      return fail("network", FRIENDLY.network);
    }

    if (!res.ok) {
      const raw = await readErrorText(res);
      if (res.status === 400) {
        console.warn(`[api] ${path} 400:`, raw);
        const { reason, message } = friendlyValidation(raw);
        return fail("validation", message, 400, reason);
      }
      if (res.status >= 500) {
        if (raw === undefined) {
          // No JSON `{ error }` body means the backend never answered: the
          // Next rewrite proxy couldn't reach it (backend down) or gave up.
          console.warn(`[api] ${path} ${res.status} from the proxy: backend unreachable (check BACKEND_URL)`);
          return res.status === 504
            ? fail("timeout", FRIENDLY.timeout, 504)
            : fail("network", FRIENDLY.network, res.status);
        }
        // 502 carries raw LLM/provider error text: log only, never display.
        console.warn(`[api] ${path} ${res.status}:`, raw);
        if (/^OCR failed/i.test(raw)) return fail("ocr_failed", FRIENDLY.imageGeneric, res.status);
        return fail("llm_unavailable", FRIENDLY.llm, res.status);
      }
      console.warn(`[api] ${path} unexpected status ${res.status}:`, raw);
      return fail("unexpected", FRIENDLY.unexpected, res.status);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (err) {
      const aborted = abortFailure();
      if (aborted) return aborted;
      console.warn(`[api] ${path} returned a non-JSON body`, err);
      return fail("unexpected", FRIENDLY.unexpected, res.status);
    }
    if (!isValid(data)) {
      console.warn(`[api] ${path} response did not match the contract`, data);
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
    // Prefer the backend's explicit flag (newer contract). Older backends only
    // signal failure through the explanation prefix with no signals.
    const failed =
      typeof r.analysisFailed === "boolean"
        ? r.analysisFailed
        : r.explanation.startsWith(BATCH_FAILURE_PREFIX) && r.signals.length === 0;
    if (!failed) return { ...r, analysisFailed: false };
    failedCount++;
    console.warn("[api] /api/batch-scan item failed:", r.explanation);
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

/**
 * Only `extractedText` is checked and used; the server's verdict in the
 * same response is ignored by design (see ScreenshotResponse).
 */
function isScreenshotResponse(v: unknown): v is ScreenshotResponse {
  return isObj(v) && isStr(v.extractedText);
}

export function analyzeScreenshot(
  req: ScreenshotRequest,
  opts: RequestOptions = {},
): Promise<ApiResult<ScreenshotResponse>> {
  return postJson(
    "/api/analyze/screenshot",
    req,
    opts.timeoutMs ?? DEFAULT_TIMEOUTS.screenshot,
    isScreenshotResponse,
    opts.signal,
  );
}

export function reportSender(req: ReportRequest, opts: RequestOptions = {}): Promise<ApiResult<ReportResponse>> {
  return postJson("/api/report", req, opts.timeoutMs ?? DEFAULT_TIMEOUTS.report, isReportResponse, opts.signal);
}
