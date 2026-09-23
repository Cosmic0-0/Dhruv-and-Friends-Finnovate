"use client";

import type { Copy } from "@/lib/i18n";
import { DAILY_GOAL } from "@/lib/streak";

/**
 * The Today / Streak card pair on Learn (design/mockup/Learn.png): today's
 * answers as five segments, and the live streak in a ring.
 *
 * This is also the only place the streak is visible on this screen, which
 * matters for the dev tools below: "Pretend 2 days done" writes a streak, and
 * without these cards that button changes stored state with nothing on screen
 * to show for it.
 */
export default function StreakCards({
  answered,
  streak,
  copy,
}: {
  answered: number;
  streak: number;
  copy: Copy;
}) {
  const c = copy.learn.cards;
  const done = Math.min(answered, DAILY_GOAL);
  const left = Math.max(0, DAILY_GOAL - done);

  const R = 36.5;
  const circumference = 2 * Math.PI * R;
  // The ring tracks progress toward today's goal, not the streak number, so a
  // long streak never draws a ring fuller than today's actual practice.
  const filled = (done / DAILY_GOAL) * circumference;

  return (
    <div className="grid grid-cols-12 items-stretch gap-3.5">
      <section className="card col-span-7 flex flex-col gap-1">
        <h2 className="micro text-ink-muted">{c.todayTitle}</h2>
        <p className="data mt-1 text-[1.75rem] leading-8 font-bold text-ink">{c.todayCount(done, DAILY_GOAL)}</p>
        <div aria-hidden="true" className="mt-2 flex gap-1.5">
          {Array.from({ length: DAILY_GOAL }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-[3px] ${i < done ? "bg-ink" : "bg-track"}`} />
          ))}
        </div>
        <p className="mt-2 text-[0.9375rem] leading-5 text-ink-muted">{left > 0 ? c.more(left) : c.doneToday}</p>
      </section>

      <section className="card col-span-5 flex flex-col items-start gap-2">
        <h2 className="micro text-ink-muted">{c.streakTitle}</h2>
        <div className="relative size-21">
          <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
            <circle cx="42" cy="42" r={R} fill="none" stroke="var(--color-track)" strokeWidth="7" />
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
            {streak}
          </span>
        </div>
        <span className="text-[0.9375rem] font-semibold text-ink">
          {streak > 0 ? c.days(streak) : c.noStreak}
        </span>
      </section>
    </div>
  );
}
