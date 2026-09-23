"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { analyzeMessage, checkSender, type ApiError } from "@/lib/api";
import { redact } from "@/lib/redact";
import type { AnalyzeResponse } from "@/lib/types";
import { useLanguage } from "./LanguageProvider";
import { useWaitStage, WaitFill, WaitStatus } from "./WaitProgress";
import { MessageCard, VerdictBanner } from "./result/parts";
import { IdentityCompare, LinkCheckPanel, signalTitle, WhatToDo, WhySection } from "./result/sections";
import ReportButton from "./result/ReportButton";
import { RetryIcon } from "./icons";

type Status = "idle" | "loading" | "error" | "done";

interface FormState {
  requester: string;
  channel: string;
  recipient: string;
  amount: string;
  message: string;
}

const EMPTY_FORM: FormState = { requester: "", channel: "", recipient: "", amount: "", message: "" };

/**
 * Turns the SafePay form into one message for the EXISTING /api/analyze
 * pipeline - no separate SafePay detection logic, per CLAUDE.md ("Domain-
 * matching logic ... must stay non-LLM and deterministic", "every new
 * feature must reuse existing backend logic where possible"). The free-text
 * `message` field (if any) is kept last and unmodified so MessageCard can
 * still highlight evidence in it verbatim.
 */
function buildMessage(f: FormState): string {
  const lines: string[] = [];
  if (f.requester.trim()) lines.push(`Claims to be from: ${f.requester.trim()}`);
  if (f.channel.trim()) lines.push(`Contacted via: ${f.channel.trim()}`);
  if (f.recipient.trim()) lines.push(`Asked to send payment to: ${f.recipient.trim()}`);
  if (f.amount.trim()) lines.push(`Amount requested: ${f.amount.trim()}`);
  if (f.message.trim()) lines.push(f.message.trim());
  return lines.join("\n");
}

interface SafePayResult {
  response: AnalyzeResponse;
  redacted: string;
  recipient: string;
  message: string;
  recipientReports?: number;
}

