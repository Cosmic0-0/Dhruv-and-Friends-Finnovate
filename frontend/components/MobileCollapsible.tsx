"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A section that's collapsed by default on a phone screen and expanded by
 * default at `openAt` (desktop, where ResultView's multi-region grid already
 * gives each block its own space) — Phase 13C's progressive disclosure: lead
 * with the verdict and what to do, let evidence/identity/journey be opened
 * on demand rather than forcing a long scroll through everything at once.
 *
 * Built on native <details>/<summary> (same pattern as SentPanel in
 * result/parts.tsx) so it's keyboard- and screen-reader-accessible with no
 * extra ARIA wiring, and works with JS disabled (just defaults closed then).
 * The desktop-open state is set with useLayoutEffect, synchronously before
 * paint, so there's no visible flash between "closed" and "open" on load.
 */
export default function MobileCollapsible({
  summary,
  children,
  openAt = "(min-width: 64rem)",
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  openAt?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useLayoutEffect(() => {
    if (ref.current && window.matchMedia(openAt).matches) ref.current.open = true;
  }, [openAt]);

  return (
    <details ref={ref} className="group">
      <summary className="pressable flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-ink hover:bg-muted-surface">
        {summary}
        <span aria-hidden="true" className="micro shrink-0 text-ink-muted group-open:hidden">
          +
        </span>
        <span aria-hidden="true" className="micro hidden shrink-0 text-ink-muted group-open:inline">
          −
        </span>
      </summary>
      {children}
    </details>
  );
}
