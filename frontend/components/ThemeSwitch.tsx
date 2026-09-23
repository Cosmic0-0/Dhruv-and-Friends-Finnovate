"use client";

import { useEffect, useState } from "react";
import { applyTheme, loadTheme, saveTheme, type ThemeChoice } from "@/lib/theme";
import { useLanguage } from "./LanguageProvider";

/**
 * Appearance control on Settings: System / Light / Dark, in the same iOS
 * segmented style as the language switch.
 *
 * "System" is the default and the design's intent (DESIGN.md is
 * prefers-color-scheme first); the other two exist so a demo cannot be
 * surprised by whatever the device happens to be set to.
 */
export default function ThemeSwitch() {
  const { copy } = useLanguage();
  const t = copy.settings.theme;
  // null until mounted: the saved choice is not known during server render.
  const [choice, setChoice] = useState<ThemeChoice | null>(null);

  useEffect(() => setChoice(loadTheme()), []);

  // Following the device means tracking it while the screen is open.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme("system");
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [choice]);

  const options: { id: ThemeChoice; label: string }[] = [
    { id: "system", label: t.system },
    { id: "light", label: t.light },
    { id: "dark", label: t.dark },
  ];

  const pick = (next: ThemeChoice) => {
    setChoice(next);
    saveTheme(next);
    applyTheme(next);
  };

  return (
    <div role="radiogroup" aria-label={t.title} className="flex w-full gap-0.5 rounded-[11px] bg-page p-0.5">
      {options.map((o) => {
        const active = choice === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(o.id)}
            className={`pressable min-h-11 flex-1 rounded-[9px] text-[0.9375rem] font-semibold ${
              active ? "bg-card text-ink shadow-[0_1px_3px_rgb(0_0_0_/_12%)]" : "text-ink-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
