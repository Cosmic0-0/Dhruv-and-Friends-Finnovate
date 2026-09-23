"use client";

import { useState } from "react";
import { actionPlan, sortSignals } from "@/lib/result";
import { UI_LANGUAGES, type Copy, type UiLanguage } from "@/lib/i18n";
import type { AnalyzeResponse } from "@/lib/types";
import { getVerdictDisplay } from "@/lib/verdict";
import { signalDescription } from "./result/sections";

/**
 * Phase 10: a compact, shareable summary someone can send to a family
 * member or friend rather than trying to explain a scam over the phone.
 * Text-based (Web Share API, falling back to clipboard) rather than a
 * generated image — a canvas/image-export pipeline is real added
 * complexity for a hackathon window; a polished card plus the browser's own
 * screenshot/share covers the same need, as the brief's own fallback notes.
 */
export default function SafetyCard({
  response,
  claimedIdentity,
  copy,
  lang,
  show,
}: {
  response: Pick<AnalyzeResponse, "verdict" | "signals" | "suggestedAction">;
  claimedIdentity?: string;
  copy: Copy;
  lang: UiLanguage;
  show: (s: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const display = getVerdictDisplay(response.verdict);
  const headline = response.verdict === "scam" ? copy.simple.stopScam : copy.simple.stopSuspicious;
  const reasons = sortSignals(response.signals)
    .slice(0, 3)
    .map((s) => signalDescription(s, copy, show));
  const { steps, prose } = actionPlan(response.verdict, response.suggestedAction);
  const firstStep = prose ?? (steps[0] ? copy.result.steps[steps[0]] : undefined);

  const shareText = [
    copy.card.cardTitle,
    "",
    `⚠ ${headline.toUpperCase()}`,
    claimedIdentity ? copy.simple.claims(claimedIdentity) : "",
    "",
    reasons.length > 0 ? `${copy.card.whyHeading}:` : "",
    ...reasons.map((r) => `• ${r}`),
    "",
    firstStep ? `${copy.result.whatToDoTitle}: ${firstStep}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: copy.card.cardTitle, text: shareText });
      } catch {
        /* user cancelled the share sheet — not an error */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the card text is still visible to select manually */
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pill-sm pressable w-fit bg-muted-surface font-medium text-ink-muted hover:bg-muted-surface hover:text-ink"
      >
        {copy.card.helpMeExplain}
      </button>
    );
  }

  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  return (
    <div className="sheet">
      <div className={`px-5 py-4 text-white ${display.classes.bg}`}>
        <p className="micro text-white/70">{copy.card.cardTitle}</p>
        <h2 className="mt-1.5 text-[1.375rem] leading-tight font-semibold text-white">{headline}</h2>
      </div>
      <div className="flex flex-col gap-3 px-5 py-5">
        {claimedIdentity && <p className="text-sm leading-relaxed text-ink">{copy.simple.claims(claimedIdentity)}</p>}
        {reasons.length > 0 && (
          <div>
            <p className="micro mb-2 text-ink-muted">{copy.card.whyHeading}</p>
            <ul className="flex flex-col gap-1.5">
              {reasons.map((r, i) => (
                <li key={i} className="text-sm leading-relaxed text-ink-soft">
                  • {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {firstStep && (
          <div>
            <p className="micro mb-1 text-ink-muted">{copy.result.whatToDoTitle}</p>
            <p className="text-sm leading-relaxed text-ink">{firstStep}</p>
          </div>
        )}
        <p className="data text-ink-muted">{UI_LANGUAGES.map((l) => l.label).join(" / ")}</p>
        <button
          type="button"
          onClick={() => void share()}
          className="pill-sm pressable bg-primary text-on-primary"
        >
          {copied ? copy.card.copied : canShare ? copy.card.share : copy.card.copyText}
        </button>
      </div>
    </div>
  );
}
