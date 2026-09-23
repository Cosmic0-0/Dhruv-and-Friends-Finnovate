"use client";

import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import { DAILY_GOAL } from "@/lib/streak";
import type { WeekStats } from "@/lib/week";

/**
 * The two-card row under the hero (frontend/design/mockup/Main.html): "This
 * week" on a 7-column span, "Practice" on 5.
 *
 * Both read local state only — check history and the Learn streak — so neither
 * shows a number the device cannot account for. The week card hides itself
 * when nothing has been checked, rather than showing a row of noughts.
 */
export function WeekCard({ stats, copy }: { stats: WeekStats; copy: Copy }) {
  const c = copy.check.week;
  // Bar widths are shares of this week's checks, so the bar and the counts
  // above it can never disagree.
  const pct = (n: number) => (stats.total > 0 ? (n / stats.total) * 100 : 0);
  const bars = [
    { key: "scam", w: pct(stats.scam), bg: "bg-danger" },
    { key: "suspicious", w: pct(stats.suspicious), bg: "bg-caution" },
    { key: "safe", w: pct(stats.safe), bg: "bg-safe" },
  ].filter((b) => b.w > 0);

  return (
    <section className="card col-span-7 flex flex-col gap-1">
      <h2 className="micro text-ink-muted">{c.title}</h2>
      <p className="data mt-1.5 text-[1.75rem] leading-8 font-bold text-ink">{c.checks(stats.total)}</p>
      <p className="text-[0.9375rem] text-ink-muted">
        {stats.scam > 0 ? (
          <>
            <span className="font-semibold text-danger-ink">{c.caught(stats.scam).strong}</span>{" "}
            {c.caught(stats.scam).rest}
          </>
        ) : (
          c.nothing
        )}
      </p>
      {bars.length > 0 && (
        <div aria-hidden="true" className="mt-3 flex h-1.5 gap-[3px]">
          {bars.map((b) => (
            <span key={b.key} className={`rounded-[3px] ${b.bg}`} style={{ width: `${b.w}%` }} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Practice ring: today's answers out of the daily goal, with the live streak
 * underneath. Links into Learn, so the card is the shortcut it looks like.
 */
export function PracticeCard({
  answered,
  streak,
  copy,
}: {
  answered: number;
  streak: number;
  copy: Copy;
}) {
  const c = copy.check.practice;
  const done = Math.min(answered, DAILY_GOAL);
  const R = 36.5;
  const circumference = 2 * Math.PI * R;
  const filled = (done / DAILY_GOAL) * circumference;

  return (
    <Link href="/learn" // only:col-span-12 — with no week card beside it, it takes the row
      className="card pressable col-span-5 only:col-span-12 flex flex-col items-start gap-2">
      <h2 className="micro text-ink-muted">{c.title}</h2>
      <div className="relative size-21">
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
          <circle cx="42" cy="42" r={R} fill="none" stroke="var(--color-track)" strokeWidth="7" />
          {/* Only when there is progress: a round linecap on a zero-length
              dash paints a dot, which reads as "1 done" at 0 of 5. */}
          {done > 0 && (
            <circle
              cx="42"
              cy="42"
              r={R}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              transform="rotate(-90 42 42)"
            />
          )}
        </svg>
        <span className="data absolute inset-0 flex items-center justify-center text-[1.375rem] font-bold text-ink">
          {done}/{DAILY_GOAL}
        </span>
      </div>
      <span className="text-[0.9375rem] font-semibold text-ink">{streak > 0 ? c.streak(streak) : c.start}</span>
    </Link>
  );
}