/** No redaction-restore mapping is kept here (unlike ResultView) - the ORIGINAL text stays in memory for display, only the redacted copy is ever sent. */
export default function SafePayFlow() {
  const { lang, copy } = useLanguage();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<SafePayResult | null>(null);
  const [reported, setReported] = useState<{ sender: string; reportCount: number } | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const loading = status === "loading";
  const waitPhase = "running" as const;
  const stage = useWaitStage(loading);

  function field<K extends keyof FormState>(key: K) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm((f) => ({ ...f, [key]: e.target.value }));
        if (status === "error") setStatus("idle");
      },
    };
  }

  async function submit() {
    const combined = buildMessage(form);
    if (!combined.trim()) {
      setError({ kind: "validation", reason: "invalid", message: copy.safepay.missingInput });
      setStatus("error");
      return;
    }

    const { redacted } = redact(combined);
    setStatus("loading");
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    const recipient = form.recipient.trim();
    const [analysis, senderCheck] = await Promise.all([
      analyzeMessage({ message: redacted, language: lang }, { signal: controller.signal }),
      recipient ? checkSender({ sender: recipient }) : Promise.resolve(null),
    ]);
    if (controller.signal.aborted) return;

    if (!analysis.ok) {
      if (analysis.error.kind === "aborted") return;
      setError(analysis.error);
      setStatus("error");
      return;
    }

    setResult({
      response: analysis.data,
      redacted,
      recipient,
      message: form.message.trim(),
      recipientReports: senderCheck?.ok ? senderCheck.data.reportCount : undefined,
    });
    setReported(undefined);
    setStatus("done");
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }

  function checkAnother() {
    setForm(EMPTY_FORM);
    setResult(null);
    setReported(undefined);
    setStatus("idle");
    setError(null);
  }

  const c = copy.safepay;
  const marks =
    result && result.message
      ? result.response.signals
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => typeof s.evidence === "string" && s.evidence.trim() !== "")
          .map(({ s, i }) => ({
            evidence: s.evidence as string,
            severity: s.severity,
            id: `sig-${i}`,
            label: signalTitle(s.type, copy, lang),
          }))
      : [];

  if (result) {
    const verdictLabel = result.response.verdict === "safe" ? c.okTitle : c.pauseTitle;
    return (
      <div className="gutter flex flex-col gap-4 pt-5">
        <div className="sheet">
          {form.amount.trim() && (
            <div className="px-5 pt-5">
              <p className="micro text-ink-muted">{c.amountHeading}</p>
              <p className="data mt-1 text-[1.75rem] font-semibold text-ink">{form.amount.trim()}</p>
            </div>
          )}
          <VerdictBanner response={result.response} label={verdictLabel} copy={copy} />
          {typeof result.recipientReports === "number" && result.recipientReports > 0 && (
            <div className="border-t border-card-border bg-danger-soft px-5 py-4">
              <p className="text-[0.9375rem] font-medium text-danger-ink">{c.recipientReportedLine(result.recipientReports)}</p>
            </div>
          )}
          {result.message && (
            <MessageCard text={result.message} marks={marks} verdict={result.response.verdict} copy={copy} />
          )}
          {result.response.verdict === "safe" ? (
            <p className="border-t border-card-border px-5 py-5 leading-relaxed text-ink-soft">{c.okBody}</p>
          ) : (
            <>
              <WhySection
                signals={result.response.signals}
                explanation={result.response.explanation}
                senderReports={result.response.senderReports}
                copy={copy}
                lang={lang}
                show={(s) => s}
              />
              <IdentityCompare response={result.response} copy={copy} />
              <LinkCheckPanel response={result.response} copy={copy} />
            </>
          )}
          <WhatToDo
            verdict={result.response.verdict}
            suggestedAction={result.response.suggestedAction}
            copy={copy}
            show={(s) => s}
          />
        </div>

        <ReportButton
          sender={result.recipient || result.response.sender}
          redacted={result.redacted}
          reported={reported}
          onReported={setReported}
          copy={copy}
        />

        <button
          type="button"
          onClick={checkAnother}
          className="pressable font-heading flex min-h-14 items-center justify-center bg-ink px-5 text-[1.0625rem] font-semibold tracking-[0.06em] text-on-ink uppercase hover:bg-ink-2"
        >
          {c.checkAnother}
        </button>
      </div>
    );
  }

  return (
    <div className="gutter flex flex-col gap-4 pt-7">
      <section className="flex flex-col gap-3">
        <h1>{c.title}</h1>
        <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-ink-soft">{c.intro}</p>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="sheet flex flex-col"
      >
        <FormField id="sp-requester" label={c.requesterLabel} placeholder={c.requesterPlaceholder} {...field("requester")} />
        <FormField id="sp-channel" label={c.channelLabel} placeholder={c.channelPlaceholder} {...field("channel")} />
        <FormField id="sp-recipient" label={c.recipientLabel} placeholder={c.recipientPlaceholder} {...field("recipient")} />
        <FormField id="sp-amount" label={c.amountLabel} placeholder={c.amountPlaceholder} {...field("amount")} />
        <FormField
          id="sp-message"
          label={c.messageLabel}
          placeholder={c.messagePlaceholder}
          multiline
          {...field("message")}
        />

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className={`pressable font-heading relative flex min-h-14 items-center justify-center overflow-hidden bg-ink px-5 text-[1.0625rem] font-semibold tracking-[0.06em] text-on-ink uppercase ${
            loading ? "cursor-progress" : "hover:bg-ink-2"
          }`}
        >
          <span>{c.submit}</span>
          {loading && (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 block h-0.5 overflow-hidden bg-on-ink/20">
              <WaitFill phase={waitPhase} stage={stage} className="bg-on-ink" />
            </span>
          )}
        </button>
      </form>

      {loading && (
        <div className="flex items-start gap-4 border-l-2 border-l-accent bg-card px-4 py-3.5">
          <WaitStatus phase={waitPhase} stage={stage} labels={copy.wait.check} progressLabel={copy.wait.progressLabel} />
          <button
            type="button"
            onClick={cancel}
            className="pressable micro -mr-1 min-h-9 shrink-0 px-2 text-ink-muted hover:bg-muted-surface hover:text-ink"
          >
            {copy.wait.cancel}
          </button>
        </div>
      )}

      {status === "error" && error && (
        <div role="alert" className="flex flex-col gap-3 border-l-2 border-l-caution bg-caution-soft p-4">
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{error.message}</p>
          <button
            type="button"
            onClick={() => void submit()}
            className="pressable micro flex min-h-10 w-fit items-center gap-2 bg-ink px-4 text-on-ink hover:bg-ink-2"
          >
            <RetryIcon className="size-3.5" strokeWidth={2} />
            {copy.retry}
          </button>
        </div>
      )}

      <Link href="/" className="micro w-fit text-accent-ink underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
        {c.back}
      </Link>
    </div>
  );
}

function FormField({
  id,
  label,
  placeholder,
  value,
  onChange,
  multiline,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 not-first:border-t not-first:border-card-border">
      <label htmlFor={id} className="micro text-ink-muted">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="block w-full resize-none border-0 bg-transparent p-0 text-[1rem] leading-relaxed text-ink outline-none placeholder:text-ink-muted/60"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="block w-full border-0 bg-transparent p-0 text-[1rem] text-ink outline-none placeholder:text-ink-muted/60"
        />
      )}
    </div>
  );
}
