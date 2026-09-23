"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS, NEW_CHECK_HREF } from "@/lib/navTabs";
import { PlusIcon } from "./icons";
import { useLanguage } from "./LanguageProvider";

/**
 * The floating frosted tab bar (frontend/design/mockup/Main.html): a 326x66
 * btn, 28px above the bottom plus the home-indicator inset, with five slots —
 * Check, Learn, a 56px centre primary button, Radar, Settings.
 *
 * Shown at every width. The design is an iPhone app, so there is no separate
 * desktop navigation; a browser window gets the same 430px column (see
 * .app-shell in globals.css).
 *
 * The bar is icons only, as drawn. Each slot carries its label as an
 * accessible name instead, and every target is at least 44px.
 */
export default function TabBar() {
  const pathname = usePathname() ?? "/";
  const { copy } = useLanguage();

  const slot = ({ href, key, Icon, match }: (typeof NAV_TABS)[number]) => {
    const active = match(pathname);
    return (
      <Link
        key={href}
        href={href}
        aria-label={copy.tabs[key]}
        aria-current={active ? "page" : undefined}
        className={`pressable flex size-[50px] items-center justify-center rounded-full ${
          active ? "text-brand" : "text-icon-idle"
        }`}
      >
        <Icon className="size-[26px]" strokeWidth={active ? 2.3 : 1.7} />
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      // lg:hidden — the SideNav rail is the navigation at desktop widths.
      className="tabbar fixed left-1/2 z-30 flex h-[66px] w-[326px] max-w-[calc(100%-2rem)] -translate-x-1/2 items-center justify-between px-3 lg:hidden"
      style={{ bottom: "calc(28px + env(safe-area-inset-bottom))" }}
    >
      {NAV_TABS.slice(0, 2).map(slot)}

      {/* Not a tab: a shortcut into Check with the input already open. */}
      <Link
        href={NEW_CHECK_HREF}
        aria-label={copy.tabs.newCheck}
        className="pressable flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_8px_22px_rgb(36_27_122_/_45%)]"
      >
        <PlusIcon className="size-[26px]" />
      </Link>

      {NAV_TABS.slice(2).map(slot)}
    </nav>
  );
}
