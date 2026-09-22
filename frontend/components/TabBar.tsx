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
      className="fixed inset-x-0 bottom-0 z-20 border-t border-card-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-app items-stretch justify-around px-4">
        {TABS.map(({ href, key, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-(--tabbar-height) flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold tracking-wide ${
                  active ? "text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.1 : 1.75} />
                {copy.tabs[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
