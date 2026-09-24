"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI_LANGUAGES } from "@/lib/i18n";
import { applyTheme, loadTheme, saveTheme } from "@/lib/theme";
import { BrandMark } from "./landing/Art";
import { dcCopy } from "./dc/content";
import { useLanguage } from "./LanguageProvider";

/**
 * Desktop top bar: Check, Scam trends and Learn, the rest behind More.
 * Below 64rem the tab bar is the navigation.
 */
const PRIMARY = [
  { id: "check", href: "/app", match: (p: string) => p === "/app" || p.startsWith("/result") || p.startsWith("/replay") || p.startsWith("/network") },
  { id: "radar", href: "/trends", match: (p: string) => p.startsWith("/trends") },
  { id: "learn", href: "/learn", match: (p: string) => p.startsWith("/learn") },
] as const;
// Every other check lives on the Check page too; the menu is the shortcut.
const MORE = [
  { id: "pay", href: "/safepay" },
  { id: "doc", href: "/document" },
  { id: "convo", href: "/conversation" },
  { id: "batch", href: "/batch" },
  { id: "sandbox", href: "/sandbox" },
  { id: "settings", href: "/settings" },
  { id: "createdBy", href: "/created-by" },
] as const;
const LANG_LABEL: Record<string, string> = { en: "EN", fr: "FR", kreol: "Kreol" };

export default function TopNav() {
  const pathname = usePathname() ?? "/";
  const { lang, setLang } = useLanguage();
  const t = dcCopy(lang).nav;
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = loadTheme();
    setTheme(c === "light" ? "light" : c === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
  }, []);

  useEffect(() => setMoreOpen(false), [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [moreOpen]);

  // The landing page carries its own header.
  if (pathname === "/") return null;

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  };
  const reportOn = pathname.startsWith("/report");
  const moreOn = MORE.some((m) => pathname.startsWith(m.href));

  return (
    <header className="bt-topnav" data-screen-label="Top bar">
      <div className="bt-topnav-inner">
        <Link href="/" aria-label={t.home} className="bt-brand">
          <BrandMark className="bt-brand-mark" />
          <span>FraudLens</span>
        </Link>

        <nav aria-label="Sections" className="bt-nav">
          {PRIMARY.map((l) => {
            const on = l.match(pathname);
            return (
              <Link key={l.id} href={l.href} className="bt-navpill" aria-current={on ? "page" : undefined}>
                {t[l.id]}
              </Link>
            );
          })}
          <div ref={moreRef} className="bt-more">
            <button type="button" className="bt-navpill" aria-expanded={moreOpen} aria-haspopup="true" data-on={moreOn || undefined} onClick={() => setMoreOpen((o) => !o)}>
              {t.more} <span aria-hidden="true">{moreOpen ? "−" : "+"}</span>
            </button>
            {moreOpen && (
              <div className="bt-more-menu" role="menu">
                {MORE.map((m) => (
                  <Link key={m.id} href={m.href} role="menuitem" aria-current={pathname.startsWith(m.href) ? "page" : undefined}>
                    {t[m.id]}
                    <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="bt-actions">
          <div role="radiogroup" aria-label={t.language} className="bt-langs">
            {UI_LANGUAGES.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} onClick={() => setLang(l.id)}>
                {LANG_LABEL[l.id] ?? l.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={toggleTheme} aria-label={t.theme} className="bt-iconbtn">
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <Link href="/report" className="report-pill" aria-current={reportOn ? "page" : undefined}>
            <span className="report-pill-dot" aria-hidden="true" />
            {t.report}
          </Link>
        </div>
      </div>
    </header>
  );
}
