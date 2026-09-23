"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "./LanguageProvider";

/** Workspace navigation keeps the guided tools discoverable on small screens. */
export default function IntelligenceNav() {
  const path = usePathname();
  const { lang } = useLanguage();
  if (path.startsWith("/learn") || path.startsWith("/trends")) return null;
  const labels = lang === "fr" ? ["Message", "Conversation", "Simulation"] : ["Message", "Conversation", "Sandbox"];
  const routes = ["/", "/conversation", "/sandbox"];
  return <nav aria-label={lang === "fr" ? "Outils d'analyse" : "Analysis tools"} className="gutter flex gap-5 overflow-x-auto border-t border-white/10">
    {routes.map((href, index) => {
      const active = href === "/" ? path === "/" || path.startsWith("/result") || path.startsWith("/network") : path.startsWith(href);
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`whitespace-nowrap border-b-2 py-3 text-xs transition-colors ${active ? "border-accent text-on-ink" : "border-transparent text-on-ink/55 hover:text-on-ink"}`}>{labels[index]}</Link>;
    })}
  </nav>;
}
