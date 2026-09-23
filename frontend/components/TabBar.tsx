"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS } from "@/lib/navTabs";
import { useLanguage } from "./LanguageProvider";

/**
 * The floating glass tab bar: Check, Learn, Radar, Settings.
 *
 * Labelled, not icons only. The mockup drew bare glyphs, but a house, a grid,
 * a chart and a person tell a first-time user nothing about which screen is
 * which, and that was the thing that made the app unlearnable on first open.
 * iOS tab bars carry labels for exactly this reason; the few pixels it costs
 * are worth more than the restraint.
 *
 * There is no centre "+" any more. It opened the same field the hero's
 * "Paste & check" already opens, so it was a fourth route to one action.
 *
 * Shown below lg only; the SideNav rail is the navigation above that.
 */
export default function TabBar() {
  const pathname = usePathname() ?? "/";
  const { copy } = useLanguage();

  // The landing page (/) is full-bleed and carries its own navigation.
  if (pathname === "/") return null;

  return (
    <nav
      aria-label="Main"
      // lg:hidden — the SideNav rail is the navigation at desktop widths.
      className="tabbar fixed left-1/2 z-30 flex h-[72px] w-[330px] max-w-[calc(100%-2rem)] -translate-x-1/2 items-stretch justify-between px-2 lg:hidden"
      style={{ bottom: "calc(24px + env(safe-area-inset-bottom))" }}
    >
      {NAV_TABS.map(({ href, key, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`pressable flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-2xl ${
              active ? "text-ink" : "text-icon-idle"
            }`}
          >
            <Icon className="size-[23px]" strokeWidth={active ? 2.3 : 1.8} />
            <span className={`text-[0.6875rem] leading-none ${active ? "font-semibold" : "font-medium"}`}>
              {copy.tabs[key]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
