/**
 * The counts behind the Check screen's "This week" card.
 *
 * Its own module, importing only a TYPE from ./storage, so it can be unit
 * tested: storage.ts itself pulls in runtime values from ./learn-content and
 * ./streak, which node --test cannot resolve without file extensions. A
 * type-only import is erased, so this file has no runtime dependencies at all.
 */
import type { RecentCheck } from "./storage";

export interface WeekStats {
  total: number;
  scam: number;
  suspicious: number;
  safe: number;
}

/**
 * Seven days in ms. A rolling window, not a calendar week: "this week" here
 * means "the last seven days", which is what a count of recent checks means to
 * someone opening the app on a Wednesday.
 */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Summarise the checks from the last seven days. Pure: it takes the list and
 * the clock, so the screen can render it and a test can pin it.
 *
 * Returns zeroed counts when the window is empty; the card that uses this
 * hides itself on total === 0 rather than showing a row of noughts.
 */
export function weekStats(checks: readonly RecentCheck[], now: number): WeekStats {
  const since = now - WEEK_MS;
  const stats: WeekStats = { total: 0, scam: 0, suspicious: 0, safe: 0 };
  for (const c of checks) {
    // Guard the clock as well as the data: a check timestamped in the future
    // (device clock moved) would otherwise sit in every window for ever.
    if (!Number.isFinite(c.at) || c.at <= since || c.at > now) continue;
    stats.total += 1;
    stats[c.verdict] += 1;
  }
  return stats;
}
