"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookIcon, ChartIcon, DocumentIcon, HomeIcon, LayersIcon, PersonIcon, SearchIcon, ShieldIcon } from "./icons";
import { useLanguage } from "./LanguageProvider";

export default function TabBar() {
  const pathname = usePathname() ?? "/";
  const { copy, lang } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);
  if (pathname === "/") return null;

  const destinations = [
    { href: "/app", label: copy.tabs.check, fullLabel: copy.tabs.check, Icon: HomeIcon, active: pathname === "/app" || pathname.startsWith("/result") },
    { href: "/document", label: lang === "kreol" ? "Dokiman" : "Document", fullLabel: copy.tools.document, Icon: DocumentIcon, active: pathname.startsWith("/document") },
    { href: "/learn", label: copy.tabs.learn, fullLabel: copy.tabs.learn, Icon: BookIcon, active: pathname.startsWith("/learn") },
  ];
  const other = [
    { href: "/trends", label: copy.tabs.trends, Icon: ChartIcon },
    { href: "/safepay", label: copy.home.payCta, Icon: ShieldIcon },
    { href: "/batch", label: copy.tools.batch, Icon: LayersIcon },
    { href: "/conversation", label: copy.tools.conversation, Icon: SearchIcon },
    { href: "/sandbox", label: copy.tools.sandbox, Icon: BookIcon },
    { href: "/settings", label: copy.tabs.settings, Icon: PersonIcon },
  ];

  return (
    <>
      {moreOpen && (
        <div className="mobile-more" id="mobile-more-menu">
          <p className="mobile-more-title">FraudLens</p>
          {other.map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={() => setMoreOpen(false)} aria-current={pathname.startsWith(href) ? "page" : undefined}>
              <Icon className="size-5" />{label}
            </Link>
          ))}
          <Link href="/" onClick={() => setMoreOpen(false)}>{lang === "fr" ? "À propos de FraudLens" : lang === "kreol" ? "Lor FraudLens" : "About FraudLens"}</Link>
        </div>
      )}
      <nav aria-label="Main" className="verification-tabbar lg:hidden">
        {destinations.map(({ href, label, fullLabel, Icon, active }) => (
          <Link key={href} href={href} aria-label={fullLabel} aria-current={active ? "page" : undefined} onClick={() => setMoreOpen(false)}>
            <Icon className="size-5" strokeWidth={active ? 2.3 : 1.8} /><span>{label}</span>
          </Link>
        ))}
        <button type="button" aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={() => setMoreOpen((open) => !open)}>
          <span className="mobile-more-dots" aria-hidden="true">···</span><span>{lang === "fr" ? "Plus" : lang === "kreol" ? "Plis" : "More"}</span>
        </button>
      </nav>
    </>
  );
}
