import { Fragment } from "react";
import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import { highlightSegments, type EvidenceMark } from "@/lib/highlight";
import type { AnalyzeResponse, Verdict } from "@/lib/types";
import { getRiskDisplay, getVerdictDisplay } from "@/lib/verdict";
import { ChevronLeftIcon } from "../icons";

/** Small uppercase section label used across the result screen. */
export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-muted uppercase">
      {children}
    </h2>
  );
}

export function ResultHeader({ copy, sender }: { copy: Copy; sender?: string }) {
  return (
    <header className="flex items-center gap-3">
      <Link
        href="/"
        aria-label={copy.result.back}
        className="grid size-10 shrink-0 place-items-center rounded-full border border-card-border bg-card text-ink"
      >
        <ChevronLeftIcon className="size-5" strokeWidth={2} />
      </Link>
      <p className="min-w-0 truncate text-[0.9375rem] font-semibold text-ink">
        {copy.result.title}
        {sender && <span className="font-normal text-ink-muted"> · {copy.result.fromSender(sender)}</span>}
      </p>
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
  // Only a backend-supplied riskScore is ever shown; none is derived here.
  const risk = getRiskDisplay(response);
  return (
    <section className={`rounded-card px-6 py-7 text-white ${display.classes.bg}`} aria-labelledby="verdict-label">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-9"
      >
        {display.icon.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <h1 id="verdict-label" className="mt-4 text-[2.375rem] leading-[1.05] text-white">
        {label}
      </h1>
      <p className="mt-2 text-[1.0625rem] font-medium text-white/85">{copy.result.warningSigns(response.signals.length)}</p>

      {risk.showScore && (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-sm font-semibold tabular-nums text-white">{copy.result.risk(risk.score)}</p>
          <div
            className="h-2 overflow-hidden rounded-pill bg-white/25"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={risk.score}
            aria-label={copy.result.risk(risk.score)}
          >
            <div className="h-full rounded-pill bg-white" style={{ width: `${risk.score}%` }} />
          </div>
        </div>
      )}

      {response.verdict === "scam" && (
        <p className="mt-5 border-t border-white/25 pt-4 text-[0.9375rem] leading-snug text-white">
          {copy.result.scamAdvice}
        </p>
      )}
    </section>
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
    <section className="card flex flex-col gap-3" aria-labelledby="message-label">
      <SectionLabel id="message-label">{copy.result.messageYouSent}</SectionLabel>
      <p className="text-[1rem] leading-relaxed whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        {segments.map((s, i) =>
          s.severity ? (
            // 3px is an inline text-highlight radius, not a surface — intentionally
            // outside the card/pill radius scale (see globals.css's "Shape" tokens).
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
    <details className="card">
      <summary className="cursor-pointer text-sm font-semibold text-ink">{copy.result.sentTitle}</summary>
      <p className="mt-3 text-sm text-ink-muted">{copy.result.sentBody}</p>
      <p className="mt-3 rounded-card bg-muted-surface px-3 py-2 font-mono text-[0.8125rem] whitespace-pre-wrap text-ink-soft [overflow-wrap:anywhere]">
        {redacted}
      </p>
    </details>
  );
}

export function CheckAnotherButton({ copy }: { copy: Copy }) {
  return (
    <Link href="/" className="flex min-h-14 items-center justify-center rounded-card bg-ink px-5 font-semibold text-on-ink">
      {copy.result.checkAnother}
    </Link>
  );
}
