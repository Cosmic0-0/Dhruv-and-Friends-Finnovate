/**
 * Pure helpers behind the result screen: signal naming, ordering, link-check
 * parsing, next-step lists and the SAFE checklist. No React, no copy: they
 * return keys that components look up in lib/i18n.ts. Unit-tested in
 * lib/result.test.ts.
 */

import type { Redaction } from "./redact";
import type { Severity, Signal, Verdict } from "./types";

// ---------- Signals ----------

export const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

/** Highest severity first; original order kept within a severity. */
export function sortSignals<T extends Pick<Signal, "severity">>(signals: readonly T[]): T[] {
  return signals
    .map((s, i) => ({ s, i }))
    .sort((a, b) => SEVERITY_RANK[b.s.severity] - SEVERITY_RANK[a.s.severity] || a.i - b.i)
    .map(({ s }) => s);
}

export type SignalKind =
  | "sender_mismatch"
  | "lookalike_url"
  | "urgency_language"
  | "spoofed_identity"
  | "credential_request"
  | "payment_request"
  | "prize_offer"
  | "secrecy";

/** "Bank Impersonation" / "bank-impersonation" / "bankImpersonation" → "bank_impersonation" */
export function normalizeType(type: string): string {
  return type
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s\-.]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// `type` isn't an enforced enum, so the LLM's variations are folded into
// known kinds. Order matters: the first rule that matches wins.
const KIND_RULES: ReadonlyArray<[SignalKind, RegExp]> = [
  ["lookalike_url", /^lookalike_url$|lookalike|phish|(suspicious|malicious|fake|spoofed)_(link|url|domain)|typosquat/],
  ["sender_mismatch", /^sender_mismatch$|sender|unknown_number|spoofed_number/],
  ["urgency_language", /^urgency_language$|urgen|pressure|threat|deadline|time_limit/],
  ["spoofed_identity", /^spoofed_identity$|imperson|spoof|pretend|fake_identity|brand_abuse/],
  ["credential_request", /otp|code|pin|password|credential|sensitive|personal_info|card_detail|account_detail/],
  ["payment_request", /payment|money_request|fee|transfer|deposit|upfront/],
  ["prize_offer", /prize|lottery|winner|won|reward|gift|too_good/],
  ["secrecy", /secre|confidential|tell_no_one|dont_tell/],
];

export function signalKind(type: string): SignalKind | null {
  const t = normalizeType(type);
  for (const [kind, re] of KIND_RULES) if (re.test(t)) return kind;
  return null;
}

