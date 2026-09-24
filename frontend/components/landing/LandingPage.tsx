"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { card, MONO } from "@/components/dc";
import { useLanguage } from "@/components/LanguageProvider";
import { applyTheme, loadTheme, saveTheme } from "@/lib/theme";
import { REPO_URL } from "@/lib/team";
import { content } from "./content";
import s from "./landing.module.css";

/**
 * The landing page, implemented 1:1 from Landing.dc.html. It has its own
 * header (the app's top bar steps aside on "/"). The "You receive / FraudLens
 * shows you" block is a static, labelled example of a check, not a live result.
 */

const hl: CSSProperties = { background: "var(--dc-red-hl)", borderRadius: 4, padding: "1px 3px" };
const section = (maxWidth: number, padding: string): CSSProperties => ({ maxWidth, width: "100%", margin: "0 auto", padding });
const pill = (h: number, pad: number, ink: boolean, size: number): CSSProperties => ({
  height: h, padding: `0 ${pad}px`, borderRadius: 999, fontSize: size, display: "flex", alignItems: "center", whiteSpace: "nowrap",
  ...(ink ? { background: "var(--dc-ink)", color: "var(--dc-surface)", fontWeight: 500 } : { color: "var(--dc-ink)" }),
});

export default function LandingPage() {
  const { lang } = useLanguage();
  const t = content(lang);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const c = loadTheme();
    setTheme(c === "light" || (c === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches) ? "light" : "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  };

  return (
    <div data-screen-label="Landing" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--dc-bar)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
        <div className={s.headerInner} style={{ maxWidth: 1280, margin: "0 auto", padding: "0 48px", height: 72, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            <Link href="/" aria-label={t.header.home} className="dc-link" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="" width={28} height={28} style={{ width: 28, height: 28, borderRadius: 8, display: "block" }} />
              <span className={s.wordmark} style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.03em" }}>FraudLens</span>
            </Link>
            <nav aria-label={t.header.nav} className={s.nav} style={{ display: "flex", gap: 22, fontSize: 14, whiteSpace: "nowrap" }}>
              <a href="#how" className={s.navLink} style={{ color: "var(--dc-text2)" }}>{t.header.how}</a>
              <Link href="/app" className={s.navLink} style={{ color: "var(--dc-text2)" }}>{t.header.tools}</Link>
              <Link href="/learn" className={s.navLink} style={{ color: "var(--dc-text2)" }}>{t.header.learn}</Link>
              <Link href="/trends" className={s.navLink} style={{ color: "var(--dc-text2)" }}>{t.header.radar}</Link>
              <Link href="/created-by" className={s.navLink} style={{ color: "var(--dc-text2)" }}>{t.header.createdBy}</Link>
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={t.header.theme}
              style={{ width: 40, height: 40, borderRadius: 999, border: "1px solid var(--dc-line-strong)", background: "transparent", color: "var(--dc-ink)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <Link href="/extension#outlook" className={`dc-pill ${s.hideMd}`} style={pill(42, 18, false, 14)}>{t.header.getOutlook}</Link>
            <a href="#extension" className={`dc-pill ${s.hideSm}`} style={pill(42, 18, false, 14)}>{t.header.getExtension}</a>
            <Link href="/app" className="dc-pill dc-pill-ink" style={pill(42, 20, true, 14)}>{t.header.check}</Link>
          </div>
        </div>
      </header>

      <main style={{ display: "flex", flexDirection: "column" }}>
        <section className={`${s.section} ${s.hero}`} style={{ ...section(1280, "96px 48px 72px"), display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 28 }}>
          <span className={s.badge} style={{ fontSize: 13, padding: "8px 14px", borderRadius: 999, background: "var(--dc-surface)", border: "1px solid var(--dc-line)", color: "var(--dc-text2)", display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dc-green-dot)", flexShrink: 0 }} />
            {t.hero.badge}
          </span>
          <h1 className={s.heroTitle} style={{ margin: 0, fontSize: 96, lineHeight: 0.95, fontWeight: 600, letterSpacing: "-0.05em", maxWidth: 1000, textWrap: "balance" }}>{t.hero.title}</h1>
          <p style={{ margin: 0, fontSize: 20, lineHeight: 1.5, color: "var(--dc-text2)", maxWidth: 600, textWrap: "pretty" }}>{t.hero.lede}</p>
          <div className={s.heroCtas} style={{ display: "flex", gap: 12, paddingTop: 8 }}>
            <Link href="/app" className="dc-pill dc-pill-ink" style={pill(56, 30, true, 16)}>{t.hero.primary}</Link>
            <a href="#extension" className="dc-pill" style={{ ...pill(56, 30, false, 16), border: "1px solid var(--dc-line-strong)" }}>{t.hero.secondary}</a>
          </div>
        </section>

        <section className={s.section} aria-label={t.demo.label} style={section(1180, "0 48px 120px")}>
          <div data-fx className={s.demo} style={{ ...card(40), boxShadow: "var(--dc-shadow-lg)", padding: 48, display: "grid", gridTemplateColumns: "minmax(0,1fr) 56px minmax(0,1.15fr)", gap: 24, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.demo.receive}</span>
              <div style={{ background: "var(--dc-bg)", borderRadius: 28, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--dc-line-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "var(--dc-text2)", flexShrink: 0 }}>M</span>
                  <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>MCB-INFO</span>
                  <span style={{ fontSize: 12, color: "var(--dc-text3)", marginLeft: "auto" }}>{t.demo.channel}</span>
                </div>
                <div lang="mfe" style={{ background: "var(--dc-bubble)", borderRadius: "6px 22px 22px 22px", padding: "16px 18px", fontSize: 18, lineHeight: 1.55, overflowWrap: "anywhere" }}>
                  Ou kont MCB <span style={hl}>pou bloke zordi</span>. <span style={hl}>Konfirm ou OTP</span> lor{" "}
                  <span style={{ ...hl, fontFamily: MONO, fontSize: 15 }}>mcb-secure.top/verify</span>
                </div>
              </div>
            </div>
            <div aria-hidden="true" className={s.arrow} style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--dc-accent)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>→</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.demo.shows}</span>
              <div style={{ border: "1px solid var(--dc-line)", borderRadius: 28, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 16, background: "var(--dc-red-hl)", color: "var(--dc-red)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700 }}>!</span>
                  <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.045em", color: "var(--dc-red)", lineHeight: 1 }}>{t.demo.verdict}</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--dc-text3)" }}>{t.demo.confidence}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {t.demo.reasons.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: "1px solid var(--dc-line2)", fontSize: 15, lineHeight: 1.45 }}>
                      <span aria-hidden="true" style={{ color: "var(--dc-red)" }}>●</span>
                      {r.length === 3 ? (
                        <span>
                          <span style={{ fontFamily: MONO, fontSize: 14 }}>{r[0]}</span>
                          {r[1]}
                          <span style={{ fontFamily: MONO, fontSize: 14 }}>{r[2]}</span>
                        </span>
                      ) : (
                        <span>{r[0]}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ background: "var(--dc-ink)", color: "var(--dc-surface)", borderRadius: 18, padding: "16px 18px", fontSize: 15, fontWeight: 500, lineHeight: 1.45 }}>{t.demo.action}</div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className={s.section} style={{ ...section(1280, "0 48px 120px"), display: "flex", flexDirection: "column", gap: 48, scrollMarginTop: 96 }}>
          <h2 className={s.h2} style={{ margin: 0, fontSize: 56, lineHeight: 1, fontWeight: 600, letterSpacing: "-0.045em", maxWidth: 760 }}>{t.how.title}</h2>
          <div className={s.cards} style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20 }}>
            {t.how.cards.map((c) => (
              <div key={c.n} data-fx style={{ ...card(32), padding: 32, display: "flex", flexDirection: "column", gap: 14, minHeight: 260 }}>
                <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-accent)" }}>{c.n}</span>
                <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.15 }}>{c.title}</span>
                <span style={{ fontSize: 15, lineHeight: 1.6, color: "var(--dc-text2)" }}>{c.body}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="extension" className={s.section} style={{ ...section(1280, "0 48px 120px"), scrollMarginTop: 96 }}>
          <div data-fx className={s.ext} style={{ background: "var(--dc-accent)", color: "#FFFFFF", borderRadius: 40, padding: 64, display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 48, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <h2 className={s.h2} style={{ margin: 0, fontSize: 52, lineHeight: 1, fontWeight: 600, letterSpacing: "-0.045em" }}>{t.extension.title}</h2>
              <p style={{ margin: 0, fontSize: 18, lineHeight: 1.55, opacity: 0.85, maxWidth: 460 }}>{t.extension.body}</p>
              <div className={s.extCtas} style={{ display: "flex", gap: 10, paddingTop: 10 }}>
                <Link href="/extension#chrome" className="dc-pill" style={{ ...pill(52, 24, false, 15), background: "#FFFFFF", color: "#0B0B0F", fontWeight: 500 }}>{t.extension.chrome}</Link>
                <Link href="/extension#other-browsers" className="dc-pill" style={{ ...pill(52, 24, false, 15), border: "1px solid rgba(255,255,255,0.5)", color: "#FFFFFF" }}>{t.extension.other}</Link>
                <Link href="/extension#outlook" className="dc-pill" style={{ ...pill(52, 24, false, 15), border: "1px solid rgba(255,255,255,0.5)", color: "#FFFFFF" }}>{t.header.getOutlook}</Link>
              </div>
            </div>
            <div aria-hidden="true" style={{ background: "rgba(255,255,255,0.12)", borderRadius: 28, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "#FFFFFF", color: "#0B0B0F", borderRadius: 18, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ width: 36, height: 36, borderRadius: 12, background: "#FFE4E2", color: "#D92D2A", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>!</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{t.extension.badLink}</span>
                  <span style={{ fontSize: 13, color: "#55565E", fontFamily: MONO }}>mcb-secure.top</span>
                </div>
              </div>
              <div style={{ background: "#FFFFFF", color: "#0B0B0F", borderRadius: 18, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ width: 36, height: 36, borderRadius: 12, background: "#DDF7E9", color: "#0A8A4E", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>✓</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{t.extension.official}</span>
                  <span style={{ fontSize: 13, color: "#55565E", fontFamily: MONO }}>mauritiuspost.mu</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

/** The design's footer; also used by /extension and /privacy. */
export function LandingFooter() {
  const { lang } = useLanguage();
  const f = content(lang).footer;
  return (
    <footer style={{ borderTop: "1px solid var(--dc-line)", position: "relative", zIndex: 1 }}>
      <div className={s.footerInner} style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 48px", display: "flex", justifyContent: "space-between", gap: 24, fontSize: 14, color: "var(--dc-text3)", flexWrap: "wrap" }}>
        <span>
          {f.built}
          <Link href="/created-by" className="dc-link">{f.team}</Link>
        </span>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Link href="/privacy" className="dc-link" style={{ color: "var(--dc-text3)" }}>{f.privacy}</Link>
          <Link href="/report" className="dc-link" style={{ color: "var(--dc-text3)" }}>{f.report}</Link>
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" className="dc-link" style={{ color: "var(--dc-text3)" }}>{f.contact}</a>
        </div>
      </div>
    </footer>
  );
}
