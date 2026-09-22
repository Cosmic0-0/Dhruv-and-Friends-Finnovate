import type { Copy, UiLanguage } from "@/lib/i18n";
import {
  actionPlan,
  humanizeType,
  parseLinkCheck,
  SEVERITY_RANK,
  signalKind,
  sortSignals,
  type SafeCheckKey,
} from "@/lib/result";
import type { AnalyzeResponse, Severity, Signal, Verdict } from "@/lib/types";
import { CheckIcon, LinkIcon } from "../icons";
import { SectionLabel } from "./parts";

const SEVERITY_RULE: Record<Severity, string> = {
  high: "bg-danger",
  medium: "bg-caution",
  low: "bg-ink-muted/35",
};

/** Wash + darkened text, so the chip stays legible at label size. */
const SEVERITY_CHIP: Record<Severity, string> = {
  high: "bg-danger-soft text-danger-ink",
  medium: "bg-caution-soft text-caution-ink",
  low: "bg-muted-surface text-ink-muted",
};

/** A human title for any signal type. Unknown types never show as snake_case. */
export function signalTitle(type: string, copy: Copy, lang: UiLanguage): string {
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

/** AI-attributed sources: the LLM's own reasoning, whether it's quoting message text or inferring a pattern. */
function isAiSource(source: Signal["source"]): boolean {
  return source === undefined || source === "message_text" || source === "llm_analysis";
}

/** Non-LLM, deterministic checks (domain matching, identity consistency). */
function isDeterministicSource(source: Signal["source"]): boolean {
  return source === "url_parser" || source === "identity_check";
}

type IndexedSignal = Signal & { _idx: number };

/** One evidence row, shared by every group below. `_idx` (original signals[] position) anchors it for Scam X-Ray's click-to-jump. */
function EvidenceRow({ s, n, copy, lang, show }: { s: IndexedSignal; n: number; copy: Copy; lang: UiLanguage; show: (t: string) => string }) {
  return (
    <li id={`sig-${s._idx}`} className="flex scroll-mt-4 gap-3.5 px-5 py-4 not-first:border-t not-first:border-card-border">
      <span aria-hidden="true" className={`mt-1 w-0.5 shrink-0 self-stretch ${SEVERITY_RULE[s.severity]}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="font-sans text-[1.0625rem] leading-snug font-semibold text-ink">
            <span aria-hidden="true" className="data mr-2 text-ink-muted">
              {String(n).padStart(2, "0")}
            </span>
            {signalTitle(s.type, copy, lang)}
          </h4>
          <span className={`micro shrink-0 px-1.5 py-1 ${SEVERITY_CHIP[s.severity]}`}>{copy.result.severity[s.severity]}</span>
        </div>
        <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{signalDescription(s, copy, show)}</p>
      </div>
    </li>
  );
}

/** One evidence-source group ("AI analysis", "Deterministic checks", ...): a subheading plus its rows, numbered continuously from `startAt`. */
function EvidenceGroup({
  title,
  items,
  startAt,
  copy,
  lang,
  show,
}: {
  title: string;
  items: IndexedSignal[];
  startAt: number;
  copy: Copy;
  lang: UiLanguage;
  show: (s: string) => string;
}) {
  if (items.length === 0) return null;
  const maxSeverity = items.reduce<Severity>((max, s) => (SEVERITY_RANK[s.severity] > SEVERITY_RANK[max] ? s.severity : max), "low");
  return (
    <div className="border-t border-card-border">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-1">
        <p className="micro text-ink-muted">{title}</p>
        <span className={`micro ${SEVERITY_CHIP[maxSeverity]} px-1.5 py-0.5`}>{copy.result.severity[maxSeverity]}</span>
      </div>
      <ul className="flex flex-col">
        {items.map((s, i) => (
          <EvidenceRow key={`sig-${s._idx}`} s={s} n={startAt + i} copy={copy} lang={lang} show={show} />
        ))}
      </ul>
    </div>
  );
}

/**
 * "Why FraudLens flagged this" — signals grouped by their independent
 * evidence source (AI reasoning vs. deterministic, non-LLM checks), plus a
 * community-intelligence row from the crowdsourced report count. Never shows
 * a section for data the backend didn't actually return (no campaign
 * intelligence yet - see docs/API-CONTRACT.md).
 */
export function WhySection({
  signals,
  explanation,
  senderReports,
  copy,
  lang,
  show,
}: {
  signals: Signal[];
  explanation: string;
  /** Crowdsourced report count for the message's sender, if one was identified. */
  senderReports?: number;
  copy: Copy;
  lang: UiLanguage;
  show: (s: string) => string;
}) {
  const indexed: IndexedSignal[] = signals.map((s, i) => ({ ...s, _idx: i }));
  const sorted = sortSignals(indexed);
  const aiSignals = sorted.filter((s) => isAiSource(s.source));
  const deterministicSignals = sorted.filter((s) => isDeterministicSource(s.source));
  const hasCommunity = typeof senderReports === "number" && senderReports > 0;

  const groupsPresent = [aiSignals.length > 0, deterministicSignals.length > 0, hasCommunity].filter(Boolean).length;

  return (
    <section aria-labelledby="why-label">
      <div className="flex flex-col gap-2.5 px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel id="why-label">{copy.result.evidence.title}</SectionLabel>
          {sorted.length > 0 && <span className="data text-ink-muted">{String(sorted.length).padStart(2, "0")}</span>}
        </div>
        {/* Only claim agreement when there's actually more than one independent source. */}
        {groupsPresent >= 2 && <p className="text-[0.9375rem] font-medium text-ink">{copy.result.evidence.sourcesAgree(groupsPresent)}</p>}
        {explanation && <p className="leading-relaxed text-ink-soft">{show(explanation)}</p>}
      </div>
      <EvidenceGroup title={copy.result.evidence.aiTitle} items={aiSignals} startAt={1} copy={copy} lang={lang} show={show} />
      <EvidenceGroup
        title={copy.result.evidence.deterministicTitle}
        items={deterministicSignals}
        startAt={aiSignals.length + 1}
        copy={copy}
        lang={lang}
        show={show}
      />
      {hasCommunity && (
        <div className="flex items-center justify-between gap-3 border-t border-card-border px-5 py-4">
          <p className="micro text-ink-muted">{copy.result.evidence.communityTitle}</p>
          <p className="text-[0.9375rem] font-medium text-ink">{copy.result.evidence.communityLine(senderReports as number)}</p>
        </div>
      )}
    </section>
  );
}

/**
 * "Claimed vs. actual" — the specific institution-impersonation story from an
 * IDENTITY_MISMATCH signal's structured fields (backend/src/services/
 * identity-consistency), shown as a direct comparison rather than prose.
 * Renders nothing if no such signal is present.
 */
export function IdentityCompare({ response, copy }: { response: AnalyzeResponse; copy: Copy }) {
  const mismatch = response.signals.find((s) => s.type === "IDENTITY_MISMATCH" && s.claimedIdentity);
  if (!mismatch) return null;

  const rows: Array<{ label: string; value: string; flagged?: boolean }> = [
    { label: copy.result.identity.claimsToBe, value: mismatch.claimedIdentity as string },
  ];
  if (mismatch.officialDomain) rows.push({ label: copy.result.identity.officialSite, value: mismatch.officialDomain });
  if (mismatch.actualDomain) rows.push({ label: copy.result.identity.linksTo, value: mismatch.actualDomain, flagged: true });
  if (mismatch.beneficiary) rows.push({ label: copy.result.identity.paysTo, value: mismatch.beneficiary, flagged: true });

  return (
    <section className="flex flex-col gap-3 px-5 py-5" aria-labelledby="identity-label">
      <SectionLabel id="identity-label">{copy.result.identity.title}</SectionLabel>
      <dl className="flex flex-col divide-y divide-card-border border-y border-card-border">
        {rows.map((r, i) => (
          <div
            key={i}
            className={`flex items-baseline justify-between gap-4 py-2.5 ${r.flagged ? "bg-danger-soft px-2" : ""}`}
          >
            <dt className="shrink-0 text-sm text-ink-muted">{r.label}</dt>
            <dd
              className={`data min-w-0 text-right font-medium [overflow-wrap:anywhere] ${r.flagged ? "text-danger-ink" : "text-ink"}`}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[0.8125rem] leading-relaxed text-ink-muted">{copy.result.identity.caveat}</p>
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

  // The LLM's own reasoning and the deterministic checkUrls() check can both
  // flag the same URL, producing two lookalike_url signals for one host -
  // collapse them to one row per host instead of showing the same link
  // twice. Keeps the first resembles/domainAgeDays value seen for a host.
  const byHost = new Map<string, { resembles: ReturnType<typeof parseLinkCheck>["resembles"]; domainAgeDays?: number }>();
  for (const s of lookalikes) {
    const { host, resembles } = parseLinkCheck(s);
    if (!host) continue;
    const existing = byHost.get(host);
    const domainAgeDays =
      existing?.domainAgeDays ??
      (typeof s.domainAgeDays === "number" && Number.isFinite(s.domainAgeDays) && s.domainAgeDays >= 0
        ? s.domainAgeDays
        : undefined);
    byHost.set(host, { resembles: existing?.resembles ?? resembles, domainAgeDays });
  }

  const rows: Array<{ label: string; value: string; mono?: boolean }> = [];
  for (const [host, { resembles, domainAgeDays }] of byHost) {
    rows.push({ label: copy.result.linkCheck.linkInMessage, value: host, mono: true });
    if (resembles)
      rows.push({ label: copy.result.linkCheck.imitates, value: resembles.value, mono: resembles.kind === "domain" });
    if (domainAgeDays !== undefined) {
      rows.push({ label: copy.result.linkCheck.domainAge, value: copy.result.linkCheck.domainAgeValue(Math.floor(domainAgeDays)) });
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
    <section className="flex flex-col gap-3 px-5 py-5" aria-labelledby="linkcheck-label">
      <div className="flex items-center gap-2">
        <LinkIcon className="size-3.5 text-ink-muted" strokeWidth={2} />
        <SectionLabel id="linkcheck-label">{copy.result.linkCheck.title}</SectionLabel>
      </div>
      {/* Deterministic, non-LLM matcher output — presented as looked-up data,
          which is why the values are monospaced rather than set as prose. */}
      <dl className="flex flex-col divide-y divide-card-border border-y border-card-border">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-sm text-ink-muted">{r.label}</dt>
            <dd
              className={`min-w-0 text-right text-ink [overflow-wrap:anywhere] ${
                r.mono ? "data font-medium" : "text-[0.9375rem] font-semibold"
              }`}
            >
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
    <section className="flex flex-col gap-4 bg-accent-soft px-5 py-5" aria-labelledby="todo-label">
      <h2 id="todo-label" className="text-[1.5rem] leading-tight text-accent-ink">
        {copy.result.whatToDoTitle}
      </h2>
      {/* The model's own advice (when suggestedAction is a sentence) leads; the fixed steps follow. */}
      {prose && <p className="text-[0.9375rem] leading-relaxed text-ink">{show(prose)}</p>}
      <ol className="flex flex-col">
        {steps.map((k) => copy.result.steps[k]).map((text, i) => (
          <li key={i} className="flex gap-3.5 border-t border-accent/20 py-3 first:border-t-0 first:pt-0 last:pb-0">
            <span aria-hidden="true" className="data mt-0.5 shrink-0 font-medium text-accent-ink">
              {String(i + 1).padStart(2, "0")}
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
    <section aria-labelledby="checked-label">
      <div className="flex flex-col gap-2.5 px-5 pt-5 pb-4">
        <SectionLabel id="checked-label">{copy.result.whatWeCheckedTitle}</SectionLabel>
        {explanation && <p className="leading-relaxed text-ink-soft">{show(explanation)}</p>}
      </div>
      {checks.length > 0 && (
        <ul className="flex flex-col border-t border-card-border">
          {checks.map((k) => (
            <li key={k} className="flex items-start gap-3 px-5 py-3 not-first:border-t not-first:border-card-border">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.5} />
              <span className="text-[0.9375rem] leading-snug text-ink">{copy.result.checks[k]}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-card-border bg-muted-surface px-5 py-4 text-sm leading-relaxed text-ink-muted">
        {copy.result.safeCaveat}
      </p>
    </section>
  );
}
