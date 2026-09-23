/**
 * Types mirroring docs/API-CONTRACT.md ("as implemented").
 *
 * Fields marked OPTIONAL are in the contract but best-effort: the backend
 * omits them (rather than sending null/0) when it has no valid value. The UI
 * must render correctly whether they are present or not — never assume them,
 * never synthesise them client-side.
 */

export const SCAM_STAGES = ["INITIAL_CONTACT", "TRUST_BUILDING", "AUTHORITY_CLAIM", "URGENCY", "CREDENTIAL_REQUEST", "OTP_REQUEST", "PAYMENT_REQUEST", "PAYMENT_PRESSURE", "ACCOUNT_TAKEOVER"] as const;
export type ScamStage = typeof SCAM_STAGES[number];
export type ScamType = "MCB_IMPERSONATION" | "SBM_IMPERSONATION" | "ABSA_IMPERSONATION" | "BANK_ONE_IMPERSONATION" | "TELCO_PRIZE_SCAM" | "MOBILE_MONEY_FRAUD" | "FAKE_PARCEL" | "MARKETPLACE_PAYMENT_FRAUD";

export type Verdict = "safe" | "suspicious" | "scam";

export type Severity = "low" | "medium" | "high";

/** Free-form hint passed straight into the LLM prompt; not validated server-side. */
export type LanguageHint = "en" | "fr" | "kreol" | "mixed";

export type SignalSource = "message_text" | "url_parser" | "community_reports" | "llm_analysis" | "identity_check";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface Signal {
  /** e.g. "sender_mismatch" | "urgency_language" | "lookalike_url" | "spoofed_identity" | "IDENTITY_MISMATCH" — free-form string */
  type: string;
  description: string;
  severity: Severity;
  /** OPTIONAL: the exact text/URL in the message that triggered this signal. */
  evidence?: string;
  /** OPTIONAL: age of a linked domain in days (lookalike_url signals). */
  domainAgeDays?: number;
  /** OPTIONAL: where in the pipeline this signal came from. */
  source?: SignalSource;
  /** OPTIONAL: the actual host detected in the message (lookalike_url only). */
  domain?: string;
  /** OPTIONAL: the legitimate domain `domain` was compared against (lookalike_url and IDENTITY_MISMATCH). */
  officialDomain?: string;
  /** OPTIONAL: display name of the claimed institution (IDENTITY_MISMATCH only). */
  claimedIdentity?: string;
  /** OPTIONAL: the mismatched host actually linked to, when the mismatch is domain-based (IDENTITY_MISMATCH only). */
  actualDomain?: string;
  /** OPTIONAL: the stated payment recipient, when the mismatch is beneficiary-based (IDENTITY_MISMATCH only). */
  beneficiary?: string;
  /** OPTIONAL: stable reason code, e.g. "DOC-04" (authoritative; `type` is the legacy name). */
  code?: string;
  /** OPTIONAL: detector details, e.g. { variant, page } on document findings. Never rendered raw. */
  metadata?: Record<string, unknown>;
}

// ---- POST /api/analyze ----

export interface AnalyzeRequest {
  /** 1–5000 characters. */
  message: string;
  language?: LanguageHint | string;
}

export interface AnalyzeResponse {
  scamProfile?: { type: ScamType | null; stage: ScamStage; claimedIdentity: string | null };
  journey?: { currentStage: ScamStage; likelyNextStages: { stage: ScamStage; reason: string }[] };
  scamDna?: { fingerprintId: string; matchStrength: "new" | "matched"; relatedReports: number; relatedSenders: number; relatedDomains: number };

