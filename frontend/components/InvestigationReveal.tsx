"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "./icons";

/**
 * The "FraudLens investigated" checklist, shown once a response has
 * actually arrived (CheckForm's "finishing" phase, right before the result
 * screen takes over). `steps` is built by lib/result.ts's revealSteps from
 * fields this exact response has — this component only ever reveals lines
 * it's handed, one at a time, for a brief "the system is showing its work"
 * beat. It never claims progress before the response exists.
 */
export default function InvestigationReveal({ heading, steps }: { heading: string; steps: string[] }) {
  const [shown, setShown] = useState(Math.min(1, steps.length));

  useEffect(() => {
    if (shown >= steps.length) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => setShown((n) => n + 1), reduced ? 0 : 160);
    return () => clearTimeout(id);
  }, [shown, steps.length]);

  if (steps.length === 0) return null;

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2.5">
      <p className="micro text-ink-muted">{heading}</p>
      <ul className="flex flex-col gap-1.5">
        {steps.slice(0, shown).map((step, i) => (
          <li key={i} className="flex items-center gap-2.5 text-sm text-ink-soft">
            <CheckIcon className="size-4 shrink-0 text-accent-ink" strokeWidth={2.25} />
            <span>{step}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
