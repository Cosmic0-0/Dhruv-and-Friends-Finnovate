"use client";

import { RECENT_LIMIT, type RecentCheck } from "@/lib/storage";
import { useLanguage } from "./LanguageProvider";
import { ArrowDownLeftIcon, CheckIcon, WarningIcon } from "./icons";
import type { Verdict } from "@/lib/types";

/**
 * The Recent list (frontend/design/mockup/Main.html): a tinted verdict circle,
 * the message, and the verdict with its age on the right.
 *
 * Only redacted text is ever stored, so the row title is the start of the
 * redacted message rather than a tidy summary. The mockup's short titles
 * ("Account blocked") are not something the data can supply, and inventing one
 * would mean showing the user words they did not receive.
 *
 * Checks are passed in rather than read here: the Check screen already reads
 * localStorage once for the week counts, and one read keeps the list and the
 * counts describing the same history.
 */

const TONE: Record<Verdict, { bg: string; fg: string; Icon: typeof CheckIcon }> = {
  scam: { bg: "bg-danger-soft", fg: "text-danger-ink", Icon: ArrowDownLeftIcon },
  suspicious: { bg: "bg-caution-soft", fg: "text-caution-ink", Icon: WarningIcon },
  safe: { bg: "bg-safe-soft", fg: "text-safe-ink", Icon: CheckIcon },
};

export default function RecentChecks({ checks, now }: { checks: RecentCheck[]; now: number }) {
  const { copy } = useLanguage();
  const shown = checks.slice(0, RECENT_LIMIT);

  return (
    <section className="sheet" aria-labelledby="recent-title">
      <div className="px-5 pt-4 pb-1">
        <h2 id="recent-title" className="micro text-ink-muted">
          {copy.check.recent.title}
        </h2>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-4 text-[0.9375rem] text-ink-muted">{copy.check.recent.empty}</p>
      ) : (
        <ul className="flex flex-col px-5 pb-1 [&>li+li]:border-t [&>li+li]:border-card-border">
          {shown.map((c) => {
            const { bg, fg, Icon } = TONE[c.verdict];
            return (
              <li key={c.id} className="flex items-center gap-3 py-[13px]">
                <span className={`flex size-[34px] shrink-0 items-center justify-center rounded-full ${bg} ${fg}`}>
                  <Icon className="size-[17px]" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[1.0625rem] text-ink">
                  {c.text.replace(/\s+/g, " ").trim()}
                </span>
                <span className="shrink-0 text-right text-[0.9375rem] text-ink-muted">
                  {copy.check.recent.short[c.verdict]}
                  {/* now is 0 until the client has mounted, so the server and
                      first client render agree on the text. */}
                  {now > 0 && `, ${copy.relativeTime(Math.max(0, now - c.at))}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
