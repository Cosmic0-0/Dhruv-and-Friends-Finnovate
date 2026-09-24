"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI_LANGUAGES } from "@/lib/i18n";
import { applyTheme, loadTheme, saveTheme } from "@/lib/theme";
import { dcCopy } from "./dc/content";
import { useLanguage } from "./LanguageProvider";

/** Desktop top bar, from Nav.dc.html. Below 64rem the tab bar is the navigation. */
const PRIMARY = [
  { id: "check", href: "/app", match: (p: string) => p === "/app" || p.startsWith("/result") || p.startsWith("/replay") || p.startsWith("/network") },
  { id: "learn", href: "/learn", match: (p: string) => p.startsWith("/learn") },
  { id: "radar", href: "/trends", match: (p: string) => p.startsWith("/trends") },
] as const;
const TOOLS = [
  { id: "pay", href: "/safepay" },
  { id: "doc", href: "/document" },
  { id: "batch", href: "/batch" },
  { id: "convo", href: "/conversation" },
] as const;

const linkStyle = (on: boolean): CSSProperties =>
  on
    ? { fontSize: 14, padding: "8px 14px", borderRadius: 999, background: "var(--dc-ink)", color: "var(--dc-surface)", whiteSpace: "nowrap" }
    : { fontSize: 14, padding: "8px 12px", borderRadius: 999, color: "var(--dc-text2)", whiteSpace: "nowrap" };

export default function TopNav() {
  const pathname = usePathname() ?? "/";
  const { lang, setLang } = useLanguage();
  const t = dcCopy(lang).nav;
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const c = loadTheme();
    setTheme(c === "light" ? "light" : c === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
  }, []);

  // The landing page carries its own header (Landing.dc.html).
  if (pathname === "/") return null;

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  };
  const reportOn = pathname.startsWith("/report");
  const settingsOn = pathname.startsWith("/settings");

  return (
    <header className="dc-topnav" data-screen-label="Top bar">
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 48px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Link href="/" aria-label={t.home} style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--dc-ink)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={28} height={28} style={{ width: 28, height: 28, borderRadius: 8, display: "block" }} />
            <span style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.035em" }}>FraudLens</span>
          </Link>
          <nav aria-label="Sections" style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {PRIMARY.map((l) => {
              const on = l.match(pathname);
              return (
                <Link key={l.id} href={l.href} className={on ? undefined : "dc-navlink"} aria-current={on ? "page" : undefined} style={linkStyle(on)}>
                  {t[l.id]}
                </Link>
              );
            })}
            <span className="dc-tools" aria-hidden="true" style={{ width: 1, height: 18, background: "var(--dc-line-strong)", margin: "0 10px" }} />
            <span className="dc-tools" style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {TOOLS.map((l) => {
                const on = pathname.startsWith(l.href);
                return (
                  <Link key={l.id} href={l.href} className={on ? undefined : "dc-navlink"} aria-current={on ? "page" : undefined} style={linkStyle(on)}>
                    {t[l.id]}
                  </Link>
                );
              })}
            </span>
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, whiteSpace: "nowrap", flexShrink: 0 }}>
          <div role="radiogroup" aria-label={t.language} className="dc-mono" style={{ display: "flex", gap: 2, fontSize: 12 }}>
            {UI_LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={lang === l.id}
                onClick={() => setLang(l.id)}
                style={{ padding: "4px 8px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: lang === l.id ? "var(--dc-ink)" : "var(--dc-text4)" }}
              >
                {l.id === "kreol" ? "KR" : l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t.theme}
            style={{ width: 36, height: 36, borderRadius: 999, border: "1px solid var(--dc-line-strong)", background: "transparent", color: "var(--dc-ink)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <Link href="/report" className="report-pill" aria-current={reportOn ? "page" : undefined}>
            <span className="report-pill-dot" aria-hidden="true" />
            {t.report}
          </Link>
          <Link href="/settings" className={settingsOn ? undefined : "dc-navlink"} aria-current={settingsOn ? "page" : undefined} style={linkStyle(settingsOn)}>
            {t.settings}
          </Link>
        </div>
      </div>
    </header>
  );
}
