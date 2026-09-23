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
  const { copy, lang } = useLanguage();
  return (
    <section aria-label={copy.home.tagline} className="hero-instrument relative isolate flex flex-col gap-5 overflow-hidden bg-ink px-6 py-7 text-on-ink md:px-8 md:py-8">
      <p className="micro relative text-on-ink/60">{lang === "fr" ? "Analyse des messages / Maurice" : "Message intelligence / Mauritius"}</p>
      <h1 className="relative max-w-[18ch] font-heading text-[2.5rem] font-semibold leading-[1.06] tracking-tight text-on-ink md:text-[3rem]">{copy.home.tagline}</h1>
      <p className="relative max-w-[58ch] text-[0.9375rem] leading-relaxed text-on-ink/75">{copy.home.pitch}</p>

      <div className="relative flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <a href="#check-message" className="pressable font-heading flex min-h-12 items-center justify-center bg-on-ink px-5 text-[0.9375rem] font-semibold tracking-[0.04em] text-ink uppercase hover:bg-white">{copy.submit}<span aria-hidden="true" className="ml-4">↗</span></a>
        <Link
          href="/safepay"
          className="pressable font-heading flex min-h-12 items-center justify-center border border-on-ink/30 px-5 text-[0.9375rem] font-semibold tracking-[0.04em] text-on-ink uppercase hover:bg-white/10"
        >
          {copy.home.payCta}
        </Link>
        </div>
        <p className="text-[0.75rem] text-on-ink/55">{copy.home.payCtaSub}</p>
      </div>
      <ul className="grid gap-2 border-t border-on-ink/15 pt-5">
        {copy.home.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 relative text-[0.8125rem] leading-relaxed text-on-ink/75">
            <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-on-ink/70" strokeWidth={2.5} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
