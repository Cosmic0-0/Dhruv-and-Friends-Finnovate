"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { restore } from "@/lib/redact";
import { signalKind, sortSignals } from "@/lib/result";
import { loadResult, type StoredResult } from "@/lib/storage";
import { getVerdictCopy } from "@/lib/verdict";
import { useLanguage } from "./LanguageProvider";
import ScamJourney from "./result/ScamJourney";
import { MessageCard, ResultHeader } from "./result/parts";
import { IdentityCompare, signalTitle, WhatToDo } from "./result/sections";

/**
 * The same stored analysis result as the result screen (components/
 * ResultView.tsx), retold as a chronological story instead of a stacked
 * report — Phase 3's "Fraud Replay". Reuses ScamJourney, IdentityCompare and
 * WhatToDo as-is rather than re-implementing them; only adds narrative
 * framing copy and a per-signal "why this works" line (general scam
 * psychology, never a claim specific to this sender). Reads the exact same
 * sessionStorage entry ResultView does, so it only exists right after a
 * check in this session — same constraint /result already has.
 */
export default function FraudReplay() {
  const { lang, copy } = useLanguage();
  const [result, setResult] = useState<StoredResult | null | undefined>(undefined);

  useEffect(() => setResult(loadResult()), []);

  if (result === undefined) return null;

  if (result === null || result.response.verdict === "safe") {
    // A safe message has no scam to replay. Same "nothing to show" shape as
    // /result's missing state, reusing its copy rather than inventing new text.
    return (
      <div>
        <ResultHeader copy={copy} />
        <div className="gutter pt-6">
          <div className="sheet flex flex-col gap-3 p-5">
            <h1 className="text-title">{copy.result.missingTitle}</h1>
            <p>{copy.result.missingBody}</p>
            <Link href="/" className="micro mt-1 w-fit text-ink underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
              {copy.result.checkAnother}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { response, redacted, redactions } = result;
  const show = (s: string) => restore(s, redactions);
  const original = show(redacted);
  const label = getVerdictCopy(response.verdict, lang).label;

  const marks = response.signals
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => typeof s.evidence === "string" && s.evidence.trim() !== "")
    .map(({ s, i }) => ({
      evidence: show(s.evidence as string),
      severity: s.severity,
      id: `sig-${i}`,
      label: signalTitle(s.type, copy, lang),
    }));

  const sorted = sortSignals(response.signals);
  const r = copy.replay;

  const { journey, scamDna } = response;

  // Steps only appear when the data behind them exists (never a fabricated
  // "found nothing" step) — number them in the order they'll actually render.
  let stepN = 1;
  const contactStep = stepN++;
  const wantedStep = sorted.length > 0 ? stepN++ : undefined;
  const journeyStep = journey ? stepN++ : undefined;
  const patternStep = scamDna ? stepN++ : undefined;
  const stopStep = stepN++;

  return (
    <div>
      <ResultHeader copy={copy} />
      <div className="gutter flex flex-col gap-4 pt-5">
        <header className="flex flex-col gap-2 border-b border-line-strong pb-5">
          <p className="micro text-ink">{r.title}</p>
          <h1 className="text-title">{label}</h1>
          <p className="max-w-[60ch] leading-relaxed text-ink-soft">{r.subtitle}</p>
        </header>

        {/* 1. The contact */}
        <ReplayStep n={contactStep} title={r.stepContact}>
          <MessageCard text={original} marks={marks} verdict={response.verdict} copy={copy} />
          <IdentityCompare response={response} copy={copy} />
        </ReplayStep>

        {/* 2. What it wanted — every detected signal, with the general
            psychology behind why the tactic works (never a claim specific
            to this sender). */}
        {wantedStep && (
          <ReplayStep n={wantedStep} title={r.stepWanted}>
            <ul className="flex flex-col">
              {sorted.map((s, i) => {
                const kind = signalKind(s.type);
                return (
                  <li key={i} className="flex flex-col gap-1.5 px-5 py-4 not-first:border-t not-first:border-card-border">
                    <p className="text-[0.9375rem] leading-snug font-semibold text-ink">{signalTitle(s.type, copy, lang)}</p>
                    {kind && <p className="text-sm leading-relaxed text-ink-soft">{r.belief[kind]}</p>}
                  </li>
                );
              })}
            </ul>
          </ReplayStep>
        )}

        {/* 3. Where this is heading — the journey stepper as-is, plus a direct
            hand-off into the Sandbox to feel out the likely next stage. */}
        {journeyStep && journey && (
          <ReplayStep n={journeyStep} title={r.stepJourney}>
            <ScamJourney response={response} copy={copy} />
            {journey.likelyNextStages.length > 0 && (
              <div className="border-t border-card-border px-5 py-4">
                <Link
                  href="/sandbox"
                  className="pressable inline-flex items-center gap-3 text-sm font-semibold text-ink underline underline-offset-4"
                >
                  {r.experienceSafely}
                  <span aria-hidden="true">↗</span>
                </Link>
              </div>
            )}
          </ReplayStep>
        )}

        {/* 4. The wider pattern — ScamDNA, honestly: never asserts a match
            that wasn't found. */}
        {patternStep && scamDna && (
          <ReplayStep n={patternStep} title={r.stepPattern}>
            <div className="flex flex-col gap-3 px-5 py-5">
              <p className="text-[0.9375rem] font-medium text-ink">
                {scamDna.matchStrength === "matched" ? copy.result.investigate.campaignMatched : copy.result.investigate.campaignNew}
              </p>
              {scamDna.matchStrength === "matched" && (
                <>
                  <p className="text-sm leading-relaxed text-ink-soft">
                    {r.patternMatched(scamDna.relatedReports, scamDna.relatedSenders, scamDna.relatedDomains)}
                  </p>
                  <Link
                    href={`/network/${encodeURIComponent(scamDna.fingerprintId)}`}
                    className="pressable inline-flex w-fit items-center gap-3 text-sm font-semibold text-ink underline underline-offset-4"
                  >
                    {copy.result.networkLink}
                    <span aria-hidden="true">↗</span>
                  </Link>
                </>
              )}
            </div>
          </ReplayStep>
        )}

        {/* Stop here — the same action plan as the result screen. */}
        <ReplayStep n={stopStep} title={r.stepStop}>
          <WhatToDo verdict={response.verdict} suggestedAction={response.suggestedAction} copy={copy} show={show} />
        </ReplayStep>

        <Link
          href="/result"
          className="pill pressable bg-primary text-on-primary"
        >
          {r.back}
        </Link>
      </div>
    </div>
  );
}

function ReplayStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="sheet" aria-label={title}>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="text-[1.0625rem] font-semibold text-ink">{title}</h2>
        <span aria-hidden="true" className="data text-ink-muted">
          {String(n).padStart(2, "0")}
        </span>
      </div>
      <div className="border-t border-card-border">{children}</div>
    </section>
  );
}
