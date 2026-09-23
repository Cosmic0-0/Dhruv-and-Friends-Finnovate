"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { restore } from "@/lib/redact";
import { safeChecks, signalKind, sortSignals } from "@/lib/result";
import { loadResult, loadSimpleMode, saveResult, saveSimpleMode, type StoredResult } from "@/lib/storage";
import { getVerdictCopy } from "@/lib/verdict";
import { useLanguage } from "./LanguageProvider";
import MobileCollapsible from "./MobileCollapsible";
import SafetyCard from "./SafetyCard";
import SimpleMode from "./SimpleMode";
import ActionDock from "./result/ActionDock";
import ReportButton from "./result/ReportButton";
import { CheckAnotherButton, MessageCard, ResultHeader, SentPanel, VerdictBanner } from "./result/parts";
import ScamJourney from "./result/ScamJourney";
import { IdentityCompare, LinkCheckPanel, SafeChecklist, signalDescription, signalTitle, WhatToDo, WhySection } from "./result/sections";

/**
 * Result screen. The user's ORIGINAL text is rebuilt locally from the
 * redaction mapping; the redacted version (the only one that left the
 * device) is in the collapsed "What was sent for analysis" panel.
 *
 * DEMO NOTES:
 *  - Structured breakdown: one card per signal plus the Link check panel
 *    (deterministic domain matching), never a single opaque score.
 *  - Privacy: open "What was sent for analysis" to show the redaction.
 *  - Crowdsourced feed: tap Report twice to show the count rising.
 */
