import type { Copy } from "@/lib/i18n";
import { SCAM_STAGES, type AnalyzeResponse } from "@/lib/types";

/** The scale is a taxonomy, not evidence that every earlier step occurred.
 * DEMO: compare the current-stage marker with the next-stage playbook reasons. */
export default function ScamJourney({ response, copy }: { response: Pick<AnalyzeResponse, "journey">; copy: Copy }) {
  const journey = response.journey;
  if (!journey || !SCAM_STAGES.includes(journey.currentStage)) return null;
  const c = copy.result.journey;
  return (
    <section className="border-t border-card-border px-5 py-6" aria-label={c.title}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="micro text-ink-soft">{c.title}</h2>
        <span className="font-mono text-xs text-ink-muted">{String(SCAM_STAGES.indexOf(journey.currentStage) + 1).padStart(2, "0")} / 09</span>
      </div>
      <ol className="relative ml-2 border-l border-card-border">
        {SCAM_STAGES.map((stage) => {
          const current = stage === journey.currentStage;
          return <li key={stage} aria-current={current ? "step" : undefined} className={`relative py-2 pl-6 ${current ? "text-accent-ink" : "text-ink-muted"}`}>
            <span aria-hidden="true" className={`absolute -left-[4.5px] top-[15px] size-2 ${current ? "bg-accent-deep ring-4 ring-accent-soft" : "border border-line-strong bg-card"}`} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`text-sm ${current ? "font-semibold" : ""}`}>{c.labels[stage]}</span>
              {current && <span className="bg-accent-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-wider">{c.youAreHere}</span>}
            </div>
          </li>;
        })}
      </ol>
      <p className="mt-4 text-xs leading-relaxed text-ink-soft">{c.caveat}</p>
      {journey.likelyNextStages.length > 0 && <div className="mt-6">
        <h3 className="micro mb-3 text-ink-soft">{c.whatNextTitle}</h3>
        <ul className="space-y-4">{journey.likelyNextStages.map((next, index) => <li key={`${next.stage}-${index}`} className="border-l-2 border-caution pl-3">
          <p className="text-sm font-semibold text-ink">{c.labels[next.stage]}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{next.reason}</p>
        </li>)}</ul>
      </div>}
    </section>
  );
}
