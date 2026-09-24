/**
 * Daily practice streak for the Learn tab. Pure, unit-tested in
 * lib/streak.test.ts; lib/storage.ts does the localStorage I/O.
 *
 * - A day is complete once DAILY_GOAL questions are answered that calendar
 *   day (local time), across any number of rounds.
 * - Completing consecutive days grows the streak; a missed day resets it to 1
 *   on the next completed day.
 * - The celebration fires once per day, on the answer that completes it.
 */

// Explicit .ts extension: this is a runtime import, and Node's test runner needs it.
import { dayGap, localDay, nextStreak } from "./learn-content.ts";
import type { QuizItem } from "./learn-content.ts";
import type { SignalKind } from "./result";

export const DAILY_GOAL = 5;
const MAX_MISTAKES = 20;
/** Past days kept in `history`, well past the 7 the "This week" strip needs. */
const MAX_HISTORY_DAYS = 35;

export interface Mistake {
  id: string;
  /** Snapshot of the message, so the review still works if the corpus changes. */
  text: string;
  /** What the message really was. */
  isScam: boolean;
  reasons: SignalKind[];
}

export interface TodayProgress {
  day: string;
  answered: number;
  correct: number;
  mistakes: Mistake[];
  celebrated: boolean;
}

/** Answered/correct counts for one past calendar day (not today: see StreakState.history). */
export interface DayStats {
  answered: number;
  correct: number;
}

/** One entry of the Learn tab's "This week" strip. */
export interface DayStat extends DayStats {
  day: string;
  goalMet: boolean;
}

export interface StreakState {
  version: 3;
  /** Consecutive completed days, ending on lastCompletedDay. */
  streak: number;
  lastCompletedDay: string | null;
  today: TodayProgress;
  /** Best round score (kept from the v1 model). */
  best: { score: number; total: number } | null;
  /** All-time answered/correct, for the Accuracy stat tile. Grows with every answer, any day. */
  totalAnswered: number;
  totalCorrect: number;
  /** Past days only (today lives in `today`), most recent MAX_HISTORY_DAYS kept. Feeds "This week". */
  history: Record<string, DayStats>;
}

export function freshToday(day: string): TodayProgress {
  return { day, answered: 0, correct: 0, mistakes: [], celebrated: false };
}

export function emptyState(today: string): StreakState {
  return { version: 3, streak: 0, lastCompletedDay: null, today: freshToday(today), best: null, totalAnswered: 0, totalCorrect: 0, history: {} };
}

/** Accuracy across every answer ever recorded, or null before the first one (an honest "no data yet"). */
export function accuracyPct(state: StreakState): number | null {
  return state.totalAnswered > 0 ? Math.round((state.totalCorrect / state.totalAnswered) * 100) : null;
}

function addDaysToDay(day: string, delta: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return localDay(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + delta));
}

