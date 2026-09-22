"use client";

import { useLanguage } from "./LanguageProvider";

export default function TrendsContent() {
  const { copy } = useLanguage();
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h1>{copy.trends.title}</h1>
        <p className="max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink-soft">{copy.trends.intro}</p>
      </section>

      <ol className="sheet">
        {copy.trends.categories.map((c, i) => (
          <li key={c.title} className="flex gap-3.5 px-4 py-4">
            <span aria-hidden="true" className="data shrink-0 pt-0.5 font-medium text-accent-ink">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 className="font-sans text-[1.0625rem] leading-snug font-semibold text-ink">{c.title}</h2>
              <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{c.body}</p>
              {/* A verbatim scam sample — monospaced and rule-marked so it's
                  clearly quoted evidence, not the app talking. */}
              <p className="data mt-1 border-l-2 border-l-card-border bg-muted-surface px-3 py-2.5 leading-relaxed text-ink-soft">
                {c.example}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-[0.8125rem] leading-snug text-ink-muted">{copy.trends.footerNote}</p>
    </div>
  );
}
