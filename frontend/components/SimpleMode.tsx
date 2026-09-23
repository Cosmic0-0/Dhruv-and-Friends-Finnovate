"use client";

import { useEffect, useRef, useState } from "react";
import { actionPlan } from "@/lib/result";
import { UI_LANGUAGES, type Copy, type UiLanguage } from "@/lib/i18n";
import type { AnalyzeResponse } from "@/lib/types";
import { getVerdictDisplay } from "@/lib/verdict";

/**
 * Phase 9: an action-first, plain-language replacement for the detailed
 * result — one decision ("don't send money"), one reason, numbered steps,
 * optionally read aloud. Built for someone who needs the short version, not
 * a simplified rendering of the same dense layout (bigger fonts alone don't
 * satisfy this). Toggled from ResultView; never shown for a "safe" verdict,
 * since there's no warning to lead with there.
 */
export default function SimpleMode({
  response,
  claimedIdentity,
  topIssue,
  copy,
  lang,
  show,
}: {
  response: Pick<AnalyzeResponse, "verdict" | "suggestedAction">;
  /** The institution/person this message claims to be from, if known. */
  claimedIdentity?: string;
  /** Plain-language description of the strongest signal, if any. */
  topIssue?: string;
  copy: Copy;
  lang: UiLanguage;
  show: (s: string) => string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const s = copy.simple;
  const display = getVerdictDisplay(response.verdict);
  const headline = response.verdict === "scam" ? s.stopScam : s.stopSuspicious;

  const { steps, prose } = actionPlan(response.verdict, response.suggestedAction);
  const stepTexts = [...(prose ? [show(prose)] : []), ...steps.map((k) => copy.result.steps[k])];

  // Stop any speech in progress if the user navigates away or toggles modes.
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function speak() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const text = [headline, claimedIdentity ? s.claims(claimedIdentity) : "", `${s.but} ${topIssue || s.issueFallback}`, ...stepTexts]
      .filter(Boolean)
      .join(". ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = UI_LANGUAGES.find((l) => l.id === lang)?.htmlLang ?? "en";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  return (
    <div className="sheet">
      <div className={`px-6 py-7 text-white ${display.classes.bg}`}>
        <p aria-hidden="true" className="text-3xl leading-none text-white">
          ⚠
        </p>
        <h1 className="mt-3 text-[2rem] leading-[1.1] font-semibold text-white">{headline}</h1>
      </div>
      <div className="flex flex-col gap-5 px-6 py-6">
        {claimedIdentity && <p className="text-lg leading-relaxed text-ink">{s.claims(claimedIdentity)}</p>}
        <p className="text-lg leading-relaxed font-semibold text-ink">
          {s.but} {topIssue || s.issueFallback}
        </p>
        {stepTexts.length > 0 && (
          <div>
            <h2 className="micro mb-3 text-ink-muted">{copy.result.whatToDoTitle}</h2>
            <ol className="flex flex-col gap-4">
              {stepTexts.map((text, i) => (
                <li key={i} className="flex gap-3 text-lg leading-relaxed text-ink">
                  <span aria-hidden="true" className="font-heading font-semibold text-accent-ink">
                    {i + 1}.
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {typeof window !== "undefined" && "speechSynthesis" in window && (
          <button
            type="button"
            onClick={speaking ? stopSpeaking : speak}
            aria-pressed={speaking}
            className="btn pressable w-full bg-muted-surface text-ink"
          >
            {speaking ? s.stopReading : s.readAloud}
          </button>
        )}
      </div>
    </div>
  );
}
