"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Copy } from "@/lib/i18n";
import { redact } from "@/lib/redact";
import { safeChecks } from "@/lib/result";
import type { Mistake } from "@/lib/streak";

const FADE_MS = 200;

/**
 * Daily-streak celebration, shown once per day when the 5th question is
 * answered. Sequence (CSS in app/globals.css, .fl-*): the scrim fades in, the
 * card scales up with a slight overshoot, then a flame (streak 2+) or a
 * self-drawing tick (day one) plays. Reduced motion keeps only the fades.
 *
 * Accessibility: modal dialog, everything behind is `inert`, focus is trapped
 * in the card, Esc or "Keep going" dismisses, the scrim swallows clicks.
 *
 * DEMO NOTE: in `next dev`, the Learn tab's dev tools can reset the streak or
 * pretend two days are done, so the flame can be shown on demand.
 */
export default function Celebration({
  streak,
  right,
  total,
  mistakes,
  copy,
  onClose,
}: {
  streak: number;
  right: number;
  total: number;
  mistakes: Mistake[];
  copy: Copy;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const L = copy.learn;

  // Fade out, then unmount. Guarded so Esc + click can't double-close.
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(onClose, FADE_MS);
  }, [onClose]);

  // Make the rest of the page inert, lock scroll, move focus in; undo it all on close.
  useEffect(() => {
    const root = rootRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const siblings = [...document.body.children].filter((el) => el !== root && !el.hasAttribute("inert"));
    siblings.forEach((el) => el.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    buttonRef.current?.focus({ preventScroll: true });
    return () => {
      siblings.forEach((el) => el.removeAttribute("inert"));
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  // Esc dismisses; Tab cycles within the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      const focusable = [...cardRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!cardRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const reasonFor = (m: Mistake) => {
    if (m.isScam) return m.reasons[0] ? copy.result.signalTitles[m.reasons[0]] : copy.result.genericSignal;
    const check = safeChecks([], m.text, redact(m.text).redactions)[0];
    return check ? copy.result.checks[check] : L.isGenuine;
  };

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      // The card is centred in a full-screen layer, so on a notched phone it
      // needs the insets itself or it can sit under the notch or the home
      // indicator on a short screen.
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Swallows clicks so nothing behind can be reached; dismissal is Esc or the button only. */}
      <div
        className="fl-scrim absolute inset-0 bg-[var(--c-scrim)] backdrop-blur-[6px] [-webkit-backdrop-filter:blur(6px)]"
        data-closing={closing || undefined}
        aria-hidden="true"
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebrate-title"
        aria-describedby="celebrate-line"
        data-closing={closing || undefined}
        className="fl-card relative flex max-h-[88dvh] w-full max-w-[380px] flex-col items-center gap-1.5 overflow-y-auto rounded-[28px] bg-card px-6 pt-7 pb-[22px] text-center shadow-[0_30px_60px_rgb(12_12_14_/_35%)]"
      >
        {streak >= 2 ? <Flame /> : <Tick />}
        <div className="flex flex-col gap-1.5">
          <h2 id="celebrate-title" className="text-[2rem] leading-[2.375rem] font-bold text-ink">
            {L.celebrate.title(streak)}
          </h2>
          <p id="celebrate-line" className="text-[1.0625rem] leading-[1.4375rem] text-ink-muted">
            {streak >= 2 ? L.celebrate.streakLine(streak) : L.celebrate.dayOne}
          </p>
          <p className="data mt-0.5 text-[0.9375rem] text-ink-muted">{L.celebrate.score(right, total)}</p>
        </div>

        <div className="mt-3 w-full border-t border-card-border pt-4 text-left">
          {mistakes.length === 0 ? (
            <p className="text-center text-[0.9375rem] text-safe-ink">{L.celebrate.allRight}</p>
          ) : (
            <>
              <p className="micro mb-2.5 text-ink-muted">{L.celebrate.mistakesTitle}</p>
              <ul className="flex flex-col gap-3">
                {mistakes.map((m) => (
                  <li key={m.id} className="flex flex-col gap-0.5">
                    <p className="truncate text-[1.0625rem] leading-[1.4375rem] text-ink">&ldquo;{m.text.replace(/\s+/g, " ")}&rdquo;</p>
                    <p className="text-[0.8125rem] leading-snug">
                      <span className={`font-semibold ${m.isScam ? "text-danger-ink" : "text-safe-ink"}`}>
                        {m.isScam ? L.scam : L.genuine}
                      </span>
                      <span className="text-ink-muted"> {reasonFor(m)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <button
          ref={buttonRef}
          type="button"
          onClick={close}
          className="btn pressable mt-4 w-full bg-primary text-on-primary"
        >
          {L.celebrate.keepGoing}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function Flame() {
  return (
    <svg viewBox="0 0 112 132" className="h-[132px] w-28 overflow-visible" aria-hidden="true">
      {/* Paths and colours copied from design/mockup/Streak.html. The grow,
          flicker and core keyframes live in app/globals.css and are disabled
          under prefers-reduced-motion. */}
      <g className="fl-flame-grow">
        <path
          className="fl-flame-outer"
          d="M56 6 C 70 30, 98 46, 98 82 C 98 110, 79 126, 56 126 C 33 126, 14 110, 14 82 C 14 60, 28 50, 34 34 C 40 48, 44 54, 50 56 C 48 36, 50 20, 56 6 Z"
          fill="#FF6A2B"
        />
        <path
          d="M56 44 C 64 60, 80 70, 80 92 C 80 110, 69 120, 56 120 C 43 120, 32 110, 32 92 C 32 78, 40 70, 44 60 C 48 70, 52 74, 56 74 C 54 62, 54 54, 56 44 Z"
          fill="#FF9F0A"
        />
        <path
          className="fl-flame-inner"
          d="M56 78 C 61 88, 68 94, 68 104 C 68 113, 62 118, 56 118 C 50 118, 44 113, 44 104 C 44 96, 50 90, 56 78 Z"
          fill="#FFD60A"
        />
      </g>
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 56 56" className="size-16 text-safe" aria-hidden="true">
      <circle className="fl-tick-circle" cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="3.5" />
      <path
        className="fl-tick-check"
        d="M17 29l7.5 7.5L39.5 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