/** The 7 calendar days ending today (oldest first), for the Learn tab's "This week" strip. */
export function weekHistory(state: StreakState, today: string): DayStat[] {
  const out: DayStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDaysToDay(today, -i) ?? today;
    const src = day === state.today.day ? state.today : state.history[day];
    const answered = src?.answered ?? 0;
    const correct = src?.correct ?? 0;
    out.push({ day, answered, correct, goalMet: answered >= DAILY_GOAL });
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function readBest(v: unknown): StreakState["best"] {
  return isObj(v) && typeof v.score === "number" && typeof v.total === "number" && v.total > 0 && v.score >= 0
    ? { score: Math.floor(v.score), total: Math.floor(v.total) }
    : null;
}

function readMistakes(v: unknown): Mistake[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((m): m is Mistake => isObj(m) && typeof m.id === "string" && typeof m.text === "string" && typeof m.isScam === "boolean")
    .map((m) => ({ id: m.id, text: m.text, isScam: m.isScam, reasons: Array.isArray(m.reasons) ? m.reasons.filter((r) => typeof r === "string") : [] }))
    .slice(-MAX_MISTAKES);
}

function readDayStats(v: unknown): DayStats | null {
  if (!isObj(v) || typeof v.answered !== "number") return null;
  const answered = count(v.answered);
  return { answered, correct: Math.min(count(v.correct), answered) };
}

/** Validated history map, capped to the most recent MAX_HISTORY_DAYS entries. */
function readHistory(v: unknown): Record<string, DayStats> {
  if (!isObj(v)) return {};
  const out: Record<string, DayStats> = {};
  for (const [day, stats] of Object.entries(v)) {
    if (!isDay(day)) continue;
    const s = readDayStats(stats);
    if (s) out[day] = s;
  }
  const days = Object.keys(out).sort();
  for (const day of days.slice(0, Math.max(0, days.length - MAX_HISTORY_DAYS))) delete out[day];
  return out;
}

/**
 * Validates whatever is stored and rolls "today" over to a new day. Never
 * throws. The old v1 shape ({ streak, lastDay, best }) counted any answer
 * as a day, so its streak can't be trusted under the new rule: only its best
 * score is carried over.
 *
 * v2 → v3 is additive: totals and history didn't exist in v2, so they're
 * seeded from whatever v2's single "today" snapshot still holds (real data,
 * just thin until fresh answers build up proper history).
 */
export function normalizeState(raw: unknown, today: string, legacyV1?: unknown): StreakState {
  if (isObj(raw) && (raw.version === 2 || raw.version === 3)) {
    const t = isObj(raw.today) ? raw.today : {};
    const sameDay = isDay(t.day) && t.day === today;
    const oldToday: TodayProgress = {
      day: isDay(t.day) ? t.day : today,
      answered: count(t.answered),
      correct: Math.min(count(t.correct), count(t.answered)),
      mistakes: readMistakes(t.mistakes),
      celebrated: t.celebrated === true,
    };
    const isV3 = raw.version === 3;
    const history = isV3 ? readHistory(raw.history) : {};
    if (!sameDay && oldToday.day !== today && oldToday.answered > 0) {
      history[oldToday.day] = { answered: oldToday.answered, correct: oldToday.correct };
    }
    return {
      version: 3,
      streak: count(raw.streak),
      lastCompletedDay: isDay(raw.lastCompletedDay) ? raw.lastCompletedDay : null,
      today: sameDay ? oldToday : freshToday(today),
      best: readBest(raw.best),
      totalAnswered: isV3 ? count(raw.totalAnswered) : oldToday.answered,
      totalCorrect: isV3 ? Math.min(count(raw.totalCorrect), count(raw.totalAnswered)) : oldToday.correct,
      history,
    };
  }
  const state = emptyState(today);
  if (isObj(legacyV1)) state.best = readBest(legacyV1.best);
  return state;
}

/** Streak to display: it's still alive if the last completed day is today or yesterday. */
export function visibleStreak(state: StreakState, today: string): number {
  if (!state.lastCompletedDay || state.streak < 1) return 0;
  const gap = dayGap(state.lastCompletedDay, today);
  return gap === 0 || gap === 1 ? state.streak : 0;
}

export function recordAnswer(
  state: StreakState,
  answer: { item: Pick<QuizItem, "id" | "text" | "isScam" | "reasons">; correct: boolean },
  today: string,
): { state: StreakState; completedNow: boolean } {
  const base = normalizeState(state, today);
  const t = base.today;
  const answered = t.answered + 1;
  const mistakes = answer.correct
    ? t.mistakes
    : [
        ...t.mistakes.filter((m) => m.id !== answer.item.id),
        { id: answer.item.id, text: answer.item.text, isScam: answer.item.isScam, reasons: answer.item.reasons },
      ].slice(-MAX_MISTAKES);

  let { streak, lastCompletedDay } = base;
  let completedNow = false;
  if (answered === DAILY_GOAL && lastCompletedDay !== today) {
    completedNow = true;
    streak = nextStreak({ streak, lastDay: lastCompletedDay }, today);
    lastCompletedDay = today;
  }
  return {
    completedNow,
    state: {
      ...base,
      streak,
      lastCompletedDay,
      today: { ...t, answered, correct: t.correct + (answer.correct ? 1 : 0), mistakes },
      totalAnswered: base.totalAnswered + 1,
      totalCorrect: base.totalCorrect + (answer.correct ? 1 : 0),
    },
  };
}
