"use client";

import { useLanguage } from "./LanguageProvider";

export default function TrendsContent() {
  const { copy } = useLanguage();
  return (
    <>
      <section className="flex flex-col gap-3 pt-2">
        <h1>{copy.trends.title}</h1>
        <p className="text-[1.0625rem] leading-relaxed text-ink-soft">{copy.trends.intro}</p>
      </section>

      <ol className="flex flex-col gap-3">
        {copy.trends.categories.map((c, i) => (
          <li key={c.title} className="card flex flex-col gap-2">
            <div className="flex items-baseline gap-3">
              <span
                aria-hidden="true"
                className="shrink-0 font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-muted"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="font-sans text-[1.0625rem] leading-snug font-semibold text-ink">{c.title}</h2>
            </div>
            <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{c.body}</p>
            <p className="rounded-card bg-muted-surface px-4 py-3 text-[0.875rem] leading-relaxed text-ink-soft">
              {c.example}
            </p>
          </li>
        ))}
      </ol>

      <p className="px-1 text-[0.8125rem] leading-snug text-ink-muted">{copy.trends.footerNote}</p>
    </>
  );
}
