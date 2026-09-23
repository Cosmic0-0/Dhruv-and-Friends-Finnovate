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
    <div ref={rootRef} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Swallows clicks so nothing behind can be reached; dismissal is Esc or the button only. */}
      <div className="fl-scrim absolute inset-0 bg-[var(--c-scrim)]" data-closing={closing || undefined} aria-hidden="true" />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebrate-title"
        aria-describedby="celebrate-line"
        data-closing={closing || undefined}
        className="fl-card relative flex max-h-[88dvh] w-full max-w-[380px] flex-col items-center gap-4 overflow-y-auto border border-line-strong bg-card px-6 pt-7 pb-6 text-center"
      >
        {streak >= 2 ? <Flame /> : <Tick />}
        <div className="flex flex-col gap-1.5">
          <h2 id="celebrate-title" className="text-[2.5rem] leading-none">
            {L.celebrate.title(streak)}
          </h2>
          <p id="celebrate-line" className="text-[0.9375rem] text-ink-soft">
            {streak >= 2 ? L.celebrate.streakLine(streak) : L.celebrate.dayOne}
          </p>
          <p className="data mt-1 text-ink">{L.celebrate.score(right, total)}</p>
        </div>

        <div className="w-full border-t border-card-border pt-4 text-left">
          {mistakes.length === 0 ? (
            <p className="text-center text-[0.9375rem] text-accent-ink">{L.celebrate.allRight}</p>
          ) : (
            <>
              <p className="micro mb-3 text-ink-muted">
                {L.celebrate.mistakesTitle}
              </p>
              <ul className="flex flex-col gap-3">
                {mistakes.map((m) => (
                  <li key={m.id} className="flex flex-col gap-0.5">
                    <p className="data truncate border-l-2 border-l-card-border pl-2 text-ink-soft">&ldquo;{m.text.replace(/\s+/g, " ")}&rdquo;</p>
                    <p className="text-[0.8125rem] leading-snug">
                      <span className={`font-semibold ${m.isScam ? "text-danger-ink" : "text-accent-ink"}`}>
                        {m.isScam ? L.scam : L.genuine}
                      </span>
                      <span className="text-ink-muted"> · {reasonFor(m)}</span>
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
          className="pressable font-heading mt-1 flex min-h-14 w-full items-center justify-center bg-surface-dark px-5 text-[1.0625rem] font-semibold tracking-[0.06em] text-on-ink uppercase hover:bg-surface-dark-2"
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
    <svg viewBox="0 0 64 80" className="h-20 w-16" aria-hidden="true">
      <defs>
        <linearGradient id="fl-flame-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--color-caution)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-danger)" }} />
        </linearGradient>
      </defs>
      <g className="fl-flame fl-flame-grow">
        <path
          className="fl-flame fl-flame-outer"
          fill="url(#fl-flame-grad)"
          d="M32 3C37 17 53 27 53 49c0 16-9.4 27-21 27S11 65 11 49c0-11 6-19 10.5-26 1.6 8.5 5 13 9.5 15.5C29 27 27.5 14 32 3z"
        />
        <path
          className="fl-flame fl-flame-inner"
          style={{ fill: "var(--color-caution-soft)" }}
          d="M32 36c3.6 9 11 14.5 11 24 0 8.6-5 14-11 14s-11-5.4-11-14c0-6.8 4.2-11.2 7-16.5 1 4.6 2.8 7 5 8.3-1-5.2-1.6-10.3-1-15.8z"
        />
      </g>
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 56 56" className="size-16 text-accent" aria-hidden="true">
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
