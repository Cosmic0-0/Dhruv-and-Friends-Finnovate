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
      className="flex items-center divide-x divide-white/15 border border-white/20"
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
            // 40px min hit area: the visible chip is short, so height comes
            // from padding rather than a cramped 24px tap target.
            className={`micro pressable min-h-10 px-3 ${
              active ? "bg-accent text-white" : "text-on-ink/55 hover:bg-white/10 hover:text-on-ink"
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
