"use client";

import { card, MONO } from "@/components/dc";
import { accuracyPct, DAILY_GOAL, type StreakState } from "@/lib/streak";
import type { LearnCopy } from "./content";

/**
 * The Today / Streak / Accuracy stat tiles on Learn (Learn.dc.html). All
 * three are real: Today and Streak come from lib/streak.ts's daily-goal
 * state, Accuracy is the cumulative correct/answered ratio across every
 * question ever answered (null, shown as "Not yet", before the first one).
 */
export default function StreakCards({ state, today, t }: { state: StreakState; today: string; t: LearnCopy }) {
  const done = Math.min(state.today.answered, DAILY_GOAL);
  const streak = state.streak;
  const acc = accuracyPct(state);
  void today;

  const tile = (label: string, value: string, sub?: string) => (
    <div style={{ ...card(28), padding: "20px 22px", display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }} data-fx>
      <span style={{ fontSize: 12, color: "var(--dc-text3)", letterSpacing: "0.02em" }}>{label}</span>
      <span className="dc-mono" style={{ fontFamily: MONO, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--dc-ink)" }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{sub}</span>}
    </div>
  );

  return (
    <div className="dc-cols-1" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
      {tile(t.stats.today, `${done}/${DAILY_GOAL}`)}
      {tile(t.stats.streak, streak > 0 ? String(streak) : "0", streak > 0 ? t.stats.days.replace("{n}", String(streak)) : t.stats.noStreak)}
      {tile(t.stats.accuracy, acc === null ? "—" : `${acc}%`, acc === null ? t.stats.accuracyEmpty : undefined)}
    </div>
  );
}
