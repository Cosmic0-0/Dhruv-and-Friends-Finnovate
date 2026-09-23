import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import type { AnalyzeResponse } from "@/lib/types";
import { ChevronRightIcon, FlagIcon, LinkIcon, SearchIcon, ShieldIcon } from "../icons";

/**
 * Where to go next from a flagged result, as a list card in the same row style
 * as Recent and Tools.
 *
 * It used to be a sticky bar, which only made sense while the tab bar was
 * hidden at desktop widths. The floating tab bar is now present at every width
 * and owns the bottom of the screen, so a second bar down there would either
 * stack or overlap; in flow, it reads as what it is — a short list of next
 * steps.
 *
 * "View connections" only appears when ScamDNA actually matched a campaign,
 * never as a fabricated link.
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

  const rows: { href: string; Icon: typeof ShieldIcon; label: string; danger?: boolean }[] = [
    { href: "/safepay", Icon: ShieldIcon, label: copy.home.payCta },
    { href: "/replay", Icon: SearchIcon, label: copy.replay.openReplay },
  ];
  if (matched && response.scamDna) {
    rows.push({
      href: `/network/${encodeURIComponent(response.scamDna.fingerprintId)}`,
      Icon: LinkIcon,
      label: copy.result.networkLink,
    });
  }
  if (hasReportSection) {
    rows.push({ href: "#report-section", Icon: FlagIcon, label: copy.result.report.reportMessage, danger: true });
  }

  return (
    <nav aria-label={copy.result.whatToDoTitle} className="sheet">
      <ul className="flex flex-col px-5 [&>li+li]:border-t [&>li+li]:border-card-border">
        {rows.map(({ href, Icon, label, danger }) => (
          <li key={href}>
            <Link href={href} className="pressable flex min-h-[52px] items-center gap-3 py-3">
              <span
                className={`flex size-[34px] shrink-0 items-center justify-center rounded-full ${
                  danger ? "bg-danger-soft text-danger-ink" : "bg-muted-surface text-ink"
                }`}
              >
                <Icon className="size-[17px]" strokeWidth={2} />
              </span>
              <span className={`flex-1 text-[1.0625rem] ${danger ? "text-danger-ink" : "text-ink"}`}>{label}</span>
              <ChevronRightIcon className="size-[18px] shrink-0 text-icon-idle" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
