"use client";

import type { SignalKind } from "@/lib/result";
import { useLanguage } from "./LanguageProvider";

/** Narrative order for the eight signal kinds — identity/urgency first (what a scam message leads with), link last. */
const LEARN_ORDER: readonly SignalKind[] = [
  "spoofed_identity",
  "sender_mismatch",
  "urgency_language",
  "credential_request",
  "payment_request",
  "prize_offer",
  "secrecy",
  "lookalike_url",
];

export default function LearnContent() {
  const { copy } = useLanguage();
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h1>{copy.learn.title}</h1>
        <p className="max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink-soft">{copy.learn.intro}</p>
      </section>

      {/* A reference list, so it's ruled rows in one sheet rather than eight
          identical floating cards. */}
      <ol className="sheet">
        {LEARN_ORDER.map((kind, i) => (
          <li key={kind} className="flex gap-3.5 px-4 py-4">
            <span aria-hidden="true" className="data shrink-0 pt-0.5 font-medium text-accent-ink">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 className="font-sans text-[1.0625rem] leading-snug font-semibold text-ink">
                {copy.result.signalTitles[kind]}
              </h2>
              <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{copy.learn.examples[kind]}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
