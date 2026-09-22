"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WaitStages } from "@/lib/i18n";

/**
 * Progress for waits with no real server-side progress (a check or a
 * screenshot read: 10s to 2+ minutes on the current hardware). It never
 * claims a percentage or a time estimate:
 *
 *  - The fill creeps along a decelerating curve in pure CSS (.fl-wait-fill,
 *    app/globals.css): ~40% at 5s, ~75% at 30s, then approaches but never
 *    reaches ~92%. It reads as "still working", never "stuck" or "done".
 *  - Staged copy changes at 4s / 15s / 40s via three one-shot timers.
 *  - On success the fill freezes where it is, runs to 100%, holds, and only
 *    then does the caller move on. It never jumps backward.
 *  - Reduced motion: no creep, discrete jumps between stages; the text still
 *    updates.
 *
 * The submit button renders a compact WaitFill from the same stage and phase,
 * so the button and the row can't disagree.
 */

/** Stage boundaries: 0–4s, 4–15s, 15–40s, 40s+. */
export const STAGE_AT_MS = [4_000, 15_000, 40_000] as const;
/** Reduced-motion fills, one per stage (roughly where the creep is at each stage). */
const STEP_FILL = [0.2, 0.45, 0.75, 0.88] as const;
/** Success: run to 100%, then hold before the caller transitions away. */
const FINISH_MS = 280;
const HOLD_MS = 150;
export const SUCCESS_DELAY_MS = FINISH_MS + HOLD_MS;

export type WaitPhase = "running" | "done";

/** Current stage (0–3) while `active`; resets to 0 when inactive. No polling: three timers. */
export function useWaitStage(active: boolean): number {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    setStage(0);
    if (!active) return;
    const timers = STAGE_AT_MS.map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [active]);
  return stage;
}

/** The fill's scale as actually painted right now (0–1), read from the computed transform. */
function paintedScale(el: Element): number {
  const t = getComputedStyle(el).transform;
  const m = t && t !== "none" ? /^matrix\(\s*([-\d.e]+)/.exec(t) : null;
  return m ? Math.min(1, Math.max(0, parseFloat(m[1]))) : 0;
}

/** The moving fill. Place inside a positioned, overflow-hidden track. */
export function WaitFill({ phase, stage, className = "" }: { phase: WaitPhase; stage: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || phase !== "done") return;
    // Freeze at the value on screen first, so finishing never jumps backward…
    const current = paintedScale(el);
    el.style.animation = "none";
    el.style.transform = `scaleX(${current})`;
    void el.getBoundingClientRect(); // commit the frozen value before transitioning
    // …then run quickly to 100%. (Reduced motion: the global rule makes this instant.)
    el.style.transition = `transform ${FINISH_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
    el.style.transform = "scaleX(1)";
  }, [phase]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`fl-wait-fill absolute inset-0 block ${className}`}
      style={{ "--wait-step": STEP_FILL[Math.min(stage, STEP_FILL.length - 1)] } as React.CSSProperties}
    />
  );
}

/**
 * Stage text (announced politely) and the progress bar. aria-valuenow is
 * written straight to the DOM from the fill's painted value, once a second and
 * on every stage/phase change, so screen readers track what's on screen
 * without re-rendering React.
 */
export function WaitStatus({
  phase,
  stage,
  labels,
  progressLabel,
  barClassName = "bg-muted-surface",
  fillClassName = "bg-accent",
  textClassName = "text-[0.9375rem] leading-snug text-ink",
}: {
  phase: WaitPhase;
  stage: number;
  labels: WaitStages;
  progressLabel: string;
  barClassName?: string;
  fillClassName?: string;
  textClassName?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  const sync = () => {
    const bar = barRef.current;
    const fill = bar?.querySelector(".fl-wait-fill");
    if (bar && fill) bar.setAttribute("aria-valuenow", String(Math.round(paintedScale(fill) * 100)));
  };

  useLayoutEffect(sync, []);
  // Coarse cadence while creeping: one attribute write, no React re-render.
  useEffect(() => {
    const id = setInterval(sync, 500);
    return () => clearInterval(id);
  }, []);
  // A stage jump changes the fill at once; the finish moves it fast, so follow
  // that one frame by frame until it settles.
  useEffect(() => {
    if (phase !== "done") {
      const t = setTimeout(sync, 50);
      return () => clearTimeout(t);
    }
    let raf = 0;
    const until = performance.now() + FINISH_MS + 60;
    const step = () => {
      sync();
      if (performance.now() < until) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [stage, phase]);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <p aria-live="polite" className={textClassName}>
        {labels[Math.min(stage, labels.length - 1)]}
      </p>
      <div
        ref={barRef}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={progressLabel}
        className={`relative h-1.5 overflow-hidden ${barClassName}`}
      >
        <WaitFill phase={phase} stage={stage} className={fillClassName} />
      </div>
    </div>
  );
}
