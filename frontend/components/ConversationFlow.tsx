"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { analyzeMessage, type ApiError } from "@/lib/api";
import { redact, restore } from "@/lib/redact";
import { MAX_MESSAGE_LENGTH, type AnalyzeResponse } from "@/lib/types";
import { furthestJourney } from "@/lib/conversation";
import { useLanguage } from "./LanguageProvider";
import ScamJourney from "./result/ScamJourney";
import { useWaitStage, WaitStatus } from "./WaitProgress";

interface Entry { message: string; response: AnalyzeResponse }
const tones = { safe: "border-accent bg-accent-soft text-accent-ink", suspicious: "border-caution bg-caution-soft text-caution-ink", scam: "border-danger bg-danger-soft text-danger-ink" };

/** DEMO: add an introduction, urgent warning, then OTP request. The sidebar
 * keeps the furthest observed stage even if a later message is less advanced.
 * Inference is per message, via the core transport; test model reachability before demo. */
export default function ConversationFlow() {
  const { copy, lang } = useLanguage();
  const c = copy.conversation;
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stage = useWaitStage(loading);
  const latest = useRef<HTMLElement | null>(null);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { if (entries.length) { latest.current?.scrollIntoView({ block: "nearest" }); composer.current?.focus({ preventScroll: true }); } }, [entries.length]);

  const furthest = furthestJourney(entries.map((entry) => entry.response));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading || !message.trim() || message.length > MAX_MESSAGE_LENGTH) return;
    const original = message.trim();
    const { redacted, redactions } = redact(original);
    if (redacted.length > MAX_MESSAGE_LENGTH) {
      setError({ kind: "validation", reason: "message_too_long", message: copy.tooLong });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError(null);
    const result = await analyzeMessage({ message: redacted, language: lang }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setEntries((previous) => [...previous, { message: original, response: { ...result.data, explanation: restore(result.data.explanation, redactions) } }]);
    setMessage("");
  }
  function cancel() { abort.current?.abort(); setLoading(false); }
  const errorText = error ? error.kind === "validation" ? copy.errors.validation[error.reason ?? "invalid"] : error.kind === "llm_unavailable" ? copy.errors.llm : error.kind === "network" ? copy.errors.network : error.kind === "timeout" ? copy.errors.timeout : copy.errors.unexpected : null;

  return <div className="gutter py-7 md:py-10">
    <Link href="/" className="micro text-ink-soft hover:text-accent-ink">← {copy.result.back}</Link>
    <header className="my-7 border-b border-line-strong pb-7">
      <p className="micro mb-3 text-accent-ink">FraudLens / {c.thread}</p>
      <h1 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">{c.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft md:text-base">{c.intro}</p>
    </header>
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)]">
      <section aria-label={c.thread} className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="micro text-ink-soft">{c.thread} <span className="ml-2 font-mono text-accent-ink">{String(entries.length).padStart(2, "0")}</span></h2>
          {entries.length > 0 && <button type="button" disabled={loading} onClick={() => { setEntries([]); setError(null); }} className="text-xs text-ink-soft underline underline-offset-4 disabled:opacity-40">{c.reset}</button>}
        </div>
        {entries.length === 0 && <div className="mb-5 border border-dashed border-line-strong bg-card px-6 py-10">
          <span aria-hidden="true" className="mb-5 block font-mono text-3xl text-accent">“</span><p className="text-sm text-ink-soft">{c.empty}</p>
        </div>}
        <p role="status" className="sr-only">{entries.length > 0 ? `${c.message} ${entries.length}: ${c.verdicts[entries[entries.length - 1].response.verdict]}` : ""}</p>
        <ol className="space-y-4">
          {entries.map((entry, index) => <li key={index}><article ref={index === entries.length - 1 ? latest : undefined} className="overflow-hidden border border-card-border bg-card">
            <div className={`flex flex-wrap items-center justify-between gap-2 border-l-[3px] px-4 py-3 ${tones[entry.response.verdict]}`}>
              <span className="micro">{c.message} {String(index + 1).padStart(2, "0")}</span>
              <span className="text-xs font-semibold">{c.verdicts[entry.response.verdict]}</span>
            </div>
            <p className="whitespace-pre-wrap break-words px-5 py-5 text-sm leading-relaxed">{entry.message}</p>
            <div className="border-t border-card-border px-5 py-4">
              <p className="micro text-accent-ink">{entry.response.scamProfile?.stage ? copy.result.journey.labels[entry.response.scamProfile.stage] : c.unknownStage}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{entry.response.explanation}</p>
            </div>
          </article></li>)}
        </ol>
        <form onSubmit={submit} className="mt-6 border border-line-strong bg-card p-5">
          <label htmlFor="conversation-message" className="micro block text-ink-soft">{c.add}</label>
          <textarea ref={composer} id="conversation-message" value={message} onChange={(event) => { setMessage(event.target.value); setError(null); }} disabled={loading} maxLength={MAX_MESSAGE_LENGTH} rows={5} placeholder={copy.placeholder} className="mt-3 w-full resize-y border border-card-border bg-page p-3 text-sm leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60" aria-describedby="conversation-privacy" />
          <p className="mt-1 text-right font-mono text-[11px] text-ink-soft">{copy.charCount(message.length, MAX_MESSAGE_LENGTH)}</p>
          <p id="conversation-privacy" className="mt-3 text-xs leading-relaxed text-ink-soft">{copy.privacyNote}</p>
          {errorText && <p role="alert" className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger-ink">{errorText}</p>}
          {loading ? <div className="mt-5 flex items-center gap-4"><WaitStatus phase="running" stage={stage} labels={copy.wait.check} progressLabel={copy.wait.progressLabel} /><button type="button" onClick={cancel} className="text-sm underline underline-offset-4">{copy.wait.cancel}</button></div> : <button type="submit" disabled={!message.trim()} className="pressable mt-5 flex min-h-12 w-full items-center justify-between bg-ink px-4 py-3 text-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-40">{error ? copy.retry : c.submit}<span aria-hidden="true">↗</span></button>}
        </form>
      </section>
      <aside className="border border-card-border bg-card md:sticky md:top-6" aria-label={c.progress}>
        <details open className="group">
          <summary className="cursor-pointer border-b border-card-border bg-ink px-5 py-4 text-on-ink">
            <span className="micro text-on-ink">{c.progress}</span>
            {furthest?.journey && <span className="mt-2 block text-sm text-on-ink/80">{copy.result.journey.labels[furthest.journey.currentStage]}</span>}
          </summary>
          {furthest ? <ScamJourney response={furthest} copy={copy} /> : <p className="p-5 text-sm leading-relaxed text-ink-soft">{c.pending}</p>}
        </details>
      </aside>
    </div>
  </div>;
}