/** Readable fallback for an unknown type: "bank_impersonation" → "Bank impersonation". Never raw snake_case. */
export function humanizeType(type: string): string {
  const words = normalizeType(type).split("_").filter(Boolean).join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

// ---------- Link check ----------

export interface LinkCheck {
  /** The suspicious host found in the message. */
  host?: string;
  /** What it imitates: a real domain ("mcb.mu") or just a brand name ("MCB"). */
  resembles?: { kind: "domain" | "brand"; value: string };
}

const HOST_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b/gi;

/**
 * Parses the backend's deterministic domain-matching descriptions
 * (backend/src/services/domain-matching):
 *   "<host> closely resembles legitimate domain <domain>"
 *   "<host> contains brand token "<brand>" but is not a recognized domain for it"
 * Falls back to the first two hostnames in the text, then to the evidence.
 * Missing parts stay undefined so the UI can omit those rows.
 */
export function parseLinkCheck(signal: Pick<Signal, "description" | "evidence">): LinkCheck {
  const d = signal.description ?? "";
  let m = d.match(/^\s*(\S+?)\s+closely resembles legitimate domain\s+(\S+?)[.,;]?\s*$/i);
  if (m) return { host: m[1].toLowerCase(), resembles: { kind: "domain", value: m[2].toLowerCase() } };

  m = d.match(/^\s*(\S+?)\s+contains brand token\s+["“']?([^"”'\s]+)["”']?/i);
  if (m) return { host: m[1].toLowerCase(), resembles: { kind: "brand", value: m[2].toUpperCase() } };

  const hosts = [...d.matchAll(HOST_RE)].map((h) => h[0].toLowerCase());
  const fromEvidence = signal.evidence ? [...signal.evidence.matchAll(HOST_RE)].map((h) => h[0].toLowerCase()) : [];
  const host = hosts[0] ?? fromEvidence[0];
  const resembles = hosts.find((h) => h !== host);
  return {
    ...(host ? { host } : {}),
    ...(resembles ? { resembles: { kind: "domain" as const, value: resembles } } : {}),
  };
}

// ---------- What to do now ----------

export type StepKey =
  | "dont_open_or_reply"
  | "block_sender"
  | "report_to_bank"
  | "verify_official"
  | "dont_share_code"
  | "call_bank_card"
  | "delete_and_report";

export interface ActionPlan {
  steps: StepKey[];
  /** The model's own advice, when suggestedAction is a sentence rather than a key. */
  prose?: string;
}

const ACTION_KEYS: Record<string, StepKey> = {
  block_sender: "block_sender",
  report_to_bank: "report_to_bank",
  verify_official_channel: "verify_official",
};

/** suggestedAction is free-form: a key, several keys, a sentence, or anything else. */
function parseAction(suggestedAction: string): { keys: StepKey[]; prose?: string } {
  const raw = suggestedAction.trim();
  if (!raw) return { keys: [] };
  const tokens = raw.split(/\s*(?:[,;|/+&]|\band\b)\s*/i).map(normalizeType).filter(Boolean);
  const keys = tokens.map((t) => ACTION_KEYS[t]).filter((k): k is StepKey => Boolean(k));
  if (keys.length > 0 && keys.length === tokens.length) return { keys };
  // A readable sentence (several words, no snake_case) is the model's own advice: keep it.
  const isProse = !/_/.test(raw) && raw.split(/\s+/).length >= 3;
  return { keys, ...(isProse ? { prose: raw } : {}) };
}

export function actionPlan(verdict: Verdict, suggestedAction: string): ActionPlan {
  const { keys, prose } = parseAction(suggestedAction);
  let steps: StepKey[];
  if (verdict === "scam") {
    // Always: don't engage; call the bank on the card's number; delete and report.
    // report_to_bank is already covered by call_bank_card.
    const extra = keys.filter((k) => k !== "report_to_bank");
    steps = ["dont_open_or_reply", ...extra, "call_bank_card", "delete_and_report"];
  } else if (verdict === "suspicious") {
    steps = [...(keys.length ? keys : (["verify_official"] as StepKey[])), "dont_share_code"];
  } else {
    steps = keys;
  }
  return { steps: [...new Set(steps)], ...(prose ? { prose } : {}) };
}

// ---------- SAFE checklist ----------

export type SafeCheckKey = "no_link" | "no_lookalike" | "informs_not_asks" | "last_four_only" | "no_pressure";

const LINK_RE = /\bhttps?:\/\/|\bwww\.|\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\/\S*|\b[a-z0-9-]+\.(?:com|mu|net|org|info|io|co|top|xyz|win|link|app|site|online)\b/i;
const MASKED_DIGITS_RE =
  /(?:[x*•]{2,}[\s-]?\d{3,4}\b)|\b(?:ending(?:\s+in)?|se\s+terminant\s+par|finissant\s+par|ki\s+fini\s+par)\s+\d{4}\b/i;

/** Ticks shown for a SAFE verdict, each derived from what's absent. Only true statements are returned. */
export function safeChecks(
  signals: readonly Pick<Signal, "type">[],
  originalText: string,
  redactions: readonly Pick<Redaction, "kind">[],
): SafeCheckKey[] {
  const kinds = new Set(signals.map((s) => signalKind(s.type)));
  const checks: SafeCheckKey[] = [];

  const hasLink = LINK_RE.test(originalText);
  if (!hasLink) checks.push("no_link");
  else if (!kinds.has("lookalike_url")) checks.push("no_lookalike");

  const asks = kinds.has("urgency_language") || kinds.has("credential_request") || kinds.has("payment_request");
  if (!asks) checks.push("informs_not_asks");

  const fullAccountShown = redactions.some((r) => r.kind === "account");
  if (MASKED_DIGITS_RE.test(originalText) && !fullAccountShown) checks.push("last_four_only");

  if (!kinds.has("urgency_language") && !kinds.has("credential_request") && !kinds.has("secrecy")) {
    checks.push("no_pressure");
  }
  return checks;
}
