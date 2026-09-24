"use client";

import { useState, type CSSProperties, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { checkCopy } from "@/components/check/content";
import { savePendingCheck } from "@/lib/handoff";
import { UI_LANGUAGES } from "@/lib/i18n";
import { MAX_MESSAGE_LENGTH } from "@/lib/types";
import { ArrowIcon, BrandMark, Scanner } from "./Art";
import type { Content } from "./content";
import s from "./landing.module.css";

const LANG_LABEL: Record<string, string> = { en: "EN", fr: "FR", kreol: "Kreol" };

/** The once-per-session intro: the mark over a scan line. Pure CSS; hidden for reduced motion. */
export function Preloader() {
  return (
    <div className={s.preloader} aria-hidden="true">
      <BrandMark className={s.preloaderMark} />
      <span className={s.preloaderBar}><span /></span>
    </div>
  );
}

export function LandingHeader({ t, headerRef }: { t: Content["header"]; headerRef: RefObject<HTMLElement | null> }) {
  const { lang, setLang } = useLanguage();
  return (
    <header ref={headerRef} className={s.header} data-tone="butter">
      <Link href="/" aria-label={t.home} className={s.brand}>
        <BrandMark className={s.brandMark} />
        <span className={s.brandWord}>FraudLens</span>
      </Link>
      <nav aria-label={t.nav} className={s.navPills}>
        <a href="#webapp" className={s.pill}><span>{t.webapp}</span></a>
        <a href="#extension" className={s.pill}><span>{t.extension}</span></a>
        <a href="#outlook" className={s.pill}><span>{t.outlook}</span></a>
        <Link href="/trends" className={s.pill}><span>{t.trends}</span></Link>
      </nav>
      <div className={s.headerRight}>
        <div role="radiogroup" aria-label={t.language} className={s.langs}>
          {UI_LANGUAGES.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} className={s.lang} onClick={() => setLang(l.id)}>
              {LANG_LABEL[l.id] ?? l.label}
            </button>
          ))}
        </div>
        <Link href="/app" className={`${s.pill} ${s.pillSolid}`}><span>{t.cta}</span></Link>
      </div>
    </header>
  );
}

/** Butter hero: the headline, a real message box that hands off to /app, and the scanner. */
export function Hero({ t }: { t: Content["hero"] }) {
  const router = useRouter();
  const { lang } = useLanguage();
  const [text, setText] = useState("");

  const go = (message: string) => {
    const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!trimmed) return;
    savePendingCheck(trimmed);
    router.push("/app");
  };

  return (
    <section data-hero data-tone="butter" className={`${s.hero} ${s.butter}`} aria-labelledby="fl-hero-title">
      <div data-hero-scanner className={s.heroScanner}>
        <Scanner sweepClassName={s.sweep} />
      </div>

      <p className={`${s.kicker} ${s.fadeUp}`}>
        <span className={s.kickerDot} aria-hidden="true" />
        {t.kicker}
      </p>

      <div className={s.heroMain}>
        <h1 id="fl-hero-title" data-hero-word className={s.heroTitle}>
          {t.titleLines.map((line, i) => (
            <span key={line} className={s.clipLine}>
              <span className={s.rise} style={{ "--i": i } as CSSProperties}>{line}</span>
            </span>
          ))}
        </h1>
        <p className={`${s.heroLede} ${s.fadeUp}`}>{t.lede}</p>

        <form
          data-checker
          className={`${s.checker} ${s.fadeUp}`}
          onSubmit={(e) => {
            e.preventDefault();
            go(text);
          }}
        >
          <div className={s.checkBar}>
            <span className={s.prompt} aria-hidden="true">&gt;_</span>
            <textarea
              className={s.checkInput}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  go(text);
                }
              }}
              placeholder={t.placeholder}
              aria-label={t.inputLabel}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={1}
            />
            <button type="submit" className={s.checkGo} disabled={!text.trim()}>
              {t.check}
              <ArrowIcon />
            </button>
          </div>
          <div className={s.checkMeta}>
            <button type="button" className={s.sample} onClick={() => go(checkCopy(lang).example)}>
              {t.sample} →
            </button>
            <span className={s.privacyNote}>{t.privacy}</span>
          </div>
        </form>
      </div>

      <ul className={`${s.facts} ${s.fadeUp}`}>
        {t.facts.map((f, i) => (
          <li key={f}>
            <span className={s.factN}>0{i + 1}</span>
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}
