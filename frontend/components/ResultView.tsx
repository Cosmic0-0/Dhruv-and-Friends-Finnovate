"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { restore } from "@/lib/redact";
import { safeChecks } from "@/lib/result";
import { loadResult, saveResult, type StoredResult } from "@/lib/storage";
import { getVerdictCopy } from "@/lib/verdict";
import { useLanguage } from "./LanguageProvider";
import ReportButton from "./result/ReportButton";
import { CheckAnotherButton, MessageCard, ResultHeader, SentPanel, VerdictBanner } from "./result/parts";
import { LinkCheckPanel, SafeChecklist, WhatToDo, WhySection } from "./result/sections";

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

  useEffect(() => setResult(loadResult()), []);

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
  const marks = response.signals
    .filter((s) => typeof s.evidence === "string" && s.evidence.trim() !== "")
    .map((s) => ({ evidence: show(s.evidence as string), severity: s.severity }));

  const onReported = (reported: { sender: string; reportCount: number }) => {
    const next = { ...result, reported };
    setResult(next);
    saveResult(next);
  };

  return (
    <div>
      <ResultHeader copy={copy} sender={sender} />

      <div className="gutter flex flex-col gap-4 pt-5">
        {/*
         * One continuous report sheet: verdict, message and every analysis
         * block are separated by hairline rules (.sheet > * + *) rather than
         * sitting as separate floating cards. The actions below are a
         * different kind of thing, so they stay outside it.
         */}
        <div className="sheet">
          <VerdictBanner response={response} label={label} copy={copy} />
          <MessageCard text={original} marks={marks} verdict={response.verdict} copy={copy} />

          {response.verdict === "safe" ? (
            <SafeChecklist
              checks={safeChecks(response.signals, original, redactions)}
              explanation={response.explanation}
              copy={copy}
              show={show}
            />
          ) : (
            <>
              <WhySection
                signals={response.signals}
                explanation={response.explanation}
                copy={copy}
                lang={lang}
                show={show}
              />
              <LinkCheckPanel response={response} copy={copy} />
              <WhatToDo verdict={response.verdict} suggestedAction={response.suggestedAction} copy={copy} show={show} />
            </>
          )}
        </div>

        {response.verdict !== "safe" && (
          <ReportButton
            sender={sender}
            redacted={redacted}
            reported={result.reported}
            onReported={onReported}
            copy={copy}
          />
        )}

        <CheckAnotherButton copy={copy} />
        <SentPanel redacted={redacted} fromScreenshot={result.source === "screenshot"} copy={copy} />
      </div>
    </div>
  );
}
