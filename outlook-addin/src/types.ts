export type AuthResult = "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror" | "unknown";

export const RISK_LEVELS = ["low", "elevated", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface MailboxAddress {
  name: string | null;
  /** Null when Outlook supplied only a display name (e.g. an unresolved legacy DN). */
  address: string | null;
}

export type ReplyToAddress = MailboxAddress & { address: string };

export interface EmailContext {
  messageId: string | null;
  from: MailboxAddress | null;
  replyTo: ReplyToAddress[];
  returnPath: string | null;
  subject: string | null;
  authentication: { spf: AuthResult; dkim: AuthResult; dmarc: AuthResult };
  attachments: Array<{ name: string; contentType: string | null; size: number | null }>;
  urls: string[];
  threadContext: null;
  recipient: string | null;
  senderContext: null;
}

export interface AnalyzePayload {
  source: "email";
  message: string;
  emailContext: EmailContext;
}

export interface SignalComparison {
  field?: string;
  observed?: unknown;
  expected?: unknown;
  technique?: string;
  source?: string;
  protectedDomain?: string;
  observedDomain?: string;
  knownSupplierDomain?: string;
  knownAccountLast4?: string;
  requestedAccountLast4?: string;
  [key: string]: unknown;
}

export interface FraudSignal {
  code: string;
  description: string;
  evidence?: string;
  sourceType: "rule" | "lexicon" | "intel" | "semantic_model" | "community";
  severity: "low" | "medium" | "high" | string;
  scored?: boolean;
  corroboratedBy?: string[];
  metadata?: { comparison?: SignalComparison; variant?: string; [key: string]: unknown };
}

export interface VerificationWorkflow {
  id: string;
  title: string;
  owner: string | null;
  steps: string[];
  requiredApprovals: number;
  triggeredBy: string[];
}

export interface AnalyzeResponse {
  verdict: string;
  riskScore: number;
  risk: { score: number; level: RiskLevel; confidence: string };
  decision: string;
  signals: FraudSignal[];
  trace: Array<{ id: string; points?: number; levelFloor?: string; reason: string; corroboratedBy?: string[] }>;
  actions: Array<{ id: string; text?: string; label?: string; description?: string }>;
  reduceConcern?: unknown[];
  suggestedAction?: string;
  explanation?: string;
  verification?: {
    policyVersion: string;
    required: boolean;
    workflows: VerificationWorkflow[];
    reportTo: string | null;
  };
  analysis: {
    rulesetVersion: string;
    source: string;
    semantic: { status: string; error?: string };
    email?: { checks?: Record<string, string>; availableEvidence?: string[] };
    organisation?: {
      campaigns?: Array<{ campaignId?: string; messages?: number; recipients?: number; senders?: number }>;
      reputation?: unknown;
      senderRelation?: string;
    };
  };
}

export interface ExtractionReport {
  bodyFormat: "text" | "html";
  bodyTruncated: boolean;
  quotedContextRemoved: boolean;
  headersAvailable: boolean;
  unavailable: string[];
  /** Links too long for the API contract; left out rather than failing the request. */
  urlsOmitted: number;
  /** Links that lost their query string to fit the API limit (host and path kept). */
  urlsShortened: number;
  /** What was analysed, so a stale result is recognisable on screen. */
  subject: string | null;
  fromAddress: string | null;
}
