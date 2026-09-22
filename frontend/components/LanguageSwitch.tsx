"use client";

import { useLanguage } from "./LanguageProvider";
import { UI_LANGUAGES } from "@/lib/i18n";

/** EN / FR / KREOL segmented control. Sets UI copy and the /api/analyze language hint. */
export default function LanguageSwitch() {
  const { lang, setLang, copy } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={copy.languageSwitcher}
      className="flex items-center rounded-pill border border-card-border bg-card p-1 shadow-card"
    >
      {UI_LANGUAGES.map((l) => {
        const active = l.id === lang;
        return (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={active}
            lang={l.htmlLang}
            onClick={() => setLang(l.id)}
            className={`rounded-pill px-3 py-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] transition-colors ${
              active ? "bg-ink text-on-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
