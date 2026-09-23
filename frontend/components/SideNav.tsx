"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS, NEW_CHECK_HREF } from "@/lib/navTabs";
import { BookIcon, DocumentIcon, LayersIcon, PlusIcon, SearchIcon, ShieldIcon } from "./icons";
import { useLanguage } from "./LanguageProvider";

/**
 * Desktop navigation rail. Hidden below md, where the floating tab bar is the
 * navigation (and the design is a phone app).
 *
 * It exists because the phone layout, centred in a browser window, gives a
 * visitor no idea the app has more than one screen: the tab bar is a 326px
 * btn at the bottom of a 1440px window, and everything it leads to is a tap
 * away rather than in view. This rail says what is in the app without changing
 * a single phone pixel.
 *
 * The primary destinations use NAV_TABS. Document and the other specialised
 * checks sit below a divider; each route has one active destination.
 */
export default function SideNav() {
  const pathname = usePathname() ?? "/";
  const { copy } = useLanguage();

  // The landing page (/) is full-bleed and carries its own navigation.
  if (pathname === "/") return null;

  const tools = [
    { href: "/safepay", Icon: ShieldIcon, label: copy.home.payCta },
    { href: "/document", Icon: DocumentIcon, label: copy.tools.document },
    { href: "/batch", Icon: LayersIcon, label: copy.tools.batch },
    { href: "/conversation", Icon: SearchIcon, label: copy.tools.conversation },
    { href: "/sandbox", Icon: BookIcon, label: copy.tools.sandbox },
  ];

  return (
    <nav
      aria-label="Sections"
      // Its own surface against the page, with a hairline edge: the standard
      // desktop-app chrome, and it keeps the rail from floating in the
      // background colour the cards also sit on.
      className="verification-sidenav sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 border-r border-card-border bg-card px-4 py-8 lg:flex"
      style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-2.5 px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/dhruv-and-friends.png"
          alt={copy.settings.teamLogoAlt}
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-full bg-white"
        />
        <span className="text-[1.0625rem] font-semibold text-ink">FraudLens</span>
      </div>

      <Link href={NEW_CHECK_HREF} className="btn pressable mx-1 px-4 text-[0.9375rem] bg-primary text-on-primary">
        <PlusIcon className="size-[19px]" />
        {copy.tabs.newCheck}
      </Link>

      <ul className="flex flex-col gap-0.5">
        {NAV_TABS.map(({ href, key, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`pressable flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[1.0625rem] ${
                  active ? "bg-muted-surface font-semibold text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Icon className="size-[22px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                {copy.tabs[key]}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-0.5 border-t border-card-border pt-4">
        {tools.map(({ href, Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`pressable flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[0.9375rem] ${
                active ? "bg-muted-surface font-semibold text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
