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
import { CheckAnotherButton, MessageCard, ResultHeader, SentPanel } from "./result/parts";
import ResultHero from "./result/ResultHero";
import { LinkCard, LinksCard, WhatsWrongCard } from "./result/SignalCards";
import ScamJourney from "./result/ScamJourney";
import { IdentityCompare, SafeChecklist, signalDescription, signalTitle, WhatToDo, WhySection } from "./result/sections";

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
    const loaded = loadResult();
    setResult(loaded);
    setSimple(loadSimpleMode());
    // Demo/debug aid: which AI (if any) actually served this analysis —
    // see docs/API-CONTRACT.md's `analysis.semantic` and the "Analyzed by"
    // line in the "What was sent" panel below for the in-app equivalent.
    if (loaded?.response.analysis) console.log("[fraudlens] analyzed by:", loaded.response.analysis.semantic);
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
        <div className="gutter pt-4">
          <div className="card flex flex-col items-start gap-3">
            <h2>{copy.result.missingTitle}</h2>
            <p className="text-[1.0625rem] leading-[1.4375rem] text-ink-soft">{copy.result.missingBody}</p>
            <Link href="/" className="btn-sm pressable mt-1 bg-primary text-on-primary">
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
          <div className="screen-grid flex flex-col gap-4 lg:grid">
            <div className="span-2">
              <ResultHero response={response} label={label} copy={copy} />
            </div>
            <div className="grid grid-cols-12 items-stretch gap-3.5">
              <div className="col-span-7">
                <SafeChecklist
                  checks={safeChecks(response.signals, original, redactions)}
                  explanation={response.explanation}
                  copy={copy}
                  show={show}
                />
              </div>
              <LinksCard text={original} copy={copy} />
            </div>
            <MessageCard text={original} marks={marks} verdict={response.verdict} copy={copy} />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleSimple}
              aria-pressed={simple}
              className="btn-sm pressable w-fit self-end bg-muted-surface font-medium text-ink-muted"
            >
              {simple ? copy.simple.turnOff : copy.simple.turnOn}
            </button>

            {simple ? (
              <SimpleMode response={response} claimedIdentity={claimedIdentity} topIssue={topIssue} copy={copy} lang={lang} show={show} />
            ) : (
              /*
               * Phone: one column, in the order drawn
               * (design/mockup/Result-Scam.png). Desktop: the verdict spans
               * the top, the message and its cards take the left, and the
               * analysis behind them sits on the right — so the width carries
               * a second column instead of stretching the message to an
               * unreadable line length.
               */
              <div className="screen-grid flex flex-col gap-4 lg:grid">
                <div className="span-2">
                  <ResultHero response={response} label={label} copy={copy} />
                </div>

                <div className="flex flex-col gap-4">
                  {/* The annotated message first: it is the answer. The cards
                      under it explain the marks, they do not replace them. */}
                  <MessageCard text={original} marks={marks} verdict={response.verdict} copy={copy} />

                  <div className="grid grid-cols-12 items-stretch gap-3.5">
                    <WhatsWrongCard signals={response.signals} copy={copy} lang={lang} />
                    <LinkCard response={response} copy={copy} />
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                <div className="sheet">
                  {/* Collapsed by default: the cards above already answer
                      "what is wrong", and this is the detail behind them. */}
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

                {/* LinkCheckPanel is deliberately not rendered here: the
                    "The link" card above is the same deterministic
                    domain-matching output, and showing both listed the host,
                    the site it imitates and its age twice on one screen. */}
                <WhatToDo verdict={response.verdict} suggestedAction={response.suggestedAction} copy={copy} show={show} />
                </div>
              </div>
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
        <SentPanel redacted={redacted} fromScreenshot={result.source === "screenshot"} analysis={response.analysis} copy={copy} />
      </div>
    </div>
  );
}
