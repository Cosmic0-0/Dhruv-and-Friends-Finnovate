"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI_LANGUAGES } from "@/lib/i18n";
import { applyTheme, loadTheme, saveTheme } from "@/lib/theme";
import { BrandMark } from "./landing/Art";
import { dcCopy } from "./dc/content";
import { useLanguage } from "./LanguageProvider";

/**
 * Desktop top bar: every check and page one click away, in the order people
 * reach for them. Settings is the gear, the team badge links to Created by.
 * Below 64rem the tab bar is the navigation.
 */
const NAV = [
  { id: "check", href: "/app", match: (p: string) => p === "/app" || p.startsWith("/result") || p.startsWith("/replay") || p.startsWith("/network") },
  { id: "pay", href: "/safepay", match: (p: string) => p.startsWith("/safepay") },
  { id: "doc", href: "/document", match: (p: string) => p.startsWith("/document") },
  { id: "convo", href: "/conversation", match: (p: string) => p.startsWith("/conversation") },
  { id: "batch", href: "/batch", match: (p: string) => p.startsWith("/batch") },
  { id: "radar", href: "/trends", match: (p: string) => p.startsWith("/trends") },
  { id: "learn", href: "/learn", match: (p: string) => p.startsWith("/learn") },
  { id: "sandbox", href: "/sandbox", match: (p: string) => p.startsWith("/sandbox") },
] as const;
const LANG_LABEL: Record<string, string> = { en: "EN", fr: "FR", kreol: "Kreol" };

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export default function TopNav() {
  const pathname = usePathname() ?? "/";
  const { lang, setLang } = useLanguage();
  const t = dcCopy(lang).nav;
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const c = loadTheme();
    setTheme(c === "light" ? "light" : c === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
  }, []);

  // The landing page carries its own header.
  if (pathname === "/") return null;

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  };
  const reportOn = pathname.startsWith("/report");
  const settingsOn = pathname.startsWith("/settings");
  const teamOn = pathname.startsWith("/created-by");

  return (
    <header className="bt-topnav" data-screen-label="Top bar">
      <div className="bt-topnav-inner">
        <div className="bt-lockup">
          <Link href="/" aria-label={t.home} className="bt-brand">
            <BrandMark className="bt-brand-mark" />
            <span className="bt-brand-word">FraudLens</span>
          </Link>
          <Link href="/created-by" className="bt-team" aria-label={t.createdBy} title="Dhruv & Friends" aria-current={teamOn ? "page" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/dhruv-and-friends.png" alt="" width={32} height={32} />
          </Link>
        </div>

        <nav aria-label="Sections" className="bt-nav">
          {NAV.map((l) => {
            const on = l.match(pathname);
            return (
              <Link key={l.id} href={l.href} className="bt-navpill" aria-current={on ? "page" : undefined}>
                {t[l.id]}
              </Link>
            );
          })}
        </nav>

        <div className="bt-actions">
          <div role="radiogroup" aria-label={t.language} className="bt-langs">
            {UI_LANGUAGES.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} onClick={() => setLang(l.id)}>
                {LANG_LABEL[l.id] ?? l.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={toggleTheme} aria-label={t.theme} className="bt-iconbtn bt-theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <Link href="/settings" aria-label={t.settings} title={t.settings} className="bt-iconbtn" aria-current={settingsOn ? "page" : undefined}>
            <GearIcon />
          </Link>
          <Link href="/report" className="report-pill" aria-current={reportOn ? "page" : undefined}>
            <span className="report-pill-dot" aria-hidden="true" />
            {t.report}
          </Link>
        </div>
      </div>
    </header>
  );
}
