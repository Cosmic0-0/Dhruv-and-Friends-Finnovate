import { Fragment } from "react";
import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import { highlightSegments, type EvidenceMark } from "@/lib/highlight";
import type { AnalyzeResponse, Verdict } from "@/lib/types";
import { getRiskDisplay, getVerdictBandIndex, getVerdictDisplay, VERDICT_BANDS } from "@/lib/verdict";
import ScreenTitle from "../ScreenTitle";

/** Small secondary section label used across the result screen. */
export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="micro text-ink-muted">
      {children}
    </h2>
  );
}

/**
 * The result screen's header: back to Check, the large title, and the sender
 * line beneath it (design/mockup/Result-Scam.png).
 */
export function ResultHeader({ copy, sender }: { copy: Copy; sender?: string }) {
  return (
    <ScreenTitle
      title={copy.result.title}
      subtitle={sender ? copy.result.fromSender(sender) : undefined}
      back={{ href: "/", label: copy.tabs.check }}
    />
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

      {/* Only when the API returned riskScore (getRiskDisplay): never derived client-side. */}
      {risk.showScore && <RiskMeter score={risk.score} label={copy.result.risk(risk.score)} />}

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

/**
 * The backend's riskScore (0–100) on a measuring scale: a filled bar with
 * quarter ticks, in the same instrument language as the band gauge above.
 * The score is printed once, as text, so it doesn't depend on the bar.
 */
function RiskMeter({ score, label }: { score: number; label: string }) {
  return (
    <div className="mt-4 flex flex-col gap-2.5 border-t border-white/20 pt-3">
      <p className="data text-white/85">{label}</p>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label={label}
        className="relative h-2 bg-white/20"
      >
        <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${score}%` }} />
        {[25, 50, 75].map((t) => (
          <span key={t} aria-hidden="true" className="absolute inset-y-0 w-px bg-surface-dark/25" style={{ left: `${t}%` }} />
        ))}
      </div>
    </div>
  );
}

const MARK_TONE: Record<Exclude<Verdict, "safe">, string> = {
  scam: "bg-danger-soft decoration-danger",
  suspicious: "bg-caution-soft decoration-caution-bright",
};

/**
 * The user's ORIGINAL text, with signal evidence highlighted ("Scam X-Ray").
 * highlightSegments only splits the text (never alters it), and unmatched
 * evidence is ignored. A highlighted span that carries an evidence-row id
 * (every mark built from response.signals does) is a link to that row in
 * the "Why FraudLens flagged this" section below, with its signal title as
 * the hover/tap hint — so a judge can tap a highlighted phrase and see
 * exactly which finding it triggered, without a separate popover system.
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
  const markClasses = `rounded-[3px] px-0.5 underline decoration-2 underline-offset-[3px] [box-decoration-break:clone] text-[var(--c-mark-ink)] ${tone}`;
  const hasHighlights = segments.some((s) => s.severity);
  // The verdict is carried by the bubble's own edge rather than a badge beside
  // it, so the thing being judged is the thing that is marked.
  const edge =
    verdict === "scam" ? "var(--color-danger)" : verdict === "suspicious" ? "var(--color-caution)" : "var(--color-safe)";
  return (
    <section className="flex flex-col gap-2" aria-labelledby="message-label">
      <SectionLabel id="message-label">{copy.result.messageYouSent}</SectionLabel>
      {/*
       * The message itself, annotated in place. This is the product: not a
       * report about the text, but the text with the damning parts marked.
       * Set in the system font, because that is how it arrived.
       */}
      <p
        className="bubble bubble-verdict"
        style={{ "--bubble-edge": edge } as React.CSSProperties}
      >
        {segments.map((s, i) => {
          if (!s.severity) return <Fragment key={i}>{s.text}</Fragment>;
          // 3px is an inline text-highlight radius, not a surface — intentionally
          // outside the sharp-corner rule that applies to every real surface.
          if (s.id) {
            return (
              <a key={i} href={`#${s.id}`} title={s.label} className={`${markClasses} hover:brightness-95`}>
                {s.text}
              </a>
            );
          }
          return (
            <mark key={i} className={markClasses}>
              {s.text}
            </mark>
          );
        })}
      </p>
      {hasHighlights && <p className="text-[0.8125rem] text-ink-muted">{copy.result.xrayHint}</p>}
    </section>
  );
}

type SemanticInfo = NonNullable<AnalyzeResponse["analysis"]>["semantic"];

/** "Analyzed by: local/fallback/unavailable" line — see docs/API-CONTRACT.md's `analysis.semantic`. */
export function aiSourceLabel(semantic: SemanticInfo | undefined, copy: Copy): string {
  if (!semantic || semantic.status === "unavailable" || semantic.status === "skipped") return copy.result.aiSource.unavailable;
  if (semantic.provider === "ollama") return copy.result.aiSource.local;
  if (semantic.provider) return copy.result.aiSource.fallback.replace("{provider}", semantic.provider);
  return copy.result.aiSource.unavailable;
}

export function SentPanel({
  redacted,
  fromScreenshot,
  analysis,
  copy,
}: {
  redacted: string;
  fromScreenshot: boolean;
  analysis?: AnalyzeResponse["analysis"];
  copy: Copy;
}) {
  return (
    <details className="sheet group">
      <summary className="micro pressable flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-ink-muted">
        {copy.result.sentTitle}
        <span aria-hidden="true" className="text-[0.875rem] group-open:hidden">
          +
        </span>
        <span aria-hidden="true" className="hidden text-[0.875rem] group-open:inline">
          −
        </span>
      </summary>
      <div className="px-5 py-4">
        {/* "Only this version left your phone" is false when the text came from a screenshot. */}
        <p className="text-sm text-ink-muted">{fromScreenshot ? copy.result.sentBodyScreenshot : copy.result.sentBody}</p>
        <p className="data mt-3 rounded-2xl bg-muted-surface px-3.5 py-3 whitespace-pre-wrap text-ink-soft [overflow-wrap:anywhere]">
          {redacted}
        </p>
        <p className="micro-sm mt-3 text-ink-muted">
          {copy.result.aiSource.label}: {aiSourceLabel(analysis?.semantic, copy)}
        </p>
      </div>
    </details>
  );
}

export function CheckAnotherButton({ copy }: { copy: Copy }) {
  return (
    <Link
      href="/"
      className="btn pressable w-full bg-primary text-on-primary"
    >
      {copy.result.checkAnother}
    </Link>
  );
}
