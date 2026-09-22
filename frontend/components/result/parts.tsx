import { Fragment } from "react";
import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import { highlightSegments, type EvidenceMark } from "@/lib/highlight";
import type { AnalyzeResponse, Verdict } from "@/lib/types";
import { getRiskDisplay, getVerdictBandIndex, getVerdictDisplay, VERDICT_BANDS } from "@/lib/verdict";
import { ChevronLeftIcon } from "../icons";

/** Small uppercase section label used across the result screen. */
export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="micro text-ink-muted">
      {children}
    </h2>
  );
}

/** Matches the home screen's instrument band so the two screens read as one tool. */
export function ResultHeader({ copy, sender }: { copy: Copy; sender?: string }) {
  return (
    <header className="bg-ink text-on-ink pt-[env(safe-area-inset-top)]">
      <div className="gutter flex items-center gap-3 py-3">
        <Link
          href="/"
          aria-label={copy.result.back}
          className="pressable -ml-2 grid size-10 shrink-0 place-items-center text-on-ink hover:bg-white/10"
        >
          <ChevronLeftIcon className="size-5" strokeWidth={2} />
        </Link>
        <p className="micro min-w-0 truncate text-on-ink/60">
          {copy.result.title}
          {sender && <span className="text-on-ink/40"> · {copy.result.fromSender(sender)}</span>}
        </p>
      </div>
    </header>
  );
}

export function VerdictBanner({
  response,
  label,
  copy,
}: {
  response: AnalyzeResponse;
  label: string;
  copy: Copy;
}) {
  const display = getVerdictDisplay(response.verdict);
  const bandIndex = getVerdictBandIndex(response.verdict);
  // Only a backend-supplied riskScore is ever shown; none is derived here.
  const risk = getRiskDisplay(response);
  return (
    <section className={`px-5 py-6 text-white ${display.classes.bg}`} aria-labelledby="verdict-label">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="micro text-white/60">{copy.result.title}</p>
          <h1 id="verdict-label" className="mt-2.5 text-[2.5rem] leading-none text-white">
            {label}
          </h1>
          <p className="data mt-2.5 text-white/75">{copy.result.warningSigns(response.signals.length)}</p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-8 shrink-0 text-white/80"
        >
          {display.icon.paths.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>

      <SeverityGauge bandIndex={bandIndex} />

      {risk.showScore && (
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-white/20 pt-3">
          <p className="micro text-white/60">{copy.result.risk(risk.score)}</p>
          <p className="data text-[1rem] font-medium text-white">{risk.score}</p>
        </div>
      )}

      {response.verdict === "scam" && (
        <p className="mt-4 border-t border-white/20 pt-4 text-[0.9375rem] leading-snug text-white">
          {copy.result.scamAdvice}
        </p>
      )}
    </section>
  );
}

/**
 * The mockup's "Risk system": a three-band scale (safe / suspicious / scam)
 * instead of a stoplight or a bare percentage. Severity is encoded twice —
 * position (which slot) and shape (the reached band is taller) — so it reads
 * before the label does, and still reads without colour.
 *
 * Reinforcement only: the verdict is already announced in text above, so this
 * is aria-hidden rather than a second, redundant announcement.
 */
function SeverityGauge({ bandIndex }: { bandIndex: number }) {
  return (
    <div aria-hidden="true" className="mt-5 flex items-end gap-1">
      {VERDICT_BANDS.map((band, i) => {
        const reached = i <= bandIndex;
        const current = i === bandIndex;
        return (
          <div
            key={band}
            className={`flex-1 ${current ? "h-2.5" : "h-1"} ${reached ? "bg-white" : "bg-white/25"}`}
          />
        );
      })}
    </div>
  );
}

const MARK_TONE: Record<Exclude<Verdict, "safe">, string> = {
  scam: "bg-danger-soft decoration-danger",
  suspicious: "bg-caution-soft decoration-caution-bright",
};

/**
 * The user's ORIGINAL text, with signal evidence highlighted. highlightSegments
 * only splits the text (never alters it), and unmatched evidence is ignored.
 */
export function MessageCard({
  text,
  marks,
  verdict,
  copy,
}: {
  text: string;
  marks: EvidenceMark[];
  verdict: Verdict;
  copy: Copy;
}) {
  const segments = verdict === "safe" ? [{ text }] : highlightSegments(text, marks);
  const tone = verdict === "safe" ? "" : MARK_TONE[verdict];
  return (
    <section className="flex flex-col gap-2.5 px-5 py-5" aria-labelledby="message-label">
      <SectionLabel id="message-label">{copy.result.messageYouSent}</SectionLabel>
      <p className="text-[1rem] leading-relaxed whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        {segments.map((s, i) =>
          s.severity ? (
            // 3px is an inline text-highlight radius, not a surface — intentionally
            // outside the sharp-corner rule that applies to every real surface.
            <mark
              key={i}
              className={`rounded-[3px] px-0.5 text-ink underline decoration-2 underline-offset-[3px] [box-decoration-break:clone] ${tone}`}
            >
              {s.text}
            </mark>
          ) : (
            <Fragment key={i}>{s.text}</Fragment>
          ),
        )}
      </p>
    </section>
  );
}

export function SentPanel({ redacted, copy }: { redacted: string; copy: Copy }) {
  return (
    <details className="group border border-card-border bg-card">
      <summary className="micro pressable flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-ink-muted hover:text-ink">
        {copy.result.sentTitle}
        <span aria-hidden="true" className="text-[0.875rem] group-open:hidden">
          +
        </span>
        <span aria-hidden="true" className="hidden text-[0.875rem] group-open:inline">
          −
        </span>
      </summary>
      <div className="border-t border-card-border px-4 py-3.5">
        <p className="text-sm text-ink-muted">{copy.result.sentBody}</p>
        <p className="data mt-3 bg-muted-surface px-3 py-2.5 whitespace-pre-wrap text-ink-soft [overflow-wrap:anywhere]">
          {redacted}
        </p>
      </div>
    </details>
  );
}

export function CheckAnotherButton({ copy }: { copy: Copy }) {
  return (
    <Link
      href="/"
      className="pressable font-heading flex min-h-14 items-center justify-center bg-ink px-5 text-[1.0625rem] font-semibold tracking-[0.06em] text-on-ink uppercase hover:bg-ink-2"
    >
      {copy.result.checkAnother}
    </Link>
  );
}
