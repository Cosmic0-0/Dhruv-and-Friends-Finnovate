/**
 * Types mirroring docs/API-CONTRACT.md ("as implemented").
 *
 * Fields marked OPTIONAL-FUTURE are not in the contract yet; the backend may
 * add them later. The UI must render correctly whether they are present or
 * not — never assume them, never synthesise them client-side.
 */

export type Verdict = "safe" | "suspicious" | "scam";

export type Severity = "low" | "medium" | "high";

/** Free-form hint passed straight into the LLM prompt; not validated server-side. */
export type LanguageHint = "en" | "fr" | "kreol" | "mixed";

export interface Signal {
  /** e.g. "sender_mismatch" | "urgency_language" | "lookalike_url" | "spoofed_identity" — free-form string */
  type: string;
  description: string;
  severity: Severity;
  /** OPTIONAL-FUTURE: the exact text/URL in the message that triggered this signal. */
  evidence?: string;
  /** OPTIONAL-FUTURE: age of a linked domain in days (lookalike_url signals). */
  domainAgeDays?: number;
}

// ---- POST /api/analyze ----

export interface AnalyzeRequest {
  /** 1–5000 characters. */
  message: string;
  language?: LanguageHint | string;
}

export interface AnalyzeResponse {
  verdict: Verdict;
  signals: Signal[];
  /** Free-form, NOT an enforced enum (e.g. "block_sender", "report_to_bank", "verify_official_channel"). */
  suggestedAction: string;
  /** Localized to the input language. */
  explanation: string;
  /** OPTIONAL-FUTURE: backend-computed risk score. Absent → show band label only. */
  riskScore?: number;
  /** OPTIONAL-FUTURE: sender identifier extracted from the message. */
  sender?: string;
  /** OPTIONAL-FUTURE: crowdsourced report count for `sender`. */
  senderReports?: number;
}

// ---- POST /api/batch-scan ----

export interface BatchScanRequest {
  /** 1–50 items, each 1–5000 characters. */
  messages: string[];
}

export interface BatchScanResult extends Omit<AnalyzeResponse, "verdict"> {
  /**
   * "unknown" only appears here, never from /api/analyze directly - it's a
   * batch-only synthesized value for a per-message analysis failure (paired
   * with analysisFailed: true), so it never appears in scamCount/
   * suspiciousCount/safeCount (see BatchScanSummary.unanalyzedCount).
   */
  verdict: Verdict | "unknown";
  /** Echoed back from the request. */
  message: string;
  /** True when analysis failed and the result was synthesized (contract on main; optional until merged). */
  analysisFailed?: boolean;
}

export interface BatchScanSummary {
  total: number;
  scamCount: number;
  suspiciousCount: number;
  safeCount: number;
  /** Count of results with analysisFailed (contract on main; optional until merged). */
  unanalyzedCount?: number;
}

export interface BatchScanResponse {
  results: BatchScanResult[];
  summary: BatchScanSummary;
}

// ---- POST /api/report ----

export interface ReportRequest {
  sender: string;
  /** Accepted but currently unused server-side. */
  message?: string;
  /** Accepted but currently unused server-side. */
  reportedBy?: string;
}

export interface ReportResponse {
  sender: string;
  reportCount: number;
  recorded: boolean;
}

// ---- Errors ----

/** Shape of every non-2xx body. `error` may contain raw internal text — never render it. */
export interface ApiErrorBody {
  error: string;
}

// ---- Contract limits (mirrors backend validation) ----

export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_BATCH_SIZE = 50;
