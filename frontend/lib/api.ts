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

/**
 * "Share anonymous scam samples" (Settings). Read inline rather than imported
 * from ./storage so this module keeps only type imports and stays runnable by
 * Node's test runner. Key and default must match lib/storage.ts.
 */
function loadShareSamples(): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem("fraudlens.shareSamples.v1") !== "false";
  } catch {
    return true;
  }
}
import type {
  AnalyzeDocumentRequest,
  AnalyzeDocumentResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeScreenshotRequest,
  AnalyzeScreenshotResponse,
  BatchScanRequest,
  BatchScanResponse,
  BatchScanResult,
  CheckPayeeRequest,
  CheckPayeeResponse,
  CheckSenderRequest,
  CheckSenderResponse,
  CheckUrlRequest,
  CheckUrlResponse,
  ConversationFlag,
  ConversationRequest,
  ConversationResponse,
  ConversationStageEvent,
  DocumentInfo,
  DocumentPreview,
  ReportRequest,
  ReportResponse,
  Signal,
  TextProfileRequest,
  TextProfileResponse,
  Verdict,
} from "./types";

/**
 * Requests go to same-origin `/api/*`; next.config.ts rewrites them to the
 * backend (BACKEND_URL). The browser never makes a cross-origin call, so the
 * backend needs no CORS and the app works from a phone on the LAN.
 *
 * Call sites already pass the full "/api/..." path, so no prefix is added
 * here — doing so previously produced "/api/api/..." and 404'd every call.
 * lib/api.test.ts pins the exact URLs so that can't come back.
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
  | "image_invalid" // not a PNG/JPEG/WEBP, or not decodable as base64
  | "image_too_large"
  | "image_unreadable" // couldn't be opened/decoded in the browser
  | "image_no_text"
  | "image_text_too_long" // OCR found more text than one check allows
  | "document_too_large" // over 10MB (checked in the browser and by the backend)
  | "document_unsupported" // not a PDF or Word file (by content, not by name)
  | "document_encrypted" // needs a password to open
  | "document_unreadable" // damaged, too complex to finish in time, or not decodable
  | "invalid";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface RequestOptions {
  /** Milliseconds before giving up. */
  timeoutMs?: number;
  /** Caller-controlled cancellation; reported as kind "aborted", not "timeout". */
  signal?: AbortSignal;
}

/**
 * Backend LLM_TIMEOUT_MS (currently 60s) applies PER PROVIDER ATTEMPT: in
 * "auto" mode a request can try Ollama, time out, then try the hosted
 * fallback - up to ~2x LLM_TIMEOUT_MS before the backend responds at all
 * (see backend/src/services/analysis/llmClient.js). These must stay
 * comfortably above that worst case, not just above one provider's budget,
 * or the client shows "timeout" while the backend is still legitimately
 * working. `screenshot` adds a little more for OCR itself.
 */
