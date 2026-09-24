"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import "lenis/dist/lenis.css";
import { useLanguage } from "@/components/LanguageProvider";
import { REPO_URL } from "@/lib/team";
import { content } from "./content";
import { Hero, LandingHeader, Preloader } from "./LandingHero";
import { Engine, Outro, Products, ScanScene } from "./LandingSections";
import { useLandingMotion } from "./useLandingMotion";
import s from "./landing.module.css";

const INTRO_KEY = "fraudlens.intro.v1";

/**
 * The landing page: a scroll story that ends in the three ways to use
 * FraudLens (web app, browser extension, Outlook add-in). The hero's message
 * box is a real entry point (it hands the text to /app); the SMS scene is a
 * labelled static example, not a live result.
 */
export default function LandingPage() {
  const { lang } = useLanguage();
  const t = content(lang);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useLandingMotion(rootRef, headerRef);

  // The preloader plays once per browser session.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(INTRO_KEY)) rootRef.current?.setAttribute("data-intro", "skip");
      else window.sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // Storage blocked: the intro just plays.
    }
  }, []);

  return (
    <div ref={rootRef} className={`${s.root} fl-landing-root`} data-screen-label="Landing">
      <Preloader />
      <LandingHeader t={t.header} headerRef={headerRef} />
      <main className="fl-landing">
        <Hero t={t.hero} />
        <ScanScene t={t.scan} />
        <Engine t={t.engine} />
        <Products t={t.products} />
        <Outro t={t.outro} />
      </main>
      <LandingFooter />
    </div>
  );
}

export function LandingFooter() {
  const { lang } = useLanguage();
  const f = content(lang).footer;
  return (
    <footer className={`${s.footer} fl-landing-footer`}>
      <div className={s.footerInner}>
        <span className={s.footerBrand}>
          <Link href="/created-by" className={s.footerLogo} aria-label={f.team}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/dhruv-and-friends.png" alt="" width={44} height={44} />
          </Link>
          <span>
            {f.built}
            <Link href="/created-by" className={s.teamLink}>{f.team}</Link>
          </span>
        </span>
        <div className={s.footerLinks}>
          <Link href="/privacy" className={s.pill}><span>{f.privacy}</span></Link>
          <Link href="/report" className={s.pill}><span>{f.report}</span></Link>
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" className={s.pill}><span>{f.contact}</span></a>
        </div>
      </div>
    </footer>
  );
}
