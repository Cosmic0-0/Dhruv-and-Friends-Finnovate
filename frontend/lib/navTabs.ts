import { BookIcon, SearchIcon, TrendIcon } from "@/components/icons";

/** Shared between TabBar (mobile bottom bar) and DesktopNav (header row) so the two never drift apart. */
export const NAV_TABS = [
  {
    href: "/",
    key: "check",
    Icon: SearchIcon,
    match: (p: string) => p === "/" || p.startsWith("/result") || p.startsWith("/safepay") || p.startsWith("/conversation") || p.startsWith("/sandbox") || p.startsWith("/network"),
  },
  { href: "/learn", key: "learn", Icon: BookIcon, match: (p: string) => p.startsWith("/learn") },
  { href: "/trends", key: "trends", Icon: TrendIcon, match: (p: string) => p.startsWith("/trends") },
] as const;
