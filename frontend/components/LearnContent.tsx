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
    <>
      <section className="flex flex-col gap-3 pt-2">
        <h1>{copy.learn.title}</h1>
        <p className="text-[1.0625rem] leading-relaxed text-ink-soft">{copy.learn.intro}</p>
      </section>

      <ol className="flex flex-col gap-3">
        {LEARN_ORDER.map((kind, i) => (
          <li key={kind} className="card flex flex-col gap-2">
            <div className="flex items-baseline gap-3">
              <span
                aria-hidden="true"
                className="shrink-0 font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-muted"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="font-sans text-[1.0625rem] leading-snug font-semibold text-ink">
                {copy.result.signalTitles[kind]}
              </h2>
            </div>
            <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{copy.learn.examples[kind]}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
