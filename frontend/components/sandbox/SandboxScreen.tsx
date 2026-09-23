"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { card, DcPage, PageHeader, Pill } from "@/components/dc";
import { getSandboxCatalog, nextSandboxTurn, type SandboxCatalog, type SandboxTurn } from "@/lib/intelligence-api";
import { sandboxCopy } from "./content";

/**
 * Scam sandbox (design: no source page in this drop; rebuilt with the shared
 * dc-* design system used across the app, see components/dc). Fixed, bounded
 * playbook simulation only — real POST /api/sandbox/playbooks and
 * /api/sandbox/next (backend/src/services/sandbox), never a live person, and
 * every message is clearly labelled fictional/simulated per CLAUDE.md.
 */
export default function SandboxScreen() {
  const { lang } = useLanguage();
  const t = sandboxCopy(lang);
  const [catalog, setCatalog] = useState<SandboxCatalog | null>(null);
  const [scamType, setScamType] = useState("");
  const [turns, setTurns] = useState<SandboxTurn[]>([]);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    getSandboxCatalog(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCatalog(data);
          setScamType(data.playbooks[0]?.scamType ?? "");
        }
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [attempt]);

  const playbook = catalog?.playbooks.find((p) => p.scamType === scamType);

  async function advance() {
    if (lock.current || !playbook || !catalog || ended) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const previous = turns.at(-1);
    const atEnd = turns.length >= catalog.maxTurns || (previous && previous.nextStage === null);
    try {
      const turn = await nextSandboxTurn(
        { scamType, stage: previous?.nextStage ?? previous?.stage ?? playbook.typicalStages[0], turnIndex: atEnd ? catalog.maxTurns : turns.length },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (turn.ended) setEnded(true);
      else setTurns((old) => [...old, turn]);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not continue the simulation.");
    } finally {
      if (!controller.signal.aborted) { setBusy(false); lock.current = false; }
    }
  }

  function cancel() { request.current?.abort(); lock.current = false; setBusy(false); setError(""); }
  function reset() { request.current?.abort(); lock.current = false; setBusy(false); setTurns([]); setEnded(false); setError(""); }

  const finishing = !!catalog && (turns.length >= catalog.maxTurns || (turns.length > 0 && turns.at(-1)?.nextStage === null));
  const tacticsSeen = Array.from(new Set(turns.map((turn) => turn.tactic.label.toLowerCase())));

  return (
    <DcPage label="Scam sandbox">
      <PageHeader eyebrow={t.eyebrow} title={t.title} lede={t.lede} />

      <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,0.4fr) minmax(0,0.6fr)", gap: 20, alignItems: "start" }}>
        <aside className="dc-sticky" style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 92 }}>
          <div data-fx style={{ ...card(28), padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <label htmlFor="sandbox-type" style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.scenario.label}</label>
            <select
              id="sandbox-type"
              value={scamType}
              disabled={!catalog || busy || turns.length > 0}
              onChange={(e) => { reset(); setScamType(e.target.value); }}
              style={{ width: "100%", borderRadius: 14, border: "1px solid var(--dc-line2)", background: "var(--dc-hover)", padding: "12px 14px", fontSize: 15, color: "var(--dc-ink)", fontFamily: "inherit" }}
            >
              {catalog ? catalog.playbooks.map((p) => <option key={p.scamType} value={p.scamType}>{p.label}</option>) : <option>{t.scenario.loading}</option>}
            </select>
            <span style={{ fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.fictionNote}</span>
            {lang !== "en" && <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.sourceLangNote}</span>}
          </div>

          <div data-fx style={{ ...card(28), padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{t.objective.title}</span>
            <span style={{ fontSize: 14, color: "var(--dc-text2)", lineHeight: 1.55 }}>{t.objective.body}</span>
          </div>

          {turns.length > 0 && (
            <div data-fx style={{ ...card(28), padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--dc-text3)" }}>
                <span>{t.progress}</span>
                <span className="dc-mono">{turns.length} / {catalog?.maxTurns}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--dc-hover)" }}>
                <div style={{ height: "100%", borderRadius: 999, background: "var(--dc-ink)", width: `${(100 * turns.length) / (catalog?.maxTurns ?? 5)}%`, transition: "width .3s ease-out" }} />
              </div>
              <button type="button" onClick={reset} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--dc-ink)", textDecoration: "underline", textAlign: "left" }}>
                {t.reset}
              </button>
            </div>
          )}
        </aside>

        <section data-nofx aria-label="Educational simulation transcript" style={{ ...card(32), padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
          {!turns.length && !ended && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.035em" }}>{t.introTitle}</h2>
              <span style={{ fontSize: 15, color: "var(--dc-text2)", lineHeight: 1.55 }}>{t.introBody}</span>
            </div>
          )}

          {turns.map((turn, i) => (
            <article key={`${turn.scamType}-${turn.turnIndex}`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dc-red)" }}>{t.scammer}</span>
                <span style={{ fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 999, background: "var(--dc-amber-hl)", color: "var(--dc-amber)" }}>{t.simulated}</span>
                <span className="dc-mono" style={{ marginLeft: "auto", fontSize: 12, color: "var(--dc-text3)" }}>{String(i + 1).padStart(2, "0")}</span>
              </div>
              <blockquote style={{ margin: 0, borderLeft: "2px solid var(--dc-line-strong)", padding: "4px 0 4px 16px", fontSize: 16, lineHeight: 1.55 }}>{turn.line}</blockquote>
              <div style={{ borderRadius: 20, background: "var(--dc-hover)", padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.tactic} / {turn.tactic.label}</span>
                <span style={{ fontSize: 14, color: "var(--dc-text2)", lineHeight: 1.5 }}>{turn.tactic.explanation}</span>
              </div>
            </article>
          ))}

          {ended && (
            <div role="status" style={{ borderRadius: 28, background: "var(--dc-hover)", padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.ended.title}</span>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.03em" }}>{t.ended.headline}</h2>
              <span style={{ fontSize: 14, color: "var(--dc-text2)", lineHeight: 1.55 }}>
                {t.ended.tacticsSeen}: {tacticsSeen.join(", ")}. {t.ended.advice}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 6 }}>
                <Pill variant="outline" onClick={reset}>{t.ended.another}</Pill>
                <Pill href="/app">{t.ended.check}</Pill>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" style={{ borderRadius: 28, background: "var(--dc-red-hl)", padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 15, color: "var(--dc-ink)" }}>{error}</span>
              {!catalog && <Pill onClick={() => setAttempt((n) => n + 1)} style={{ alignSelf: "flex-start" }}>{t.reload}</Pill>}
            </div>
          )}

          {!ended && (
            <Pill onClick={() => void advance()} disabled={busy || !playbook} height={56}>
              {busy ? t.preparing : turns.length ? (finishing ? t.finish : t.continueLabel) : t.start}
            </Pill>
          )}
          {busy && (
            <button type="button" onClick={cancel} style={{ alignSelf: "center", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--dc-text3)" }}>
              {t.cancel}
            </button>
          )}
        </section>
      </div>
    </DcPage>
  );
}
