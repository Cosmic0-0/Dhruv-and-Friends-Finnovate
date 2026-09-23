import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import type { AnalyzeResponse } from "@/lib/types";
import { FlagIcon, LinkIcon, SearchIcon, ShieldIcon } from "../icons";

/**
 * Persistent contextual actions for a non-safe result. In flow (not sticky)
 * below md: TabBar already owns a fixed bar at the physical bottom of the
 * screen there, and stacking two bottom bars — or sticking this one to
 * bottom:0 without knowing about --tabbar-height — would put it behind
 * TabBar. Sticky to the bottom of the viewport at md+ only, where nothing
 * else claims that slot (--tabbar-height resets to 0 at that breakpoint, see
 * globals.css). "View connections" only appears when ScamDNA actually found
 * a campaign match — never a fabricated link.
 */
export default function ActionDock({
  response,
  hasReportSection,
  copy,
}: {
  response: Pick<AnalyzeResponse, "scamDna">;
  hasReportSection: boolean;
  copy: Copy;
}) {
  const matched = response.scamDna?.matchStrength === "matched";

  return (
    <nav
      aria-label={copy.result.whatToDoTitle}
      className="z-10 grid grid-cols-2 border border-card-border bg-card md:sticky md:bottom-0 md:grid-cols-4"
    >
      <Link
        href="/safepay"
        className="pressable flex min-h-14 items-center justify-center gap-2 px-3 text-center text-sm font-semibold text-ink not-first:border-t not-first:border-card-border hover:bg-muted-surface md:border-t-0 md:not-first:border-t-0 md:not-first:border-l"
      >
        <ShieldIcon className="size-4 shrink-0 text-accent-ink" strokeWidth={2} />
        {copy.home.payCta}
      </Link>
      <Link
        href="/replay"
        className="pressable flex min-h-14 items-center justify-center gap-2 border-t border-card-border px-3 text-center text-sm font-semibold text-ink hover:bg-muted-surface md:border-t-0 md:border-l"
      >
        <SearchIcon className="size-4 shrink-0 text-accent-ink" strokeWidth={2} />
        {copy.replay.openReplay}
      </Link>
      {matched && response.scamDna && (
        <Link
          href={`/network/${encodeURIComponent(response.scamDna.fingerprintId)}`}
          className="pressable flex min-h-14 items-center justify-center gap-2 border-t border-card-border px-3 text-center text-sm font-semibold text-ink hover:bg-muted-surface md:border-t-0 md:border-l"
        >
          <LinkIcon className="size-4 shrink-0 text-accent-ink" strokeWidth={2} />
          {copy.result.networkLink}
        </Link>
      )}
      {hasReportSection && (
        <a
          href="#report-section"
          className="pressable flex min-h-14 items-center justify-center gap-2 border-t border-card-border px-3 text-center text-sm font-semibold text-danger-ink hover:bg-danger-soft md:border-t-0 md:border-l"
        >
          <FlagIcon className="size-4 shrink-0" strokeWidth={2} />
          {copy.result.report.reportMessage}
        </a>
      )}
    </nav>
  );
}
