"use client";

import { useLanguage } from "./LanguageProvider";
import { UI_LANGUAGES } from "@/lib/i18n";

/**
 * EN / FR / KREOL as an iOS segmented control. Sets the UI copy and the
 * `language` hint sent to /api/analyze.
 *
 * It lives on the Settings screen now rather than in a header, so switching
 * language no longer competes for space on every screen — but it still changes
 * every screen, which is the point of the control.
 */
export default function LanguageSwitch() {
  const { lang, setLang, copy } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={copy.languageSwitcher}
      className="flex w-full gap-0.5 rounded-[11px] bg-page p-0.5"
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
            className={`pressable min-h-11 flex-1 rounded-[9px] text-[0.9375rem] font-semibold ${
              active
                ? "bg-card text-ink shadow-[0_1px_3px_rgb(0_0_0_/_12%)]"
                : "text-ink-muted"
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
