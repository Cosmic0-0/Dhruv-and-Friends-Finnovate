"use client";

import { useLanguage } from "./LanguageProvider";
import LanguageSwitch from "./LanguageSwitch";
import ScreenTitle from "./ScreenTitle";

/**
 * Settings: the language switch, a short privacy note, and an about section
 * carrying the team logo.
 *
 * A client component because every string here is a nested `copy.settings.*`
 * key, which the server-render-friendly <T> helper cannot reach (T only covers
 * top-level, string-typed Copy keys).
 */
export default function SettingsScreen() {
  const { copy } = useLanguage();
  const s = copy.settings;

  return (
    <>
      <ScreenTitle title={s.title} />

      <div className="gutter flex flex-col gap-4 pt-4">
        <section className="card flex flex-col gap-3" aria-labelledby="set-lang">
          <h2 id="set-lang" className="micro text-ink-muted">
            {s.languageTitle}
          </h2>
          <LanguageSwitch />
          <p className="text-[0.9375rem] leading-5 text-ink-muted">{s.languageNote}</p>
        </section>

        <section className="card flex flex-col gap-2" aria-labelledby="set-privacy">
          <h2 id="set-privacy" className="micro text-ink-muted">
            {s.privacyTitle}
          </h2>
          <p className="text-[1.0625rem] leading-[1.4375rem] text-ink">{s.privacyBody}</p>
        </section>

        <section className="card flex flex-col items-start gap-3" aria-labelledby="set-about">
          <h2 id="set-about" className="micro text-ink-muted">
            {s.aboutTitle}
          </h2>
          <p className="text-[1.0625rem] leading-[1.4375rem] text-ink">{s.aboutBody}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/dhruv-and-friends.png"
            alt={s.teamLogoAlt}
            width={72}
            height={72}
            className="mt-1 size-18 rounded-full bg-white shadow-[0_1px_6px_rgb(0_0_0_/_12%)]"
          />
        </section>
      </div>
    </>
  );
}
