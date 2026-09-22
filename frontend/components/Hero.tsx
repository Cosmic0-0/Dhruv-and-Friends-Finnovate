"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";
import { CheckIcon } from "./icons";

/**
 * Landing-page positioning, above the existing Check form. A client
 * component (like CheckForm/RecentChecks) since it needs the nested
 * `copy.home.*` strings that the server-render-friendly <T> helper doesn't
 * reach (T only covers top-level, string-typed Copy keys).
 *
 * DEMO NOTE: this is the "judge understands the differentiator in 10
 * seconds" surface (root CLAUDE.md) — the dual entry point below (Check a
 * message vs. I'm about to pay) is what a judge sees before touching
 * anything.
 */
export default function Hero() {
  const { copy } = useLanguage();
  return (
    <section className="flex flex-col gap-4 border-b border-card-border pb-6">
      <p className="micro text-accent-ink">{copy.home.tagline}</p>
      <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-soft">{copy.home.pitch}</p>
      <ul className="flex flex-col gap-1.5">
        {copy.home.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-ink-soft">
            <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={2.5} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5">
        <Link
          href="/safepay"
          className="pressable font-heading flex min-h-12 items-center justify-center border border-ink px-5 text-[0.9375rem] font-semibold tracking-[0.04em] text-ink uppercase hover:bg-muted-surface"
        >
          {copy.home.payCta}
        </Link>
        <p className="text-center text-[0.75rem] text-ink-muted">{copy.home.payCtaSub}</p>
      </div>
    </section>
  );
}
