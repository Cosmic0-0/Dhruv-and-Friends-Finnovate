"use client";

import type { Copy } from "@/lib/i18n";
import { CheckIcon } from "../icons";

/**
 * Shown only before the first check.
 *
 * Without it a new user lands on a dashboard of empty cards ("Practice 0/5",
 * "Your checks will show here") with nothing saying what the app is for, which
 * is exactly the state that reads as confusing rather than empty. Once there
 * is any history this is replaced by the real cards, so it costs a returning
 * user nothing.
 */
export default function IntroCard({ copy }: { copy: Copy }) {
  const c = copy.check.intro;
  return (
    <section className="card flex flex-col gap-3" aria-labelledby="intro-title">
      <h2 id="intro-title" className="micro text-ink-muted">
        {c.title}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {c.points.map((point) => (
          <li key={point} className="flex items-start gap-2.5">
            <CheckIcon className="mt-1 size-4 shrink-0 text-ink-muted" strokeWidth={2.5} />
            <span className="text-[1.0625rem] leading-[1.4375rem] text-ink-soft">{point}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
