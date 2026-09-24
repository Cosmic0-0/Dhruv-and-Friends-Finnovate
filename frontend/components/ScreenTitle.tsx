"use client";

import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import { ChevronLeftIcon } from "./icons";
import { useLanguage } from "./LanguageProvider";

/**
 * The large title every screen opens with (frontend/design/mockup/*.html):
 * 34/41 bold, the team logo on the right, an optional back row above and an
 * optional subtitle below.
 *
 * Replaces the old dark instrument band plus its two nav rows
 * (AppHeader/DesktopNav/IntelligenceNav) — navigation is the floating tab bar
 * now, so a screen header carries nothing but the screen's own identity.
 *
 * A client component so it can read the current language itself: pass
 * `tabKey` for a screen whose name is already a tab label, or `title` for one
 * that isn't.
 */
export default function ScreenTitle({
  title,
  tabKey,
  subtitle,
  back,
}: {
  title?: string;
  tabKey?: keyof Copy["tabs"];
  subtitle?: string;
  back?: { href: string; label: string };
}) {
  const { copy } = useLanguage();
  const heading = title ?? (tabKey ? copy.tabs[tabKey] : "");

  return (
    <header
      className="gutter flex flex-col gap-0.5"
      // Without a back row the title sits lower, as drawn: there is no row
      // above it to fill that space.
      style={{ paddingTop: back ? "calc(12px + env(safe-area-inset-top))" : "calc(60px + env(safe-area-inset-top))" }}
    >
      {back && (
        <Link href={back.href} className="pressable -ml-1.5 flex h-11 items-center gap-0.5 text-[1.0625rem] text-ink">
          <ChevronLeftIcon className="size-6" strokeWidth={2.2} />
          {back.label}
        </Link>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1>{heading}</h1>
        {/* The brand mark returns to the homepage. Desktop uses the rail mark. */}
        <Link href="/" aria-label="FraudLens home" className="shrink-0 rounded-full lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/dhruv-and-friends.png"
            alt=""
            width={44}
            height={44}
            className="size-11 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0_/_10%)]"
          />
        </Link>
      </div>
      {subtitle && <p className="text-[0.9375rem] leading-5 text-ink-muted">{subtitle}</p>}
    </header>
  );
}
