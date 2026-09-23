"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS } from "@/lib/navTabs";
import { useLanguage } from "./LanguageProvider";

/**
 * Header-integrated nav for desktop widths. TabBar's fixed bottom bar is a
 * mobile/PWA convention (home-indicator-safe, thumb-reachable) that reads as
 * a phone app bolted onto a browser window once there's a real desktop
 * viewport — so it's hidden at md+ (see TabBar.tsx) in favour of this
 * inline row in AppHeader instead. Same NAV_TABS, same active-route logic,
 * just a different shape for a different input device.
 */
export default function DesktopNav() {
  const pathname = usePathname() ?? "/";
  const { copy } = useLanguage();

  return (
    <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
      {NAV_TABS.map(({ href, key, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`micro pressable relative py-1 ${active ? "text-on-ink" : "text-on-ink/55 hover:text-on-ink"}`}
          >
            {copy.tabs[key]}
            {active && <span aria-hidden="true" className="absolute inset-x-0 -bottom-2 h-0.5 bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}