export default function ResultView() {
  const { lang, copy } = useLanguage();
  const [result, setResult] = useState<StoredResult | null | undefined>(undefined);
  const [simple, setSimple] = useState(false);

  useEffect(() => {
    setResult(loadResult());
    setSimple(loadSimpleMode());
  }, []);

  function toggleSimple() {
    setSimple((prev) => {
      const next = !prev;
      saveSimpleMode(next);
      return next;
    });
  }

  if (result === undefined) return null; // reading sessionStorage

  if (result === null) {
    return (
      <div>
        <ResultHeader copy={copy} />
        <div className="gutter pt-6">
          <div className="sheet flex flex-col gap-3 p-5">
            <h1 className="text-title">{copy.result.missingTitle}</h1>
            <p>{copy.result.missingBody}</p>
            <Link
              href="/"
              className="micro mt-1 w-fit text-accent-ink underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
            >
              {copy.result.checkAnother}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { response, redacted, redactions } = result;
  // Server text was produced from the redacted message; swap placeholders back for display.
  const show = (s: string) => restore(s, redactions);
  const original = show(redacted);
  const sender = response.sender ? show(response.sender) : undefined;
  const label = getVerdictCopy(response.verdict, lang).label;
  // `id`/`label` key each highlighted mark to its evidence row below ("Scam
  // X-Ray" click-to-jump, components/result/parts.tsx's MessageCard) -
  // `_idx` is the signal's position in the ORIGINAL response.signals array,
  // stable regardless of the severity-sorted display order WhySection uses.
  const marks = response.signals
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => typeof s.evidence === "string" && s.evidence.trim() !== "")
    .map(({ s, i }) => ({
      evidence: show(s.evidence as string),
      severity: s.severity,
      id: `sig-${i}`,
      label: signalTitle(s.type, copy, lang),
    }));

  const onReported = (reported: { sender: string; reportCount: number }) => {
    const next = { ...result, reported };
    setResult(next);
    saveResult(next);
  };

  // Simple mode's two facts: who it claims to be from, and the single
  // strongest reason to doubt it — both derived the same way the detailed
  // view already does (IDENTITY_MISMATCH's claimedIdentity, else the
  // extracted sender; the highest-severity signal's own description).
  const identitySignal = response.signals.find((sig) => signalKind(sig.type) === "sender_mismatch");
  const claimedIdentity = identitySignal?.claimedIdentity ? show(identitySignal.claimedIdentity) : sender;
  const topSignal = sortSignals(response.signals)[0];
  const topIssue = topSignal ? signalDescription(topSignal, copy, show) : undefined;

  return (
    <div>
      <ResultHeader copy={copy} sender={sender} />

      <div className="gutter flex flex-col gap-4 pt-5">
        {response.verdict === "safe" ? (
          // A safe verdict has nothing to investigate across regions — one
          // continuous report sheet, same as before.
          <div className="sheet">
            <VerdictBanner response={response} label={label} copy={copy} />
            <MessageCard text={original} marks={marks} verdict={response.verdict} copy={copy} />
            <SafeChecklist
              checks={safeChecks(response.signals, original, redactions)}
              explanation={response.explanation}
              copy={copy}
              show={show}
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleSimple}
              aria-pressed={simple}
              className="pressable micro flex min-h-10 w-fit items-center gap-2 self-end border border-card-border bg-card px-3 text-ink-muted hover:bg-muted-surface hover:text-ink"
            >
              {simple ? copy.simple.turnOff : copy.simple.turnOn}
            </button>

            {simple ? (
              <SimpleMode response={response} claimedIdentity={claimedIdentity} topIssue={topIssue} copy={copy} lang={lang} show={show} />
            ) : (
              <>
                {/*
                 * Two instrument faces side by side on wide screens instead of
                 * one long column: what was found (left) and why it was
                 * flagged (right). Each keeps its own hairline-rule rhythm
                 * (.sheet > * + *); the grid gap is the boundary between them.
                 */}
                <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                  <div className="sheet">
                    <VerdictBanner response={response} label={label} copy={copy} />
                    <MessageCard text={original} marks={marks} verdict={response.verdict} copy={copy} />
                  </div>
                  <div className="sheet">
                    {/* Collapsed by default on a phone screen (Phase 13C
                        progressive disclosure), open by default at lg+ where
                        this is already its own column. */}
                    <MobileCollapsible summary={copy.result.whyTitle}>
                      <div className="[&>*+*]:border-t [&>*+*]:border-card-border">
                        <WhySection
                          signals={response.signals}
                          explanation={response.explanation}
                          senderReports={response.senderReports}
                          copy={copy}
                          lang={lang}
                          show={show}
                        />
                        <IdentityCompare response={response} copy={copy} />
                      </div>
                    </MobileCollapsible>
                  </div>
                </div>

                {(response.journey || response.scamDna?.matchStrength === "matched") && (
                  <div className="sheet">
                    <MobileCollapsible summary={copy.result.journey.title}>
                      <ScamJourney response={response} copy={copy} />
                      {response.scamDna?.matchStrength === "matched" && (
                        <div className="border-t border-card-border px-5 py-4">
                          <Link
                            className="pressable inline-flex items-center gap-3 text-sm font-semibold text-accent-ink underline underline-offset-4"
                            href={`/network/${encodeURIComponent(response.scamDna.fingerprintId)}`}
                          >
                            {copy.result.networkLink}
                            <span aria-hidden="true">↗</span>
                          </Link>
                        </div>
                      )}
                    </MobileCollapsible>
                  </div>
                )}

                <div className="sheet">
                  <LinkCheckPanel response={response} copy={copy} />
                  <WhatToDo verdict={response.verdict} suggestedAction={response.suggestedAction} copy={copy} show={show} />
                </div>
              </>
            )}

            <ActionDock response={response} hasReportSection copy={copy} />

            <div id="report-section" className="scroll-mt-6">
              <ReportButton
                sender={sender}
                redacted={redacted}
                reported={result.reported}
                onReported={onReported}
                copy={copy}
              />
            </div>

            <SafetyCard response={response} claimedIdentity={claimedIdentity} copy={copy} lang={lang} show={show} />
          </>
        )}

        <CheckAnotherButton copy={copy} />
        <SentPanel redacted={redacted} fromScreenshot={result.source === "screenshot"} copy={copy} />
      </div>
    </div>
  );
}
