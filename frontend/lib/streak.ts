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
import { dayGap, nextStreak } from "./learn-content.ts";
import type { QuizItem } from "./learn-content.ts";
import type { SignalKind } from "./result";

export const DAILY_GOAL = 5;
const MAX_MISTAKES = 20;

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

export interface StreakState {
  version: 2;
  /** Consecutive completed days, ending on lastCompletedDay. */
  streak: number;
  lastCompletedDay: string | null;
  today: TodayProgress;
  /** Best round score (kept from the v1 model). */
  best: { score: number; total: number } | null;
}

export function freshToday(day: string): TodayProgress {
  return { day, answered: 0, correct: 0, mistakes: [], celebrated: false };
}

export function emptyState(today: string): StreakState {
  return { version: 2, streak: 0, lastCompletedDay: null, today: freshToday(today), best: null };
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

/**
 * Validates whatever is stored and rolls "today" over to a new day. Never
 * throws. The old v1 shape ({ streak, lastDay, best }) counted any answer
 * as a day, so its streak can't be trusted under the new rule: only its best
 * score is carried over.
 */
export function normalizeState(raw: unknown, today: string, legacyV1?: unknown): StreakState {
  if (isObj(raw) && raw.version === 2) {
    const t = isObj(raw.today) ? raw.today : {};
    const sameDay = isDay(t.day) && t.day === today;
    return {
      version: 2,
      streak: count(raw.streak),
      lastCompletedDay: isDay(raw.lastCompletedDay) ? raw.lastCompletedDay : null,
      today: sameDay
        ? {
            day: today,
            answered: count(t.answered),
            correct: Math.min(count(t.correct), count(t.answered)),
            mistakes: readMistakes(t.mistakes),
            celebrated: t.celebrated === true,
          }
        : freshToday(today),
      best: readBest(raw.best),
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
    },
  };
}
