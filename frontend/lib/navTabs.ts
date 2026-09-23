import { ChartIcon, GridIcon, HomeIcon, PersonIcon } from "@/components/icons";

/**
 * The five slots of the floating tab bar (frontend/design/mockup/Main.html):
 * Check, Learn, a centre primary button, Radar, Settings. The centre button is
 * not a tab — it opens Check with the input ready — so it lives in TabBar
 * itself; this list is the four real destinations, in bar order.
 *
 * `match` decides which tab is current. Check owns every screen reached from a
 * check (result, replay, safepay, conversation, network, batch, sandbox,
 * document), so a
 * user is never left with no tab lit.
 */
export const NAV_TABS = [
  {
    href: "/",
    key: "check",
    Icon: HomeIcon,
    match: (p: string) =>
      p === "/" ||
      p.startsWith("/result") ||
      p.startsWith("/replay") ||
      p.startsWith("/safepay") ||
      p.startsWith("/conversation") ||
      p.startsWith("/sandbox") ||
      p.startsWith("/network") ||
      p.startsWith("/batch") ||
      p.startsWith("/document"),
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
export const NEW_CHECK_HREF = "/?new=1";
