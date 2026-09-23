import { ChartIcon, GridIcon, HomeIcon, PersonIcon } from "@/components/icons";

/**
 * Desktop rail destinations. `match` decides which primary destination owns
 * related routes. Document has its own rail entry and mobile tab, so it does
 * not also highlight Check.
 */
export const NAV_TABS = [
  {
    href: "/app",
    key: "check",
    Icon: HomeIcon,
    match: (p: string) =>
      p === "/app" ||
      p.startsWith("/result") ||
      p.startsWith("/replay") ||
      p.startsWith("/safepay") ||
      p.startsWith("/conversation") ||
      p.startsWith("/sandbox") ||
      p.startsWith("/network") ||
      p.startsWith("/batch"),
  },
  { href: "/learn", key: "learn", Icon: GridIcon, match: (p: string) => p.startsWith("/learn") },
  { href: "/trends", key: "trends", Icon: ChartIcon, match: (p: string) => p.startsWith("/trends") },
  { href: "/settings", key: "settings", Icon: PersonIcon, match: (p: string) => p.startsWith("/settings") },
] as const;

/**
 * Where the tab bar's centre button goes. `?new=1` tells the Check screen to
 * open the input ready to type (components/CheckForm.tsx), so the button is a
 * real shortcut rather than a second link to the same screen.
 */
export const NEW_CHECK_HREF = "/app?new=1";
