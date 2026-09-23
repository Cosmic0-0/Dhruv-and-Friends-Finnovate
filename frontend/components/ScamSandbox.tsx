"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "./LanguageProvider";
import { intelligenceCopy } from "@/lib/intelligence-copy";
import { getSandboxCatalog, nextSandboxTurn, type SandboxCatalog, type SandboxTurn } from "@/lib/intelligence-api";

export default function ScamSandbox() {
  const { lang } = useLanguage();
  const t = intelligenceCopy(lang);
  const [catalog, setCatalog] = useState<SandboxCatalog | null>(null);
  const [scamType, setScamType] = useState("");
  const [turns, setTurns] = useState<SandboxTurn[]>([]);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const endMarker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    getSandboxCatalog(controller.signal).then(data => { if (!controller.signal.aborted) { setCatalog(data); setScamType(data.playbooks[0]?.scamType ?? ""); } }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [attempt]);
  useEffect(() => { if (turns.length || ended) endMarker.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" }); }, [turns.length, ended]);
  const playbook = catalog?.playbooks.find(p => p.scamType === scamType);
  async function advance() {
    if (lock.current || !playbook || !catalog || ended) return;
    lock.current = true; setBusy(true); setError("");
    const controller = new AbortController(); request.current = controller;
    const previous = turns.at(-1);
    const atEnd = turns.length >= catalog.maxTurns || (previous && previous.nextStage === null);
    try {
      const turn = await nextSandboxTurn({ scamType, stage: previous?.nextStage ?? previous?.stage ?? playbook.typicalStages[0], turnIndex: atEnd ? catalog.maxTurns : turns.length }, controller.signal);
      if (controller.signal.aborted) return;
      if (turn.ended) setEnded(true);
      else setTurns(old => [...old, turn]);
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not continue the simulation."); }
    finally { if (!controller.signal.aborted) { setBusy(false); lock.current = false; } }
  }
  function cancel() { request.current?.abort(); lock.current = false; setBusy(false); setError(""); }
  function reset() { request.current?.abort(); lock.current = false; setBusy(false); setTurns([]); setEnded(false); setError(""); }
  const finishing = !!catalog && (turns.length >= catalog.maxTurns || (turns.length > 0 && turns.at(-1)?.nextStage === null));
  return <div className="gutter space-y-7 py-8">
    <Link href="/" className="micro text-accent-ink hover:underline">{t("← Message check")}</Link>
    <header className="border-b border-card-border pb-6"><p className="micro mb-3 text-accent-ink">{t("Practice lab / Educational simulation")}</p><h1>{t("Recognise the next move.")}</h1><p className="mt-3 max-w-xl leading-relaxed text-ink-soft">{t("Step inside a scam scenario. See how pressure builds, learn the tactic behind each message, and practise knowing when to stop.")}</p></header>
    <div className="grid items-start gap-7 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-6">
        <div className="border border-card-border bg-card p-5"><label htmlFor="sandbox-type" className="micro text-ink-muted">{t("Choose a scenario")}</label><select id="sandbox-type" value={scamType} disabled={!catalog || busy || turns.length > 0} onChange={e => { reset(); setScamType(e.target.value); }} className="mt-3 w-full border border-card-border bg-page p-3 text-sm disabled:opacity-60">{catalog ? catalog.playbooks.map(p => <option key={p.scamType} value={p.scamType}>{p.label}</option>) : <option>{t("Loading scenarios…")}</option>}</select><p className="mt-4 text-xs leading-relaxed text-ink-muted">{t("Fictional messages. No messages are sent to anyone. No personal details are needed.")}</p>{lang !== "en" && <p className="mt-2 text-xs text-ink-muted">{t("Scenario messages and tactic explanations are shown in the source language.")}</p>}</div>
        <div className="border-l-2 border-accent pl-4"><p className="micro text-accent-ink">{t("Your objective")}</p><p className="mt-2 text-sm leading-relaxed text-ink-soft">{t("Notice the shift from a believable introduction to a request for money, credentials or control.")}</p></div>
        {turns.length > 0 && <div><div className="mb-2 flex justify-between text-xs text-ink-muted"><span>{t("Simulation progress")}</span><span>{turns.length} / {catalog?.maxTurns}</span></div><div className="h-1 bg-card-border"><div className="h-full bg-accent transition-all" style={{ width: `${100 * turns.length / (catalog?.maxTurns ?? 5)}%` }} /></div><button onClick={reset} className="mt-5 text-sm text-accent-ink underline underline-offset-4">{t("Reset and choose another scenario")}</button></div>}
      </aside>
      <section className="min-w-0 border border-card-border bg-card" aria-label="Educational simulation transcript">
        <div className="flex items-center justify-between gap-3 border-b border-card-border bg-ink px-5 py-4 text-on-ink"><span className="micro">{t("Scam sandbox")}</span><span className="border border-accent/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-on-ink/80">{t("Simulation only")}</span></div>
        <div className="space-y-7 p-5 sm:p-7">
          {!turns.length && <div className="py-10"><div className="mb-6 inline-flex size-12 items-center justify-center border border-card-border bg-accent-soft font-mono text-lg text-accent-ink">01</div><h2 className="text-2xl">{t("A safe place to spot the pattern.")}</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">{t("Advance one message at a time. Each fictional message comes with an explanation of the technique being used.")}</p></div>}
          {turns.map((turn, i) => <article key={`${turn.scamType}-${turn.turnIndex}`} className="border-b border-card-border pb-6"><div className="mb-3 flex flex-wrap items-center gap-3"><span className="micro text-danger-ink">{t("Scammer")}</span><span className="bg-caution-soft px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-caution-ink">{t("Simulated message")}</span><span className="ml-auto font-mono text-xs text-ink-muted">{String(i + 1).padStart(2, "0")}</span></div><blockquote className="border-l-2 border-card-border bg-page/70 px-4 py-4 text-[1.0625rem] leading-relaxed">{turn.line}</blockquote><div className="mt-4 border-l-2 border-accent pl-4"><p className="micro text-accent-ink">{t("Tactic /")} {turn.tactic.label}</p><p className="mt-2 text-sm leading-relaxed text-ink-soft">{turn.tactic.explanation}</p></div></article>)}
          {ended && <div className="border border-accent/30 bg-accent-soft p-5" role="status"><p className="micro text-accent-ink">{t("Simulation ended")}</p><h2 className="mt-2 text-2xl">{t("You’ve seen the pattern.")}</h2><p className="mt-3 text-sm leading-relaxed text-ink-soft">{t("Tactics encountered")}: {Array.from(new Set(turns.map(turn => turn.tactic.label.toLowerCase()))).join(", ")}. {t("In a real conversation, stop before sharing a code or sending money. Verify through the institution’s official app or a number you already trust.")}</p><div className="mt-5 flex flex-wrap gap-5"><button onClick={reset} className="text-sm font-semibold text-accent-ink underline">{t("Try another scenario")}</button><Link href="/" className="text-sm font-semibold text-accent-ink underline">{t("Check a real message →")}</Link></div></div>}
          {error && <div role="alert" className="border-l-2 border-danger bg-danger-soft p-4 text-sm"><p>{error}</p>{!catalog && <button onClick={() => setAttempt(n => n + 1)} className="mt-3 underline">{t("Reload scenarios")}</button>}</div>}
          {!ended && <button type="button" onClick={advance} disabled={busy || !playbook} className="flex min-h-12 w-full items-center justify-center gap-3 bg-ink px-5 py-3 font-semibold text-on-ink transition-colors hover:bg-ink-2 disabled:cursor-wait disabled:opacity-60">{busy ? <><span className="size-4 animate-spin rounded-full border-2 border-on-ink/30 border-t-on-ink" /><span role="status">{t("Preparing the next scenario message…")}</span></> : turns.length ? finishing ? t("Finish simulation →") : t("Continue simulation →") : t("Start simulation →")}</button>}
          {busy && <button type="button" onClick={cancel} className="w-full text-sm text-ink-muted underline">{t("Cancel this step")}</button>}
          <div ref={endMarker} />
        </div>
      </section>
    </div>
  </div>;
}