  verdict: Verdict;
  signals: Signal[];
  /** Free-form, NOT an enforced enum (e.g. "block_sender", "report_to_bank", "verify_official_channel"). */
  suggestedAction: string;
  /** Localized to the input language. */
  explanation: string;
  /** OPTIONAL: backend-computed risk score. Absent → show band label only. */
  riskScore?: number;
  /** OPTIONAL: sender identifier extracted from the message. */
  sender?: string;
  /** OPTIONAL: crowdsourced report count for `sender`. */
  senderReports?: number;
  /** OPTIONAL: risk broken into categories, derived from `signals`. */
  riskCategories?: {
    identity_risk: RiskLevel;
    behavioral_risk: RiskLevel;
    payment_risk: RiskLevel;
    technical_risk: RiskLevel;
    verification_risk: RiskLevel;
  };
  /** OPTIONAL: the backend's intervention policy (fixed ids; English text). The web UI localizes known ids. */
  actions?: { id: string; text: string }[];
  /** OPTIONAL: only on /api/analyze/document results — the file's structural facts and evidence. */
  document?: DocumentInfo;
  /** OPTIONAL: pipeline metadata, incl. which AI (if any) served this analysis — see docs/API-CONTRACT.md. */
  analysis?: {
    source: string;
    semantic: {
      status: "ok" | "unavailable" | "invalid" | "skipped";
      /** e.g. "qwen3:8b" (local) or "claude-haiku-4-5-20251001" (fallback). Absent when status is "unavailable"/"skipped". */
      model?: string;
      /** e.g. "ollama" (local/self-hosted) or "anthropic"/"openai"/"openrouter" (hosted fallback). */
      provider?: string;
    };
  };
}

// ---- POST /api/analyze/screenshot ----

export interface AnalyzeScreenshotRequest {
  /** Base64-encoded image, with or without a "data:<mime>;base64," prefix. PNG/JPEG/WEBP, ≤5MB decoded. */
  image: string;
  language?: LanguageHint | string;
}

/**
 * The server runs OCR, redacts identifiers from the extracted text
 * (backend/src/services/redact), then analyses it. The UI uses only
 * `extractedText`: it goes into the editable textarea for the user to review
 * and correct, then through the browser's own redaction (lib/redact.ts) and
 * /api/analyze like typed text. The server's own verdict in this response is
 * deliberately not shown: it was computed on unreviewed OCR text, which can
 * contain misreads the user hasn't had a chance to fix.
 */
export interface AnalyzeScreenshotResponse extends AnalyzeResponse {
  /** OCR output, already redacted server-side: this is what the server analysed. */
  extractedText: string;
}

// ---- POST /api/analyze/document ----

export interface AnalyzeDocumentRequest {
  /** The file's bytes as a data URL or plain base64. PDF or DOCX (checked by content server-side), ≤10MB decoded. */
  file: string;
  /** Display only: the backend ignores it and never echoes it. */
  fileName?: string;
  language?: LanguageHint | string;
}

/** A small PNG of an image found pasted onto the document (DOC-04). */
export interface DocumentPreview {
  signalCode: string;
  /** Null for DOCX (no fixed pages). */
  page: number | null;
  widthPx: number;
  heightPx: number;
  effectiveDpi: number | null;
  /** The scan's own resolution; null when there is no scan behind it (DOCX). */
  backgroundDpi: number | null;
  hasAlpha: boolean;
  hardEdgeRatio: number | null;
  /** Always a data:image/png;base64 URL (enforced by lib/api.ts before storing). */
  dataUrl: string;
}

export interface DocumentInfo {
  fileType: "pdf" | "docx";
  pageCount: number | null;
  pagesAnalyzed: number | null;
  textSource: "text_layer" | "ocr" | "none";
  /** True when only the first part of the text fitted in one analysis. */
  textTruncated: boolean;
  metadata: {
    producer: string | null;
    creator: string | null;
    created: string | null;
    modified: string | null;
    /** Null for DOCX. */
    incrementalUpdates: number | null;
    signed: boolean;
  };
  previews: DocumentPreview[];
}

export interface AnalyzeDocumentResponse extends AnalyzeResponse {
  /** Redacted text found in the document (what was analysed). */
  extractedText: string;
  document: DocumentInfo;
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
  /** True when analysis failed and the result was synthesized. Always sent by the backend; optional here for older backends. */
  analysisFailed?: boolean;
}

export interface BatchScanSummary {
  total: number;
  scamCount: number;
  suspiciousCount: number;
  safeCount: number;
  /** Count of results with analysisFailed. Always sent by the backend; optional here for older backends. */
  unanalyzedCount?: number;
}

export interface BatchScanResponse {
  results: BatchScanResult[];
  summary: BatchScanSummary;
}

// ---- POST /api/check-sender ----

export interface CheckSenderRequest {
  sender: string;
}

export interface CheckSenderResponse {
  sender: string;
  /** 0 if never reported. */
  reportCount: number;
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
/** Decoded image size cap for /api/analyze/screenshot; backend also enforces this (backend/src/routes/index.js). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** File size cap for /api/analyze/document; the backend enforces it too. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
