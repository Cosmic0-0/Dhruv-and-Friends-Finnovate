"use client";

import type { Copy } from "@/lib/i18n";
import InvestigationReveal from "../InvestigationReveal";
import { WaitFill, type WaitPhase } from "../WaitProgress";

/**
 * The Checking state (frontend/design/mockup/Checking.png): the same dark hero
 * the screen already had, now carrying the wait.
 *
 * The staged copy and its timing are unchanged — they still come from
 * copy.wait.check at the 4s / 15s / 40s boundaries in WaitProgress's
 * useWaitStage, and the bar is the same CSS creep, which never claims a
 * percentage. Only where they are drawn has changed.
 *
 * Once the response is in ("finishing"), the reveal checklist replaces the
 * reassurance line, so the last thing in the hero before the result screen is
 * what this exact response actually found.
 */
export default function CheckingHero({
  copy,
  phase,
  stage,
  reveal,
  progressLabel,
}: {
  copy: Copy;
  phase: WaitPhase;
  stage: number;
  /** Lines from lib/result.ts's revealSteps; empty until the response arrives. */
  reveal: string[];
  progressLabel: string;
}) {
  const labels = copy.wait.check;
  const headline = labels[Math.min(stage, labels.length - 1)];
  const revealing = phase === "done" && reveal.length > 0;

  return (
    <section className="hero flex flex-col gap-3 px-[22px] pt-[22px] pb-5">
      <p className="text-[0.9375rem] font-semibold text-white/70">{copy.check.checkingLabel}</p>
      {/* aria-live on the headline only: the bar below reports its own value,
          and the reveal list has its own role="status". */}
      <h2 aria-live="polite" className="text-[2.125rem] leading-10 font-bold tracking-[-0.01em] text-white">
        {headline}
      </h2>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={progressLabel}
        className="relative mt-1.5 h-1.5 overflow-hidden rounded-[3px] bg-white/[0.14]"
      >
        <WaitFill phase={phase} stage={stage} className="bg-white" />
      </div>

      {revealing ? (
        <div className="mt-1 [&_*]:text-white/[0.72] [&_p]:text-white/70">
          <InvestigationReveal heading={copy.result.investigate.heading} steps={reveal} />
        </div>
      ) : (
        <p className="text-[0.9375rem] leading-5 text-white/[0.62]">{copy.check.checkingNote}</p>
      )}
    </section>
  );
}

/**
 * Grey placeholders in the shape of the result below the hero, instead of a
 * spinner: the wait is long enough that showing what is coming reads better
 * than showing that something is happening.
 *
 * Decorative only — the hero above carries every announcement.
 */
export function ResultSkeleton() {
  const bar = (w: string, h = "h-3") => <span className={`block ${h} ${w} rounded-lg bg-skeleton`} />;
  return (
    <div aria-hidden="true" className="flex flex-col gap-3.5">
      <div className="grid grid-cols-12 gap-3.5">
        <section className="card col-span-7 flex flex-col gap-3">
          {bar("w-3/5", "h-3.5")}
          <span className="my-1 size-32 self-center rounded-full border-[15px] border-skeleton" />
          {bar("w-[90%]")}
          {bar("w-3/4")}
          {bar("w-[82%]")}
        </section>
        <section className="card col-span-5 flex flex-col gap-3">
          {bar("w-[55%]", "h-3.5")}
          {bar("w-[45%]", "h-10")}
          {bar("w-full", "h-12")}
          {bar("w-4/5")}
        </section>
      </div>
      <section className="card flex flex-col gap-3">
        {bar("w-[45%]", "h-3.5")}
        {bar("w-full")}
        {bar("w-[92%]")}
        {bar("w-[70%]")}
      </section>
    </div>
  );
}
