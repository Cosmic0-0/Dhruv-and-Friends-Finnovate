import type { Copy } from "@/lib/i18n";
import { signalKind, sortSignals } from "@/lib/result";
import type { AnalyzeResponse, Severity } from "@/lib/types";
import { getRiskDisplay, getVerdictDisplay } from "@/lib/verdict";
import { LinkChainIcon, WarningIcon } from "../icons";

/**
 * The dark result hero (design/mockup/Result-Scam.png, Result-Genuine.png):
 * the verdict pill, the risk score, and a row of supporting stats.
 *
 * It has two shapes, because the backend does not always send a score:
 *  - with riskScore: the big number and "/ 100", as drawn.
 *  - without: the verdict pill and the explanation line, no number at all.
 * getRiskDisplay() is the only thing that decides which — a score is never
 * derived here from the signals, because a made-up number is worse than none.
 *
 * The stat row follows the same rule. "Warning signs" is always safe to show
 * (it counts signals[]), but "Link made" only appears when a lookalike signal
 * actually carried domainAgeDays.
 */

/** The pill's dot colour. Text on the pill stays ink, so the dot is the only hue. */
const DOT: Record<Severity | "safe", string> = {
  high: "bg-danger",
  medium: "bg-caution",
  low: "bg-caution",
  safe: "bg-safe",
};

function heroDot(verdict: AnalyzeResponse["verdict"]): string {
  if (verdict === "safe") return DOT.safe;
  return verdict === "scam" ? DOT.high : DOT.medium;
}

/** The age of the flagged link, when a lookalike signal actually reported one. */
export function linkAgeDays(response: AnalyzeResponse): number | undefined {
  for (const s of sortSignals(response.signals)) {
    if (signalKind(s.type) !== "lookalike_url") continue;
    const d = s.domainAgeDays;
    if (typeof d === "number" && Number.isFinite(d) && d >= 0) return Math.floor(d);
  }
  return undefined;
}

export default function ResultHero({
  response,
  label,
  copy,
}: {
  response: AnalyzeResponse;
  label: string;
  copy: Copy;
}) {
  const risk = getRiskDisplay(response);
  const h = copy.result.hero;
  const ageDays = linkAgeDays(response);
  const display = getVerdictDisplay(response.verdict);

  return (
    <section className="hero flex flex-col gap-3 px-[22px] pt-[22px] pb-5" aria-labelledby="verdict-label">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.9375rem] font-semibold text-white/70">
          {risk.showScore ? h.riskScore : copy.result.title}
        </span>
        <span
          id="verdict-label"
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1 text-[0.8125rem] font-semibold text-[#1C1C1E]"
        >
          <span aria-hidden="true" className={`size-[7px] rounded-full ${heroDot(response.verdict)}`} />
          {label}
        </span>
      </div>

      {risk.showScore ? (
        <p className="mt-0.5 flex items-baseline gap-1.5 text-white">
          <span className="data text-[3.125rem] leading-none font-bold tracking-[-0.02em]">{risk.score}</span>
          <span className="text-[1.25rem] font-medium text-white/50">{h.outOf}</span>
        </p>
      ) : (
        // No score returned: the headline carries the verdict instead of a number.
        <p className="text-[1.0625rem] leading-[1.4375rem] text-white/[0.72]">{display.headline}</p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-3">
        <Stat
          Icon={WarningIcon}
          label={h.warningSignsLabel}
          value={h.signsFound(response.signals.length)}
        />
        {ageDays !== undefined && (
          <Stat Icon={LinkChainIcon} label={h.linkMadeLabel} value={h.daysAgo(ageDays)} />
        )}
      </div>
    </section>
  );
}

function Stat({
  Icon,
  label,
  value,
}: {
  Icon: typeof WarningIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
        <Icon className="size-[17px]" strokeWidth={2} />
      </span>
      <span className="flex flex-col">
        <span className="text-[0.8125rem] text-white/[0.62]">{label}</span>
        <span className="data text-[0.9375rem] font-semibold text-white">{value}</span>
      </span>
    </div>
  );
}
