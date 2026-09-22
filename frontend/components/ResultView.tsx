"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { restore } from "@/lib/redact";
import { loadResult, type StoredResult } from "@/lib/storage";
import { getRiskDisplay, getVerdictCopy, getVerdictDisplay } from "@/lib/verdict";
import { useLanguage } from "./LanguageProvider";

const SEVERITY_DOT = { high: "bg-danger", medium: "bg-caution-bright", low: "bg-ink-muted" } as const;

/**
 * Result view. Shows the user's ORIGINAL text (rebuilt locally from the
 * redaction mapping) alongside the verdict, while the "what was sent"
 * section shows the redacted version, the only one that left the device.
 *
 * DEMO NOTE: expand "What was sent for analysis" to show the redaction live
 * (privacy differentiator). The signal list is the structured breakdown.
 */
export default function ResultView() {
  const { lang, copy } = useLanguage();
  const [result, setResult] = useState<StoredResult | null | undefined>(undefined);

  useEffect(() => setResult(loadResult()), []);

  if (result === undefined) return null; // reading sessionStorage

  if (result === null) {
    return (
      <div className="card flex flex-col gap-3">
        <h2>{copy.result.missingTitle}</h2>
        <p>{copy.result.missingBody}</p>
        <Link href="/" className="mt-2 font-semibold text-ink underline underline-offset-4">
          {copy.result.checkAnother}
        </Link>
      </div>
    );
  }

  const { response, redacted, redactions } = result;
  const display = getVerdictDisplay(response.verdict);
  const verdictCopy = getVerdictCopy(response.verdict, lang);
  const risk = getRiskDisplay(response);
  const show = (s: string) => restore(s, redactions);
  const action = copy.result.actions[response.suggestedAction] ?? response.suggestedAction.replace(/_/g, " ");

  return (
    <div className="flex flex-col gap-6">
      <section className={`flex flex-col gap-3 rounded-card p-6 text-white ${display.classes.bg}`} aria-live="polite">
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-7 shrink-0"
          >
            {display.icon.paths.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
          <h1 className="text-[2rem] leading-none text-white">{verdictCopy.label}</h1>
        </div>
        <p className="text-[1.0625rem] leading-snug text-white/90">{verdictCopy.headline}</p>
        {risk.showScore && (
          <div className="mt-1 flex flex-col gap-1.5">
            <div className="flex justify-between text-sm text-white/85">
              <span>{copy.result.riskScore}</span>
              <span className="font-semibold tabular-nums">{risk.score}/100</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-pill bg-white/25">
              <div className="h-full rounded-pill bg-white" style={{ width: `${risk.score}%` }} />
            </div>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-2">
        <h2 className="font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-muted uppercase">
          {copy.result.yourMessage}
        </h2>
        <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-ink">{show(redacted)}</p>
      </section>

      {response.explanation && (
        <section className="flex flex-col gap-2">
          <h2 className="text-title">{copy.result.whyTitle}</h2>
          <p className="leading-relaxed">{show(response.explanation)}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-title">{copy.result.signalsTitle}</h2>
        {response.signals.length === 0 ? (
          <p className="text-ink-muted">{copy.result.noSignals}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {response.signals.map((s, i) => (
              <li key={`${s.type}-${i}`} className="card flex flex-col gap-1.5 p-5">
                <div className="flex items-center gap-2 text-[0.75rem] font-semibold tracking-wide text-ink-muted uppercase">
                  <span aria-hidden="true" className={`size-2 rounded-full ${SEVERITY_DOT[s.severity]}`} />
                  {copy.result.severity[s.severity]}
                  <span aria-hidden="true">·</span>
                  <span className="normal-case">{s.type.replace(/_/g, " ")}</span>
                </div>
                <p className="text-[0.9375rem] leading-relaxed text-ink">{show(s.description)}</p>
                {s.evidence && (
                  <p className="rounded-lg bg-muted-surface px-3 py-2 font-mono text-[0.8125rem] break-all text-ink-soft">
                    {show(s.evidence)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title">{copy.result.nextStepTitle}</h2>
        <p className="leading-relaxed">{show(action)}</p>
      </section>

      <details className="card group">
        <summary className="cursor-pointer text-sm font-semibold text-ink">{copy.result.sentTitle}</summary>
        <p className="mt-3 text-sm text-ink-muted">{copy.result.sentBody}</p>
        <p className="mt-3 rounded-lg bg-muted-surface px-3 py-2 font-mono text-[0.8125rem] whitespace-pre-wrap text-ink-soft">
          {redacted}
        </p>
      </details>

      <Link
        href="/"
        className="flex min-h-14 items-center justify-center rounded-card bg-ink px-5 font-semibold text-on-ink"
      >
        {copy.result.checkAnother}
      </Link>
    </div>
  );
}
