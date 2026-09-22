"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "./LanguageProvider";
import { BookIcon, SearchIcon, TrendIcon } from "./icons";

const TABS = [
  { href: "/", key: "check", Icon: SearchIcon, match: (p: string) => p === "/" || p.startsWith("/result") },
  { href: "/learn", key: "learn", Icon: BookIcon, match: (p: string) => p.startsWith("/learn") },
  { href: "/trends", key: "trends", Icon: TrendIcon, match: (p: string) => p.startsWith("/trends") },
] as const;

export default function TabBar() {
  const pathname = usePathname() ?? "/";
  const { copy } = useLanguage();

  return (
    <nav
      aria-label="Main"
      // Fully opaque (no /95, no backdrop-blur): a translucent bar let scrolled
      // content read through it. The strong top rule is the design system's.
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line-strong bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-app items-stretch">
        {TABS.map(({ href, key, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                // The active tab is marked by a rule at the top edge, the way a
                // selected tab is marked on an instrument, not by colour alone.
                className={`pressable micro relative flex h-(--tabbar-height) flex-col items-center justify-center gap-1.5 ${
                  active ? "text-ink" : "text-ink-muted hover:bg-muted-surface hover:text-ink"
                }`}
              >
                {active && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
                <Icon className="size-5" strokeWidth={active ? 2.1 : 1.75} />
                {copy.tabs[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
