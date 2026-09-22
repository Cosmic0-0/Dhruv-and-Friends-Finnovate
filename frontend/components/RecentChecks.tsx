"use client";

import { useEffect, useState } from "react";
import { getRecentChecks, type RecentCheck } from "@/lib/storage";
import { getVerdictDisplay, getVerdictCopy } from "@/lib/verdict";
import { useLanguage } from "./LanguageProvider";

/** Last 5 checks from localStorage. Only redacted text is ever stored. */
export default function RecentChecks() {
  const { lang, copy } = useLanguage();
  // null until mounted: localStorage isn't available during server render.
  const [checks, setChecks] = useState<RecentCheck[] | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setChecks(getRecentChecks());
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);

  return (
    <section aria-labelledby="recent-title" className="flex flex-col gap-3">
      <h2
        id="recent-title"
        className="font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-muted uppercase"
      >
        {copy.recentTitle}
      </h2>

      {checks !== null && checks.length === 0 && <p className="text-sm text-ink-muted">{copy.recentEmpty}</p>}

      {checks !== null && checks.length > 0 && (
        <ul className="flex flex-col divide-y divide-card-border overflow-hidden rounded-card border border-card-border bg-card">
          {checks.map((c) => {
            const display = getVerdictDisplay(c.verdict);
            return (
              <li key={c.id} className="flex flex-col gap-1 px-4 py-3.5">
                <p className="truncate text-[0.9375rem] text-ink">&ldquo;{c.text.replace(/\s+/g, " ").trim()}&rdquo;</p>
                <p className="flex items-center gap-2 text-[0.8125rem]">
                  <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${display.classes.bg}`} />
                  <span className={`font-semibold ${display.classes.text}`}>{getVerdictCopy(c.verdict, lang).label}</span>
                  <span aria-hidden="true" className="text-ink-muted">·</span>
                  <time dateTime={new Date(c.at).toISOString()} className="text-ink-muted">
                    {copy.relativeTime(Math.max(0, now - c.at))}
                  </time>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
