/**
 * Browser storage for checks. Every access is guarded: storage can be
 * missing or throw (private mode, blocked site data, full quota), and the
 * app must keep working without it.
 *
 * - Recent checks (localStorage): REDACTED text only, never the original.
 * - Current result hand-off (sessionStorage, this tab only): the response
 *   plus the redaction mapping, so the result screen can show the user's
 *   original text. The originals never leave the device.
 */

import type { UiLanguage } from "./i18n";
import type { Redaction } from "./redact";
import type { AnalyzeResponse, Verdict } from "./types";

const RECENT_KEY = "fraudlens.recent.v1";
const RESULT_KEY = "fraudlens.result.v1";
const LANGUAGE_KEY = "fraudlens.language.v1";
export const RECENT_LIMIT = 5;

export interface RecentCheck {
  id: string;
  /** Redacted text, exactly as it was sent for analysis. */
  text: string;
  verdict: Verdict;
  /** Epoch ms. */
  at: number;
}

export interface StoredResult {
  response: AnalyzeResponse;
  /** What was sent to the API. */
  redacted: string;
  /** Placeholder → original mapping; lib/redact.ts restore() rebuilds the user's text. */
  redactions: Redaction[];
  language: UiLanguage;
  at: number;
}

function read<T>(store: () => Storage, key: string): T | null {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(store: () => Storage, key: string, value: unknown): void {
  try {
    store().setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: nothing to persist */
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

const VERDICTS: readonly unknown[] = ["safe", "suspicious", "scam"];

export function getRecentChecks(): RecentCheck[] {
  const list = read<unknown>(local, RECENT_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (c): c is RecentCheck =>
        typeof c === "object" &&
        c !== null &&
        typeof c.id === "string" &&
        typeof c.text === "string" &&
        VERDICTS.includes(c.verdict) &&
        typeof c.at === "number",
    )
    .slice(0, RECENT_LIMIT);
}

export function addRecentCheck(check: Omit<RecentCheck, "id">): void {
  const id = `${check.at}-${Math.random().toString(36).slice(2, 8)}`;
  write(local, RECENT_KEY, [{ id, ...check }, ...getRecentChecks()].slice(0, RECENT_LIMIT));
}

export function saveResult(result: StoredResult): void {
  write(session, RESULT_KEY, result);
}

export function loadResult(): StoredResult | null {
  const r = read<StoredResult>(session, RESULT_KEY);
  return r && typeof r === "object" && r.response && typeof r.redacted === "string" && Array.isArray(r.redactions)
    ? r
    : null;
}

export function loadLanguage(): UiLanguage | null {
  const lang = read<unknown>(local, LANGUAGE_KEY);
  return lang === "en" || lang === "fr" || lang === "kreol" ? lang : null;
}

export function saveLanguage(lang: UiLanguage): void {
  write(local, LANGUAGE_KEY, lang);
}
