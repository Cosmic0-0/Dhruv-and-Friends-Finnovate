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
import { localDay } from "./learn-content";
import { emptyState, normalizeState, type StreakState } from "./streak";
import type { Redaction } from "./redact";
import type { AnalyzeResponse, Verdict } from "./types";

const RECENT_KEY = "fraudlens.recent.v1";
const RESULT_KEY = "fraudlens.result.v1";
const LANGUAGE_KEY = "fraudlens.language.v1";
const SIMPLE_MODE_KEY = "fraudlens.simpleMode.v1";

/**
 * How many checks to KEEP. The Check screen shows only the newest few, but the
 * "This week" card counts a rolling 7 days, which needs more than a screenful
 * of history to be true. 50 redacted messages is a few KB.
 */
export const RECENT_KEEP = 50;
/** How many to SHOW in the Recent list. */
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
  /** Where the text came from. A screenshot or document means the file itself was sent to the server. */
  source?: "typed" | "screenshot" | "document";
  /** Display only, for a document check: the name of the file the user picked. Never sent for analysis. */
  fileName?: string;
  /** Set after a successful POST /api/report, so a reload doesn't offer to report twice. */
  reported?: { sender: string; reportCount: number };
}

function read<T>(store: () => Storage, key: string): T | null {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** False when storage is unavailable or full (the quota is small: previews count). */
function write(store: () => Storage, key: string, value: unknown): boolean {
  try {
    store().setItem(key, JSON.stringify(value));
    return true;
  } catch {
    /* storage unavailable: nothing to persist */
    return false;
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
    .slice(0, RECENT_KEEP);
}

export function addRecentCheck(check: Omit<RecentCheck, "id">): void {
  // Settings > "Keep my check history" off: nothing new is kept on this device.
  if (!loadKeepHistory()) return;
  const id = `${check.at}-${Math.random().toString(36).slice(2, 8)}`;
  write(local, RECENT_KEY, [{ id, ...check }, ...getRecentChecks()].slice(0, RECENT_KEEP));
}

/** False when the result could not be stored (e.g. a full sessionStorage quota). */
export function saveResult(result: StoredResult): boolean {
  return write(session, RESULT_KEY, result);
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

/** Simple mode (components/SimpleMode.tsx): a remembered preference, same storage pattern as language. */
export function loadSimpleMode(): boolean {
  return read<unknown>(local, SIMPLE_MODE_KEY) === true;
}

export function saveSimpleMode(on: boolean): void {
  write(local, SIMPLE_MODE_KEY, on);
}

// ---------- Learn tab (daily streak + best score) ----------

const STREAK_KEY = "fraudlens.learn.v2";
/** The v1 model counted any answer as a day. Read once for its best score, then removed. */
const LEGACY_LEARN_KEY = "fraudlens.learn.v1";

/** Current streak state, validated and rolled over to `today`. Migrates and deletes v1 data. */
export function getStreakState(today: string = localDay()): StreakState {
  const raw = read<unknown>(local, STREAK_KEY);
  const legacy = raw === null ? read<unknown>(local, LEGACY_LEARN_KEY) : null;
  const state = normalizeState(raw, today, legacy);
  if (legacy !== null) {
    write(local, STREAK_KEY, state);
    try {
      local().removeItem(LEGACY_LEARN_KEY);
    } catch {
      /* storage unavailable */
    }
  }
  return state;
}

export function saveStreakState(state: StreakState): void {
  write(local, STREAK_KEY, state);
}

/** Dev tool (Learn tab, `next dev` only): forget all streak progress, including today's. */
export function resetStreakState(): void {
  try {
    local().removeItem(STREAK_KEY);
    local().removeItem(LEGACY_LEARN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Dev tool: pretend `days` consecutive days were completed, ending yesterday, so today continues the streak. */
export function seedStreakEndingYesterday(days: number, today: string = localDay()): void {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  write(local, STREAK_KEY, { ...emptyState(today), streak: days, lastCompletedDay: localDay(d) });
}

// ---------- Settings preferences (components/settings) ----------

const KEEP_HISTORY_KEY = "fraudlens.keepHistory.v1";
const SHARE_SAMPLES_KEY = "fraudlens.shareSamples.v1";
const SCAM_ALERTS_KEY = "fraudlens.scamAlerts.v1";
const PRACTICE_REMINDER_KEY = "fraudlens.practiceReminder.v1";

/** Keep recent checks on this device. On unless the user turned it off. */
export function loadKeepHistory(): boolean {
  return read<unknown>(local, KEEP_HISTORY_KEY) !== false;
}
export function saveKeepHistory(on: boolean): void {
  write(local, KEEP_HISTORY_KEY, on);
}

/** Let analyses add to shared evidence (the API's shareSamples). On unless turned off. */
export function loadShareSamples(): boolean {
  return read<unknown>(local, SHARE_SAMPLES_KEY) !== false;
}
export function saveShareSamples(on: boolean): void {
  write(local, SHARE_SAMPLES_KEY, on);
}

/** Scam alerts: off until the user turns them on (they need notification permission). */
export interface ScamAlertsState {
  on: boolean;
  /** Campaign ids and message counts already seen, so only new or growing campaigns alert. */
  seen: Record<string, number>;
}
export function loadScamAlerts(): ScamAlertsState {
  const raw = read<Partial<ScamAlertsState>>(local, SCAM_ALERTS_KEY);
  const seen = raw && typeof raw.seen === "object" && raw.seen !== null ? (raw.seen as Record<string, number>) : {};
  return { on: raw?.on === true, seen };
}
export function saveScamAlerts(state: ScamAlertsState): void {
  write(local, SCAM_ALERTS_KEY, state);
}

/** Daily practice reminder: off until turned on. `lastShown` is the local day it last fired. */
export interface PracticeReminderState {
  on: boolean;
  lastShown: string | null;
}
export function loadPracticeReminder(): PracticeReminderState {
  const raw = read<Partial<PracticeReminderState>>(local, PRACTICE_REMINDER_KEY);
  return { on: raw?.on === true, lastShown: typeof raw?.lastShown === "string" ? raw.lastShown : null };
}
export function savePracticeReminder(state: PracticeReminderState): void {
  write(local, PRACTICE_REMINDER_KEY, state);
}

/** Settings > "Delete my check history": the recent list and the last result hand-off. */
export function clearCheckHistory(): void {
  try {
    local().removeItem(RECENT_KEY);
  } catch {
    /* storage unavailable */
  }
  try {
    session().removeItem(RESULT_KEY);
  } catch {
    /* storage unavailable */
  }
}
