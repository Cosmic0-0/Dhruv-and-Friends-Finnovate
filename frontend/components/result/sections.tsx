import type { Copy, UiLanguage } from "@/lib/i18n";
import {
  actionPlan,
  humanizeType,
  parseLinkCheck,
  signalKind,
  sortSignals,
  type SafeCheckKey,
} from "@/lib/result";
import type { AnalyzeResponse, Severity, Signal, Verdict } from "@/lib/types";
import { CheckIcon, LinkIcon } from "../icons";
import { SectionLabel } from "./parts";

const SEVERITY_BORDER: Record<Severity, string> = {
  high: "border-l-danger",
  medium: "border-l-caution-bright",
  low: "border-l-ink-muted/40",
};

const SEVERITY_TEXT: Record<Severity, string> = {
  high: "text-danger",
  medium: "text-caution",
  low: "text-ink-muted",
};

/** A human title for any signal type. Unknown types never show as snake_case. */
function signalTitle(type: string, copy: Copy, lang: UiLanguage): string {
  const kind = signalKind(type);
  if (kind) return copy.result.signalTitles[kind];
  // Humanized type words are English (they come from the model), so other languages use the generic title.
  return (lang === "en" && humanizeType(type)) || copy.result.genericSignal;
}

/**
 * Lookalike descriptions come from the backend's deterministic matcher in
 * developer wording ("contains brand token …"), always in English. When they
 * parse, show a plain localized sentence; otherwise keep the original text.
 */
function signalDescription(s: Signal, copy: Copy, show: (t: string) => string): string {
  if (signalKind(s.type) === "lookalike_url") {
    const { host, resembles } = parseLinkCheck(s);
    if (host && resembles?.kind === "domain") return copy.result.lookalikeDomain(host, resembles.value);
    if (host && resembles?.kind === "brand") return copy.result.lookalikeBrand(host, resembles.value);
  }
  return show(s.description);
}

export function WhySection({
  signals,
  explanation,
  copy,
  lang,
  show,
}: {
  signals: Signal[];
  explanation: string;
  copy: Copy;
  lang: UiLanguage;
  show: (s: string) => string;
}) {
  const sorted = sortSignals(signals);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="why-label">
      <SectionLabel id="why-label">{copy.result.whyTitle}</SectionLabel>
      {explanation && <p className="leading-relaxed text-ink-soft">{show(explanation)}</p>}
      {sorted.length > 0 && (
        <ul className="flex flex-col gap-3">
          {sorted.map((s, i) => (
            <li key={`${s.type}-${i}`} className={`card flex flex-col gap-1.5 border-l-4 p-5 ${SEVERITY_BORDER[s.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-sans text-[1.0625rem] leading-snug font-semibold text-ink">
                  {signalTitle(s.type, copy, lang)}
                </h3>
                <span
                  className={`mt-0.5 shrink-0 text-[0.6875rem] font-semibold tracking-wide uppercase ${SEVERITY_TEXT[s.severity]}`}
                >
                  {copy.result.severity[s.severity]}
                </span>
              </div>
              <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{signalDescription(s, copy, show)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Rows only for data that exists: no placeholders, no "unknown".
 * DEMO NOTE: this is the deterministic, non-LLM domain-matching result
 * (backend/src/services/domain-matching), shown as structured data.
 */
export function LinkCheckPanel({ response, copy }: { response: AnalyzeResponse; copy: Copy }) {
  const lookalikes = response.signals.filter((s) => signalKind(s.type) === "lookalike_url");
  if (lookalikes.length === 0) return null;

  const rows: Array<{ label: string; value: string; mono?: boolean }> = [];
  for (const s of lookalikes) {
    const { host, resembles } = parseLinkCheck(s);
    if (host) rows.push({ label: copy.result.linkCheck.linkInMessage, value: host, mono: true });
    if (resembles)
      rows.push({ label: copy.result.linkCheck.imitates, value: resembles.value, mono: resembles.kind === "domain" });
    if (typeof s.domainAgeDays === "number" && Number.isFinite(s.domainAgeDays) && s.domainAgeDays >= 0) {
      rows.push({ label: copy.result.linkCheck.domainAge, value: copy.result.linkCheck.domainAgeValue(Math.floor(s.domainAgeDays)) });
    }
  }
  if (typeof response.senderReports === "number" && response.senderReports > 0) {
    rows.push({
      label: copy.result.linkCheck.reportedByOthers,
      value: copy.result.linkCheck.reportedValue(Math.floor(response.senderReports)),
    });
  }
  if (rows.length === 0) return null;

  return (
    <section className="card flex flex-col gap-4" aria-labelledby="linkcheck-label">
      <div className="flex items-center gap-2">
        <LinkIcon className="size-4 text-ink-muted" strokeWidth={2} />
        <SectionLabel id="linkcheck-label">{copy.result.linkCheck.title}</SectionLabel>
      </div>
      <dl className="flex flex-col divide-y divide-card-border">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <dt className="shrink-0 text-sm text-ink-muted">{r.label}</dt>
            <dd className={`min-w-0 text-right text-[0.9375rem] font-semibold text-ink [overflow-wrap:anywhere] ${r.mono ? "font-mono text-[0.875rem]" : ""}`}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function WhatToDo({
  verdict,
  suggestedAction,
  copy,
  show,
}: {
  verdict: Verdict;
  suggestedAction: string;
  copy: Copy;
  show: (s: string) => string;
}) {
  const { steps, prose } = actionPlan(verdict, suggestedAction);
  if (steps.length === 0 && !prose) return null;
  return (
    <section className="flex flex-col gap-4 rounded-card border border-safe/15 bg-safe-soft p-6" aria-labelledby="todo-label">
      <h2 id="todo-label" className="text-[1.5rem] leading-tight text-safe">
        {copy.result.whatToDoTitle}
      </h2>
      {/* The model's own advice (when suggestedAction is a sentence) leads; the fixed steps follow. */}
      {prose && <p className="text-[0.9375rem] leading-relaxed text-ink">{show(prose)}</p>}
      <ol className="flex flex-col gap-3">
        {steps.map((k) => copy.result.steps[k]).map((text, i) => (
          <li key={i} className="flex gap-3">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-safe text-[0.75rem] font-semibold text-white"
            >
              {i + 1}
            </span>
            <span className="text-[0.9375rem] leading-relaxed text-ink">{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SafeChecklist({
  checks,
  explanation,
  copy,
  show,
}: {
  checks: SafeCheckKey[];
  explanation: string;
  copy: Copy;
  show: (s: string) => string;
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="checked-label">
      <SectionLabel id="checked-label">{copy.result.whatWeCheckedTitle}</SectionLabel>
      {explanation && <p className="leading-relaxed text-ink-soft">{show(explanation)}</p>}
      {checks.length > 0 && (
        <ul className="card flex flex-col gap-3.5">
          {checks.map((k) => (
            <li key={k} className="flex items-start gap-3">
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-safe-soft text-safe">
                <CheckIcon className="size-4" strokeWidth={2.5} />
              </span>
              <span className="text-[0.9375rem] leading-snug text-ink">{copy.result.checks[k]}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="rounded-card bg-muted-surface px-4 py-3.5 text-sm leading-relaxed text-ink-muted">
        {copy.result.safeCaveat}
      </p>
    </section>
  );
}
