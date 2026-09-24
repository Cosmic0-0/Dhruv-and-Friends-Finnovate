"use client";

import { card, MONO } from "@/components/dc";
import { accuracyPct, DAILY_GOAL, type StreakState } from "@/lib/streak";
import type { LearnCopy } from "./content";

/**
 * The Today / Streak / Accuracy stat tiles in the Learn header (Learn.dc.html:
 * three small tiles to the right of the title, not a full-width row). All
 * three are real: Today and Streak come from lib/streak.ts's daily-goal
 * state, Accuracy is the cumulative correct/answered ratio across every
 * question ever answered ("—", shown honestly, before the first one).
 */
export default function StreakCards({ state, t }: { state: StreakState; t: LearnCopy }) {
  const done = Math.min(state.today.answered, DAILY_GOAL);
  const streak = state.streak;
  const acc = accuracyPct(state);

  const tile = (label: string, value: string) => (
    <div className="learn-stat" style={{ ...card(24), padding: "20px 24px", display: "flex", flexDirection: "column", gap: 8, minWidth: 150 }} data-fx>
      <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{label}</span>
      <span className="dc-mono" style={{ fontFamily: MONO, fontSize: 34, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: "var(--dc-ink)" }}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="learn-stats" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {tile(t.stats.today, `${done}/${DAILY_GOAL}`)}
      {tile(t.stats.streak, `${streak} ${t.stats.unit}`)}
      {tile(t.stats.accuracy, acc === null ? "—" : `${acc}%`)}
    </div>
  );
}
