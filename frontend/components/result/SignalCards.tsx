import type { Copy, UiLanguage } from "@/lib/i18n";
import { parseLinkCheck, signalKind, sortSignals } from "@/lib/result";
import type { AnalyzeResponse, Severity, Signal } from "@/lib/types";
import { signalTitle } from "./sections";

/**
 * The two-card row on a flagged result (design/mockup/Result-Scam.png):
 * "What's wrong" with a ring and the signal list, and "The link" beside it.
 */

/**
 * Ring segments. ONE SEGMENT PER SIGNAL, ALL THE SAME SIZE.
 *
 * The mockup draws arcs of decreasing length, which would imply a per-signal
 * weight ("this one is 33% of the risk"). The API gives severity, not weight,
 * so sizing arcs that way would be inventing a number. Equal segments coloured
 * by severity say exactly what is known: how many signals, and how serious
 * each one is.
 */
const RING: Record<Severity, string> = {
  high: "var(--color-danger)",
  medium: "var(--color-caution)",
  low: "#8E8E93",
};

/** The list's leading dot, matching its ring segment. */
const DOT: Record<Severity, string> = {
  high: "bg-danger",
  medium: "bg-caution",
  low: "bg-icon-idle",
};

export function WhatsWrongCard({
  signals,
  copy,
  lang,
}: {
  signals: Signal[];
  copy: Copy;
  lang: UiLanguage;
}) {
  const sorted = sortSignals(signals);
  const n = sorted.length;
  if (n === 0) return null;

  const R = 62.5;
  const circumference = 2 * Math.PI * R;
  // A hairline gap between segments so adjacent same-severity signals still
  // read as two.
  const gap = n > 1 ? 4 : 0;
  const seg = circumference / n - gap;

  return (
    <section className="card col-span-7 flex flex-col gap-3 px-3.5 pt-[18px] pb-3.5">
      <h2 className="micro px-1 text-ink-muted">{copy.result.whatsWrong}</h2>

      <div className="relative size-35 self-center">
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
          {sorted.map((s, i) => (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={RING[s.severity]}
              strokeWidth="15"
              strokeDasharray={`${seg} ${circumference - seg}`}
              strokeDashoffset={-i * (seg + gap)}
              transform="rotate(-90 70 70)"
            />
          ))}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="data text-[1.625rem] font-bold text-ink">{n}</span>
          <span className="text-[0.8125rem] text-ink-muted">{copy.result.signsUnit(n)}</span>
        </span>
      </div>

      <ul className="flex flex-col">
        {sorted.map((s, i) => (
          <li
            key={i}
            // The most serious one is the row the eye should land on first.
            className={`flex items-center gap-2 rounded-[10px] px-2 py-[7px] ${i === 0 ? "bg-muted-surface" : ""}`}
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[s.severity]}`} />
            <span className={`flex-1 text-[0.875rem] leading-[1.125rem] text-ink ${i === 0 ? "font-semibold" : ""}`}>
              {signalTitle(s.type, copy, lang)}
            </span>
            <span className="shrink-0 text-[0.75rem] text-ink-muted">{copy.result.severity[s.severity]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "The link" — only when a lookalike link was actually found, and the domain
 * age only when the signal carried one. Nothing here is inferred.
 */
export function LinkCard({ response, copy }: { response: AnalyzeResponse; copy: Copy }) {
  const lookalike = response.signals.find((s) => signalKind(s.type) === "lookalike_url");
  if (!lookalike) return null;

  const { host, resembles } = parseLinkCheck(lookalike);
  const shown = lookalike.domain ?? host;
  if (!shown) return null;

  const official = lookalike.officialDomain ?? (resembles?.kind === "domain" ? resembles.value : undefined);
  const age = lookalike.domainAgeDays;
  const hasAge = typeof age === "number" && Number.isFinite(age) && age >= 0;

  return (
    <section className="card col-span-5 flex flex-col gap-1.5">
      <h2 className="micro text-ink-muted">{copy.result.theLink}</h2>
      {hasAge && (
        <p className="mt-1.5 flex items-baseline gap-1.5">
          <span className="data text-[2.75rem] leading-none font-bold text-ink">{Math.floor(age)}</span>
          <span className="text-[0.9375rem] text-ink-muted">{copy.result.daysOld(Math.floor(age))}</span>
        </p>
      )}
      <p className="mt-2.5 text-[0.9375rem] leading-5 text-ink [overflow-wrap:anywhere]">{shown}</p>
      {official && (
        <p className="text-[0.8125rem] leading-[1.125rem] text-ink-muted [overflow-wrap:anywhere]">
          {copy.result.realSite(official)}
        </p>
      )}
    </section>
  );
}

/**
 * The genuine-result counterpart (design/mockup/Result-Genuine.png): how many
 * links the message contains.
 *
 * Counted locally from the user's own text with the same regex safeChecks()
 * already uses for its "no link" tick — not an API field, because the contract
 * has none. A local count of the user's own words is a fact the device can
 * stand behind; a number attributed to the backend would not be.
 */
const LINK_RE =
  /\bhttps?:\/\/\S+|\bwww\.\S+|\b(?:[a-z0-9-]+\.)+(?:com|mu|net|org|info|io|co|top|xyz|win|link|app|site|online)\b/gi;

export function countLinks(text: string): number {
  return (text.match(LINK_RE) ?? []).length;
}

export function LinksCard({ text, copy }: { text: string; copy: Copy }) {
  const n = countLinks(text);
  return (
    <section className="card col-span-5 flex flex-col gap-1.5">
      <h2 className="micro text-ink-muted">{copy.result.linksTitle}</h2>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="data text-[2.75rem] leading-none font-bold text-ink">{n}</span>
        <span className="text-[0.9375rem] text-ink-muted">{copy.result.linksToTap(n)}</span>
      </p>
      {n === 0 && (
        <p className="mt-2 text-[0.9375rem] leading-5 text-ink-muted">{copy.result.noLinkBody}</p>
      )}
    </section>
  );
}