const DEFAULT_TIMEOUTS = {
  analyze: 130_000,
  // OCR, then a full LLM analysis server-side, before the extracted text comes back.
  screenshot: 135_000,
  batch: 180_000,
  // Same single-LLM-call cost class as /api/analyze; the transcript is
  // bigger but it's still one runPipeline() call server-side.
  conversation: 130_000,
  report: 15_000,
  // Single indexed SELECT, same cost class as report - no LLM/OCR involved.
  checkSender: 15_000,
  // Deterministic, one indexed SELECT (POST /api/check-payee).
  checkPayee: 15_000,
  // Deterministic (RDAP + a live TLS handshake + crt.sh), no LLM. POST /api/check-url.
  checkUrl: 20_000,
  // Pure in-memory, no LLM, no storage (POST /api/text-profile) - called on a debounce while typing.
  textProfile: 8_000,
  // Upload (up to ~13MB of base64), parsing in a worker (<=15s), OCR of up
  // to three scanned pages when there is no text layer, then the same LLM
  // analysis. Still below next.config.ts's 190s proxy timeout.
  document: 170_000,
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
  imageMissing: "Choose a screenshot to upload.",
  imageInvalid: "That file isn't a PNG, JPEG, or WEBP image.",
  imageTooLarge: "That image is too large. Please keep it under 5MB.",
  imageUnreadable: "That image couldn't be read. Try a different file.",
  imageNoText: "We couldn't find any readable text in that screenshot.",
  imageTextTooLong: "That screenshot has more text than we can check at once. Crop it to just the message.",
  ocrFailed: "We couldn't read that screenshot right now. Try again, or type the message instead.",
  documentTooLarge: "That file is too large. Please keep it under 10MB.",
  documentUnsupported: "That file isn't a PDF or Word (.docx) document.",
  documentEncrypted: "That document is password-protected. Open it, save a copy without a password, and try again.",
  documentUnreadable: "We couldn't read that document. It may be damaged or too complex. Try another copy of it.",
  rateLimited: "Lots of checks are running right now. Please try again in a moment.",
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
  [/^image is required/i, "image_missing", FRIENDLY.imageMissing],
  [/^image could not be decoded/i, "image_invalid", FRIENDLY.imageInvalid],
  [/^image exceeds maximum size/i, "image_too_large", FRIENDLY.imageTooLarge],
  [/^image must be a valid/i, "image_invalid", FRIENDLY.imageInvalid],
  [/^no readable text was found/i, "image_no_text", FRIENDLY.imageNoText],
  // Its own reason (not message_too_long): the user didn't type anything too long,
  // the screenshot held too much text, so the fix is different (crop it).
  [/^extracted text exceeds maximum length/i, "image_text_too_long", FRIENDLY.imageTextTooLong],
  [/^document exceeds maximum size/i, "document_too_large", FRIENDLY.documentTooLarge],
  [/^document must be a PDF or Word/i, "document_unsupported", FRIENDLY.documentUnsupported],
  [/^document is password-protected/i, "document_encrypted", FRIENDLY.documentEncrypted],
  [/^document (?:is required|could not be)/i, "document_unreadable", FRIENDLY.documentUnreadable],
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

/**
 * One classification for every non-2xx answer, shared by the fetch path
 * (postJson) and the upload path (analyzeDocument, XMLHttpRequest).
 * `raw` is the backend's `{ error }` text, or undefined when the body wasn't
 * backend JSON. `tooLarge` is the reason to report for a 413 (a body over the
 * backend's size limit); without one a 413 stays "unexpected".
 */
function classifyFailure(
  path: string,
  status: number,
  raw: string | undefined,
  tooLarge?: { reason: ValidationReason; message: string },
): { ok: false; error: ApiError } {
  if (status === 400) {
    console.warn(`[api] ${path} 400:`, raw);
    const { reason, message } = friendlyValidation(raw);
    return fail("validation", message, 400, reason);
  }
  if (status === 413 && tooLarge) {
    console.warn(`[api] ${path} 413:`, raw);
    return fail("validation", tooLarge.message, 413, tooLarge.reason);
  }
  if (status === 429) {
    // Per-IP rate limit (contract: 20 req / 15 min, shared by the analyze routes).
    console.warn(`[api] ${path} 429 rate limited:`, raw);
    return fail("llm_unavailable", FRIENDLY.rateLimited, 429);
  }
  if (status >= 500) {
    if (raw === undefined) {
      // No JSON `{ error }` body means the backend never answered: the
      // Next rewrite proxy couldn't reach it (backend down) or gave up.
      console.warn(`[api] ${path} ${status} from the proxy: backend unreachable (check BACKEND_URL)`);
      return status === 504 ? fail("timeout", FRIENDLY.timeout, 504) : fail("network", FRIENDLY.network, status);
    }
    // 502 carries raw LLM/provider error text: log only, never display.
    console.warn(`[api] ${path} ${status}:`, raw);
    if (/^OCR failed/i.test(raw)) return fail("ocr_failed", FRIENDLY.ocrFailed, status);
    return fail("llm_unavailable", FRIENDLY.llm, status);
  }
  console.warn(`[api] ${path} unexpected status ${status}:`, raw);
  return fail("unexpected", FRIENDLY.unexpected, status);
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

    if (!res.ok) return classifyFailure(path, res.status, await readErrorText(res));

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
// Batch results can also carry "unknown" for a per-message analysis
// failure - a value /api/analyze itself never returns (see
// BatchScanResult.verdict in ./types).
const BATCH_VERDICTS: readonly unknown[] = [...VERDICTS, "unknown"];
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

function hasAnalysisShape(v: Record<string, unknown>): boolean {
  return Array.isArray(v.signals) && v.signals.every(isSignal) && isStr(v.suggestedAction) && isStr(v.explanation);
}

function isAnalyzeResponse(v: unknown): v is AnalyzeResponse {
  return isObj(v) && VERDICTS.includes(v.verdict) && hasAnalysisShape(v);
}

function isConversationFlag(v: unknown): v is ConversationFlag {
  return isObj(v) && isNum(v.index) && isStr(v.code) && SEVERITIES.includes(v.severity) && isStr(v.label) && isStr(v.evidence);
}

function isConversationStageEvent(v: unknown): v is ConversationStageEvent {
  return isObj(v) && isStr(v.stage) && isNum(v.index);
}

function isConversationResponse(v: unknown): v is ConversationResponse {
  if (!isObj(v) || !VERDICTS.includes(v.verdict) || !hasAnalysisShape(v)) return false;
  const c = v.conversation;
  return (
    isObj(c) &&
    isNum(c.messageCount) &&
    isNum(c.theirMessageCount) &&
    isNum(c.analysedMessageCount) &&
    typeof c.truncated === "boolean" &&
    (c.firstAnalysedIndex === null || isNum(c.firstAnalysedIndex)) &&
    Array.isArray(c.flags) &&
    c.flags.every(isConversationFlag) &&
    Array.isArray(c.stages) &&
    c.stages.every(isConversationStageEvent)
  );
}

/**
 * Only `extractedText` is checked: it's the only field the UI uses. The
 * server's verdict in the same response is ignored by design (the user
 * reviews the text first; see AnalyzeScreenshotResponse), so a malformed
 * verdict part must not throw away a perfectly good extraction.
 */
function isAnalyzeScreenshotResponse(v: unknown): v is AnalyzeScreenshotResponse {
  return isObj(v) && isStr(v.extractedText);
}

const TEXT_SOURCES: readonly unknown[] = ["text_layer", "ocr", "none"];
/** Previews are rendered as <img src>, so only small PNG data URLs are ever kept. */
export const MAX_PREVIEW_DATA_URL = 200_000;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

function isNumOrNull(v: unknown): v is number | null {
  return v === null || isNum(v);
}
function isStrOrNull(v: unknown): v is string | null {
  return v === null || isStr(v);
}

function isDocumentInfo(v: unknown): v is DocumentInfo {
  if (!isObj(v) || !isObj(v.metadata) || !Array.isArray(v.previews)) return false;
  const m = v.metadata;
  return (
    (v.fileType === "pdf" || v.fileType === "docx") &&
    TEXT_SOURCES.includes(v.textSource) &&
    typeof v.textTruncated === "boolean" &&
    isNumOrNull(v.pageCount) &&
    isNumOrNull(v.pagesAnalyzed) &&
    isStrOrNull(m.producer) &&
    isStrOrNull(m.creator) &&
    isStrOrNull(m.created) &&
    isStrOrNull(m.modified) &&
    isNumOrNull(m.incrementalUpdates) &&
    typeof m.signed === "boolean"
  );
}

export function isSafePreview(v: unknown): v is DocumentPreview {
  return (
    isObj(v) &&
    isStr(v.dataUrl) &&
    v.dataUrl.length <= MAX_PREVIEW_DATA_URL &&
    PNG_DATA_URL.test(v.dataUrl) &&
    isStr(v.signalCode) &&
    isNumOrNull(v.page) &&
    isNum(v.widthPx) &&
    isNum(v.heightPx) &&
    isNumOrNull(v.effectiveDpi) &&
    isNumOrNull(v.backgroundDpi) &&
    typeof v.hasAlpha === "boolean" &&
    isNumOrNull(v.hardEdgeRatio)
  );
}

function isAnalyzeDocumentResponse(v: unknown): v is AnalyzeDocumentResponse {
  if (!isObj(v)) return false;
  const { extractedText, document } = v;
  return isAnalyzeResponse(v) && isStr(extractedText) && isDocumentInfo(document);
}

function isBatchScanResult(v: unknown): v is BatchScanResult {
  return isObj(v) && BATCH_VERDICTS.includes(v.verdict) && hasAnalysisShape(v) && isStr(v.message);
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

function isCheckSenderResponse(v: unknown): v is CheckSenderResponse {
  return isObj(v) && isStr(v.sender) && isNum(v.reportCount);
}

// ---- Batch failure normalisation ----

/**
 * A per-message analysis failure comes back with `analysisFailed: true` and
 * verdict "unknown" (older backends used "suspicious" plus an "Analysis
 * failed: ..." explanation). Either way we flag it and replace the
 * explanation with safe copy, so the UI shows "couldn't analyse" instead of
 * a verdict, and never shows raw error text.
 */
export interface ClientBatchResult extends BatchScanResult {
  /** Client-derived; not part of the API contract. */
  analysisFailed: boolean;
}

export interface ClientBatchScanResponse extends Omit<BatchScanResponse, "results"> {
  results: ClientBatchResult[];
  /** Results that were analysis failures (the backend also reports these as summary.unanalyzedCount). */
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

/**
 * Settings > "Share anonymous scam samples" off: tell the backend to store
 * nothing derived from this request (docs/API-CONTRACT.md "Sharing samples").
 * Omitted when on, so the default request is unchanged.
 */
function withSharing<T extends object>(req: T): T & { shareSamples?: false } {
  return typeof window !== "undefined" && !loadShareSamples() ? { ...req, shareSamples: false } : req;
}

export function analyzeMessage(req: AnalyzeRequest, opts: RequestOptions = {}): Promise<ApiResult<AnalyzeResponse>> {
  return postJson("/api/analyze", withSharing(req), opts.timeoutMs ?? DEFAULT_TIMEOUTS.analyze, isAnalyzeResponse, opts.signal);
}

export function analyzeScreenshot(
  req: AnalyzeScreenshotRequest,
  opts: RequestOptions = {},
): Promise<ApiResult<AnalyzeScreenshotResponse>> {
  return postJson(
    "/api/analyze/screenshot",
    withSharing(req),
    opts.timeoutMs ?? DEFAULT_TIMEOUTS.screenshot,
    isAnalyzeScreenshotResponse,
    opts.signal,
  );
}

export interface UploadOptions extends RequestOptions {
  /** 0..1 while the request body is being sent, when the browser can tell. */
  onUploadProgress?: (fraction: number) => void;
  /** The whole file has been sent; the server is analysing it now. */
  onUploaded?: () => void;
}

/**
 * POST /api/analyze/document. XMLHttpRequest rather than fetch because it
 * reports upload progress, so the UI can truthfully show "uploading" and then
 * "analysing" for a file of up to 10MB. Every failure goes through the same
 * classifyFailure() as the fetch-based calls, so the error kinds match.
 * Previews that aren't small PNG data URLs are dropped before anything
 * renders or stores them.
 */
export function analyzeDocument(
  req: AnalyzeDocumentRequest,
  opts: UploadOptions = {},
): Promise<ApiResult<AnalyzeDocumentResponse>> {
  const path = "/api/analyze/document";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUTS.document;
  return new Promise((resolve) => {
    if (opts.signal?.aborted) {
      resolve(fail("aborted", FRIENDLY.aborted));
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = (result: ApiResult<AnalyzeDocumentResponse>) => {
      opts.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    xhr.open("POST", path);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onUploadProgress?.(e.loaded / e.total);
    };
    xhr.upload.onload = () => opts.onUploaded?.();
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const raw = isObj(body) && isStr(body.error) ? body.error : undefined;
        done(classifyFailure(path, xhr.status, raw, { reason: "document_too_large", message: FRIENDLY.documentTooLarge }));
        return;
      }
      if (!isAnalyzeDocumentResponse(body)) {
        console.warn(`[api] ${path} response did not match the contract`, body);
        done(fail("unexpected", FRIENDLY.unexpected, xhr.status));
        return;
      }
      done({ ok: true, data: { ...body, document: { ...body.document, previews: body.document.previews.filter(isSafePreview) } } });
    };
    xhr.onerror = () => {
      console.warn(`[api] ${path} network error (is the frontend server reachable?)`);
      done(fail("network", FRIENDLY.network));
    };
    xhr.ontimeout = () => {
      console.warn(`[api] ${path} timed out after ${timeoutMs}ms`);
      done(fail("timeout", FRIENDLY.timeout));
    };
    xhr.onabort = () => done(fail("aborted", FRIENDLY.aborted));
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(JSON.stringify(withSharing(req)));
  });
}

export async function batchScan(
  req: BatchScanRequest,
  opts: RequestOptions = {},
): Promise<ApiResult<ClientBatchScanResponse>> {
  const res = await postJson(
    "/api/batch-scan",
    withSharing(req),
    opts.timeoutMs ?? DEFAULT_TIMEOUTS.batch,
    isBatchScanResponse,
    opts.signal,
  );
  return res.ok ? { ok: true, data: normaliseBatch(res.data) } : res;
}

export function reportSender(req: ReportRequest, opts: RequestOptions = {}): Promise<ApiResult<ReportResponse>> {
  return postJson("/api/report", req, opts.timeoutMs ?? DEFAULT_TIMEOUTS.report, isReportResponse, opts.signal);
}

/** Read-only: looks up a report count without incrementing it (unlike reportSender above). */
export function checkSender(
  req: CheckSenderRequest,
  opts: RequestOptions = {},
): Promise<ApiResult<CheckSenderResponse>> {
  return postJson(
    "/api/check-sender",
    req,
    opts.timeoutMs ?? DEFAULT_TIMEOUTS.checkSender,
    isCheckSenderResponse,
    opts.signal,
  );
}

function isCheckPayeeResponse(v: unknown): v is CheckPayeeResponse {
  return (
    isObj(v) &&
    (v.verdict === "stop" || v.verdict === "caution" || v.verdict === "clear") &&
    isNum(v.reportCount) &&
    Array.isArray(v.findings) &&
    v.findings.every((f) => isObj(f) && isStr(f.code) && (f.severity === "red" || f.severity === "amber" || f.severity === "ok"))
  );
}

/** "Before paying": deterministic, read-only payee check (reports, format, context). Never counts as a report. */
export function checkPayee(req: CheckPayeeRequest, opts: RequestOptions = {}): Promise<ApiResult<CheckPayeeResponse>> {
  return postJson("/api/check-payee", req, opts.timeoutMs ?? DEFAULT_TIMEOUTS.checkPayee, isCheckPayeeResponse, opts.signal);
}

function isCheckUrlResponse(v: unknown): v is CheckUrlResponse {
  return (
    isObj(v) &&
    isStr(v.url) &&
    isStrOrNull(v.host) &&
    typeof v.flagged === "boolean" &&
    Array.isArray(v.signals) &&
    v.signals.every(isSignal) &&
    isNum(v.reportCount) &&
    isStrOrNull(v.officialInstitution) &&
    typeof v.trusted === "boolean" &&
    isNumOrNull(v.domainAgeDays)
  );
}

/**
 * "Link" mode on the Check screen: a deterministic, non-LLM domain/reputation
 * check (POST /api/check-url) — the page itself is never opened. Same
 * checkUrls() function /api/analyze uses for its lookalike_url signals.
 */
export function checkUrl(req: CheckUrlRequest, opts: RequestOptions = {}): Promise<ApiResult<CheckUrlResponse>> {
  return postJson("/api/check-url", req, opts.timeoutMs ?? DEFAULT_TIMEOUTS.checkUrl, isCheckUrlResponse, opts.signal);
}

function isTextProfileResponse(v: unknown): v is TextProfileResponse {
  const LANGS: readonly unknown[] = ["en", "fr", "kreol", "mixed", null];
  return isObj(v) && LANGS.includes(v.language) && isNum(v.links) && Array.isArray(v.hosts) && v.hosts.every(isStr);
}

/**
 * The Check screen's live meta row while typing (language detected / link
 * count) — descriptive only, no signal, score or storage. Callers should
 * debounce; this has its own rate-limit bucket (POST /api/text-profile).
 */
export function textProfile(req: TextProfileRequest, opts: RequestOptions = {}): Promise<ApiResult<TextProfileResponse>> {
  return postJson("/api/text-profile", req, opts.timeoutMs ?? DEFAULT_TIMEOUTS.textProfile, isTextProfileResponse, opts.signal);
}

/**
 * Whole-conversation analysis (POST /api/analyze/conversation, backend/src/services/conversation):
 * the other party's messages are joined into one transcript and run through
 * the same deterministic pipeline as /api/analyze, once. `conversation.flags`
 * attaches each grounded signal back to the message it came from;
 * `conversation.stages` is the first message each playbook stage appeared at.
 */
export function analyzeConversation(
  req: ConversationRequest,
  opts: RequestOptions = {},
): Promise<ApiResult<ConversationResponse>> {
  return postJson(
    "/api/analyze/conversation",
    withSharing(req),
    opts.timeoutMs ?? DEFAULT_TIMEOUTS.conversation,
    isConversationResponse,
    opts.signal,
  );
}
