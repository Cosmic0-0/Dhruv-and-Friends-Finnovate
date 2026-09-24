"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { card, DcPage, Mark, PageHeader, Pill, TONE, WhatToDoPanel, type Tone } from "@/components/dc";
import { dcCopy } from "@/components/dc/content";
import { useLanguage } from "@/components/LanguageProvider";
import { useWaitStage, WaitFill } from "@/components/WaitProgress";
import { signalDescription, signalTitle } from "@/components/result/sections";
import { DocumentIcon, RetryIcon, XIcon } from "@/components/icons";
import { analyzeDocument, type ApiError, type ValidationReason } from "@/lib/api";
import { DOC_FINDING_KEYS, DOCUMENT_ACCEPT, documentFindings, formatFileSize, precheckDocument, previewFacts, type DocFinding } from "@/lib/document";
import type { Copy, UiLanguage } from "@/lib/i18n";
import { sortSignals } from "@/lib/result";
import { addRecentCheck } from "@/lib/storage";
import { redact } from "@/lib/redact";
import { MAX_DOCUMENT_BYTES, type AnalyzeDocumentResponse, type Signal, type Verdict } from "@/lib/types";
import { content } from "./content";

/**
 * "Check a document" (Check Document.dc.html). File handling, precheck and
 * the reading -> uploading -> analysing state machine are unchanged from the
 * previous components/document/DocumentCheck.tsx; the result now renders
 * inline in the design's layout instead of navigating to /result. Structural
 * (DOC-*) finding sentences and file-fact labels reuse
 * lib/document.documentFindings/previewFacts and copy.document.panel from
 * lib/i18n.ts (the same source DocumentIntegrityPanel uses), so there is one
 * place that phrases a DOC-* finding.
 */

type Failure = ApiError | "storage";
type Phase =
  | { kind: "idle" }
  | { kind: "selected"; file: File }
  | { kind: "reading"; file: File }
  | { kind: "uploading"; file: File; percent: number | null }
  | { kind: "analysing"; file: File }
  | { kind: "done"; file: File; data: AnalyzeDocumentResponse }
  | { kind: "error"; file: File | null; error: Failure };

const PRECHECK_REASON: Record<Exclude<ReturnType<typeof precheckDocument>, "ok">, ValidationReason> = {
  too_large: "document_too_large",
  unsupported: "document_unsupported",
  empty: "document_unreadable",
};

const VERDICT_TONE: Record<Verdict, Tone> = { safe: "green", suspicious: "amber", scam: "red" };
const VERDICT_GLYPH: Record<Verdict, string> = { safe: "✓", suspicious: "!", scam: "✕" };

function readAsDataUrl(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const onAbort = () => reader.abort();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("unreadable")));
    reader.onerror = () => reject(reader.error ?? new Error("unreadable"));
    reader.onabort = () => reject(new Error("aborted"));
    reader.onloadend = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    reader.readAsDataURL(file);
  });
}

function failureCopy(error: Failure, copy: Copy): { title: string; body: string; isInput: boolean } {
  const e = copy.errors;
  if (error === "storage") return { title: e.unexpectedTitle, body: copy.document.storageFailed, isInput: false };
  switch (error.kind) {
    case "validation":
      return { title: e.validationTitle, body: e.validation[error.reason ?? "invalid"], isInput: true };
    case "llm_unavailable":
      return { title: e.llmTitle, body: e.llm, isInput: false };
    case "network":
      return { title: e.networkTitle, body: e.network, isInput: false };
    case "timeout":
      return { title: e.timeoutTitle, body: e.timeout, isInput: false };
    default:
      return { title: e.unexpectedTitle, body: e.unexpected, isInput: false };
  }
}

const sectionLabel: CSSProperties = { fontSize: 13, color: "var(--dc-text3)" };
const CHECKERBOARD: CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage: "conic-gradient(#d4d4d8 25%, transparent 0 50%, #d4d4d8 0 75%, transparent 0)",
  backgroundSize: "12px 12px",
};

function InfoTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="document-info-tile" style={{ ...card(20), padding: "16px 20px", minWidth: 170, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</span>
      <span style={{ fontSize: 13, lineHeight: 1.4, color: "var(--dc-text3)" }}>{body}</span>
    </div>
  );
}

function FindingRow({ tone, glyph, text, pageTag }: { tone: Tone; glyph: string; text: string; pageTag?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Mark tone={tone} glyph={glyph} size={36} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 6 }}>
        {pageTag && (
          <span className="dc-mono" style={{ fontSize: 11, color: "var(--dc-text3)" }}>
            📍 {pageTag}
          </span>
        )}
        <span style={{ fontSize: 15, lineHeight: 1.5, color: "var(--dc-ink)", overflowWrap: "anywhere" }}>{text}</span>
      </div>
    </div>
  );
}

/** Plain-text client-side download of the real findings — no server round-trip. */
function buildReportText(data: AnalyzeDocumentResponse, fileName: string, t: ReturnType<typeof content>, copy: Copy, lang: UiLanguage): string {
  const p = copy.document.panel;
  const structural = documentFindings(data.signals);
  const semantic = sortSignals(data.signals.filter((s) => !(typeof s.code === "string" && s.code.startsWith("DOC-"))));
  const lines: string[] = [];
  lines.push(t.report.title);
  lines.push(`${t.report.generated}: ${new Date().toISOString()}`);
  lines.push(`${t.report.file}: ${fileName}`);
  lines.push(`${t.report.verdict}: ${t.verdict[data.verdict]}`);
  lines.push("");
  lines.push(t.report.structural);
  if (structural.length === 0) lines.push(`- ${t.report.none}`);
  else structural.forEach((f) => lines.push(`- ${p.findings[f.key](f)}`));
  lines.push("");
  lines.push(t.report.semantic);
  if (semantic.length === 0) lines.push(`- ${t.report.none}`);
  else semantic.forEach((s) => lines.push(`- ${signalTitle(s.type, copy, lang)}: ${signalDescription(s, copy, (x) => x)}`));
  return lines.join("\n");
}

function downloadReport(data: AnalyzeDocumentResponse, fileName: string, t: ReturnType<typeof content>, copy: Copy, lang: UiLanguage) {
  const text = buildReportText(data, fileName, t, copy, lang);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName.replace(/\.[^.]+$/, "")}-fraudlens-report.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ResultView({
  file,
  data,
  onCheckAnother,
}: {
  file: File;
  data: AnalyzeDocumentResponse;
  onCheckAnother: () => void;
}) {
  const { lang, copy } = useLanguage();
  const t = content(lang);
  const nav = dcCopy(lang);
  const p = copy.document.panel;
  const doc = data.document;
  const structural = documentFindings(data.signals);
  const semantic = sortSignals(data.signals.filter((s) => !(typeof s.code === "string" && s.code.startsWith("DOC-"))));
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : null);
  const editedAfterSigning = structural.some((f) => f.key === "DOC-02:after_signature");

  const facts: [string, string | null][] = [
    [p.fileType, p.fileTypes[doc.fileType]],
    [p.pages, doc.pageCount === null && doc.pagesAnalyzed === null ? null : p.pagesValue(doc.pagesAnalyzed, doc.pageCount)],
    [p.producer, doc.metadata.producer],
    [p.creator, doc.metadata.creator && doc.metadata.creator !== doc.metadata.producer ? doc.metadata.creator : null],
    [p.textSource, p.textSources[doc.textSource]],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  const history: [string, string][] = [
    [t.history.created, date(doc.metadata.created) ?? ""],
    [t.history.modified, doc.metadata.modified && doc.metadata.modified !== doc.metadata.created ? (date(doc.metadata.modified) ?? "") : ""],
    [t.history.revisions, doc.metadata.incrementalUpdates === null ? "" : editedAfterSigning ? p.editedAfterSigning : p.revisionsValue(doc.metadata.incrementalUpdates)],
    [t.history.signature, doc.fileType === "pdf" || doc.metadata.signed ? (doc.metadata.signed ? p.signed : p.notSigned) : ""],
  ].filter(([, v]) => v !== "") as [string, string][];

  const summary =
    structural.length === 0 && semantic.length === 0
      ? t.summary.clean
      : t.summary.counts.replace("{structural}", String(structural.length)).replace("{semantic}", String(semantic.length));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }} data-nofx>
      <div className="document-result-summary" style={{ ...card(32, true), padding: "36px 40px", display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 24 }}>
        <Mark tone={VERDICT_TONE[data.verdict]} glyph={VERDICT_GLYPH[data.verdict]} size={72} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: "var(--dc-text3)", overflowWrap: "anywhere" }}>{`${nav.common.verdict} · ${file.name}`}</span>
          <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.05, color: TONE[VERDICT_TONE[data.verdict]].fg }}>{t.verdict[data.verdict]}</span>
          <span style={{ fontSize: 17, lineHeight: 1.5, color: "var(--dc-text2)" }}>{summary}</span>
        </div>
        <Pill variant="outline" onClick={onCheckAnother}>{t.checkAnotherFile}</Pill>
      </div>

      <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.1fr)", gap: 20, alignItems: "start" }}>
        <section className="dc-sticky" style={{ ...card(32), position: "sticky", top: 108, padding: 28, display: "flex", flexDirection: "column", gap: 24 }}>
          {doc.previews.length > 0 && (
            <div>
              <span style={sectionLabel}>{p.previewsTitle}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
                {doc.previews.map((pv, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", borderRadius: 12, border: "1px solid var(--dc-line)", padding: 8, ...CHECKERBOARD }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pv.dataUrl} alt={p.previewAlt(pv.page)} width={Math.min(pv.widthPx * 2, 200)} style={{ height: "auto", maxWidth: 200, imageRendering: "pixelated", display: "block" }} />
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {pv.page !== null && (
                        <span className="dc-mono" style={{ fontSize: 11, color: "var(--dc-text3)" }}>📍 {t.pageTag.replace("{n}", String(pv.page))}</span>
                      )}
                      <span style={{ fontSize: 14, color: "var(--dc-text2)" }}>{p.previewCaption(previewFacts(pv))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <span style={sectionLabel}>{t.extractedTextTitle}</span>
            <pre className="dc-mono" style={{ marginTop: 12, maxHeight: 260, overflow: "auto", fontSize: 12.5, lineHeight: 1.6, color: "var(--dc-text2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {data.extractedText.trim() || t.noExtractedText}
            </pre>
            {doc.textTruncated && <p style={{ marginTop: 8, fontSize: 13, color: "var(--dc-amber)" }}>{p.truncated}</p>}
          </div>

          <div>
            <span style={sectionLabel}>{p.fileFacts}</span>
            <dl style={{ marginTop: 12, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 16, rowGap: 6, fontSize: 14 }}>
              {facts.map(([label, value]) => (
                <div key={label} style={{ display: "contents" }}>
                  <dt style={{ color: "var(--dc-text3)" }}>{label}</dt>
                  <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ ...card(32), padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={sectionLabel}>{t.howMadeTitle}</span>
            {structural.length === 0 ? (
              <span style={{ fontSize: 15, color: "var(--dc-text2)" }}>{p.none}</span>
            ) : (
              structural.map((f, i) => (
                <FindingRow
                  key={i}
                  tone={f.severity === "high" ? "red" : f.severity === "medium" ? "amber" : "green"}
                  glyph={f.severity === "high" ? "✕" : f.severity === "medium" ? "!" : "✓"}
                  text={p.findings[f.key](f)}
                  pageTag={f.page !== null ? t.pageTag.replace("{n}", String(f.page)) : undefined}
                />
              ))
            )}
          </div>

          {history.length > 0 && (
            <div style={{ ...card(32), padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={sectionLabel}>{t.fileHistoryTitle}</span>
              {history.map(([label, value], i) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--dc-line2)" }}>
                  <span style={{ fontSize: 14, color: "var(--dc-text3)" }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, textAlign: "right" }}>{value}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ ...card(32), padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={sectionLabel}>{t.whatItSaysTitle}</span>
            {semantic.length === 0 ? (
              <span style={{ fontSize: 15, color: "var(--dc-text2)" }}>{t.noSemanticFindings}</span>
            ) : (
              semantic.map((s, i) => (
                <FindingRow
                  key={i}
                  tone={s.severity === "high" ? "red" : s.severity === "medium" ? "amber" : "green"}
                  glyph={s.severity === "high" ? "✕" : s.severity === "medium" ? "!" : "✓"}
                  text={`${signalTitle(s.type, copy, lang)} — ${signalDescription(s, copy, (x) => x)}`}
                />
              ))
            )}
          </div>
        </section>
      </div>

      <WhatToDoPanel label={nav.common.whatToDo} headline={t.whatToDo[data.verdict]} body={t.whatToDoBody[data.verdict]}>
        <Pill href="/safepay" variant="light">{t.checkAccountBeforePaying}</Pill>
        <Pill variant="light" onClick={() => downloadReport(data, file.name, t, copy, lang)}>{t.downloadReport}</Pill>
      </WhatToDoPanel>

      <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--dc-text4)" }}>{p.caveat}</span>
    </div>
  );
}

export default function CheckDocumentScreen() {
  const { lang, copy } = useLanguage();
  const t = content(lang);
  const d = copy.document;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase.kind === "reading" || phase.kind === "uploading" || phase.kind === "analysing";
  const stage = useWaitStage(phase.kind === "analysing");
  const stepOrder = ["reading", "uploading", "analysing"] as const;
  const currentStepIdx = phase.kind === "reading" ? 0 : phase.kind === "uploading" ? 1 : phase.kind === "analysing" ? 2 : -1;
  const stepLabel = (step: (typeof stepOrder)[number]): string => {
    if (step === "uploading") return d.status.uploading(phase.kind === "uploading" ? phase.percent : null);
    if (step === "analysing") return d.status.analysing;
    return d.status.reading;
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  function pick(file: File | undefined) {
    if (!file || busy) return;
    const pre = precheckDocument(file, MAX_DOCUMENT_BYTES);
    if (pre !== "ok") {
      setPhase({ kind: "error", file: null, error: { kind: "validation", reason: PRECHECK_REASON[pre], message: "" } });
      return;
    }
    setPhase({ kind: "selected", file });
  }

  async function check(file: File) {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "reading", file });

    let dataUrl: string;
    try {
      dataUrl = await readAsDataUrl(file, controller.signal);
    } catch {
      if (controller.signal.aborted) return;
      setPhase({ kind: "error", file, error: { kind: "validation", reason: "document_unreadable", message: "" } });
      return;
    }

    setPhase({ kind: "uploading", file, percent: null });
    const res = await analyzeDocument(
      { file: dataUrl, fileName: file.name, language: lang },
      {
        signal: controller.signal,
        onUploadProgress: (f) => setPhase((prev) => (prev.kind === "uploading" ? { ...prev, percent: Math.min(100, Math.round(f * 100)) } : prev)),
        onUploaded: () => setPhase((prev) => (prev.kind === "uploading" ? { kind: "analysing", file } : prev)),
      },
    );
    if (controller.signal.aborted) return;
    if (!res.ok) {
      if (res.error.kind !== "aborted") setPhase({ kind: "error", file, error: res.error });
      return;
    }

    addRecentCheck({ text: res.data.extractedText.trim() || redact(file.name).redacted, verdict: res.data.verdict, at: Date.now() });
    setPhase({ kind: "done", file, data: res.data });
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase((p) => (p.kind === "reading" || p.kind === "uploading" || p.kind === "analysing" ? { kind: "selected", file: p.file } : p));
  }

  const file = phase.kind === "idle" ? null : phase.file;
  const failure = phase.kind === "error" ? failureCopy(phase.error, copy) : null;

  if (phase.kind === "done") {
    return (
      <DcPage label="Check a document">
        <PageHeader eyebrow={t.eyebrow} title={t.title} lede={t.lede} />
        <ResultView file={phase.file} data={phase.data} onCheckAnother={() => setPhase({ kind: "idle" })} />
      </DcPage>
    );
  }

  return (
    <DcPage label="Check a document">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        aside={
          <div className="document-info-tiles" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <InfoTile title={t.aside.file.title} body={t.aside.file.body} />
            <InfoTile title={t.aside.text.title} body={t.aside.text.body} />
          </div>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          pick(f);
        }}
      />

      {busy ? (
        <div className="document-progress" style={{ ...card(32), minHeight: 420, padding: 56, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center" }} aria-live="polite">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)", overflowWrap: "anywhere" }}>{file?.name}</span>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.05 }}>{t.checkingFile}</span>
            <button type="button" onClick={cancel} style={{ alignSelf: "flex-start", marginTop: 8, background: "none", border: "none", color: "var(--dc-text3)", fontSize: 13, cursor: "pointer" }}>
              {d.cancel}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {stepOrder.map((step, i) => {
              const state = i < currentStepIdx ? "done" : i === currentStepIdx ? "current" : "pending";
              const label = stepLabel(step);
              const dotColor = state === "done" ? "var(--dc-green)" : state === "current" ? "var(--dc-accent)" : "var(--dc-line-strong)";
              return (
                <div key={step} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: dotColor,
                      boxShadow: state === "current" ? "0 0 0 6px var(--dc-accent-soft)" : "none",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 15, color: state === "pending" ? "var(--dc-text3)" : "var(--dc-ink)" }}>{label}</span>
                </div>
              );
            })}
            {phase.kind === "analysing" && (
              <>
                <span style={{ position: "relative", display: "block", height: 4, borderRadius: 999, overflow: "hidden", background: "var(--dc-line)" }}>
                  <WaitFill phase="running" stage={stage} className="bg-[var(--dc-ink)]" />
                </span>
                <span style={{ fontSize: 12.5, color: "var(--dc-text3)" }}>{d.status.analysingNote}</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <section
          aria-label={d.title}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
          style={{
            border: `1.5px dashed ${dragging ? "var(--dc-accent)" : "var(--dc-line-strong)"}`,
            borderRadius: 32,
            minHeight: 420,
            padding: 40,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 24,
            background: dragging ? "var(--dc-hover)" : "var(--dc-surface)",
          }}
        >
          {file ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, maxWidth: 420 }}>
                <span style={{ width: 44, height: 44, borderRadius: 15, background: "var(--dc-hover)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <DocumentIcon className="size-5" strokeWidth={1.9} />
                </span>
                <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                  <p style={{ margin: 0, fontSize: 17, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--dc-text3)" }}>{formatFileSize(file.size, lang === "fr" ? "fr" : "en")}</p>
                </div>
                <button type="button" onClick={() => setPhase({ kind: "idle" })} aria-label={d.remove} title={d.remove} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dc-text3)", display: "flex" }}>
                  <XIcon className="size-5" strokeWidth={2} />
                </button>
              </div>
              {phase.kind === "selected" || !failure?.isInput ? (
                <Pill variant="ink" height={52} onClick={() => void check(file)} style={{ width: "100%", maxWidth: 320 }}>
                  {phase.kind === "error" ? (
                    <>
                      <RetryIcon className="size-4" strokeWidth={2} />
                      {copy.retry}
                    </>
                  ) : (
                    d.check
                  )}
                </Pill>
              ) : (
                <Pill variant="ink" height={52} onClick={() => inputRef.current?.click()} style={{ width: "100%", maxWidth: 320 }}>
                  {d.choose}
                </Pill>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <span aria-hidden="true" style={{ width: 72, height: 72, borderRadius: 24, background: "var(--dc-accent-soft)", color: "var(--dc-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, marginBottom: 8 }}>
                ↑
              </span>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em" }}>{dragging ? d.dropActive : d.drop}</p>
              <p style={{ margin: "4px 0 0", fontSize: 15, color: "var(--dc-text3)", maxWidth: 420 }}>{d.types}</p>
              <p style={{ margin: 0, fontSize: 15, color: "var(--dc-text3)", maxWidth: 420 }}>{d.privacy}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text3)", border: "1px solid var(--dc-line-strong)", borderRadius: 999, padding: "4px 12px" }}>.pdf</span>
                <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text3)", border: "1px solid var(--dc-line-strong)", borderRadius: 999, padding: "4px 12px" }}>.docx</span>
              </div>
              <Pill variant="ink" height={52} onClick={() => inputRef.current?.click()} style={{ marginTop: 16 }}>
                {d.choose}
              </Pill>
            </div>
          )}
        </section>
      )}

      {failure && (
        <div role="alert" style={{ ...card(28), padding: 24, display: "flex", flexDirection: "column", gap: 8, borderColor: failure.isInput ? "var(--dc-amber)" : "var(--dc-red)" }}>
          <span style={{ fontSize: 13, color: failure.isInput ? "var(--dc-amber)" : "var(--dc-red)" }}>{failure.title}</span>
          <span style={{ fontSize: 15, lineHeight: 1.5, color: "var(--dc-ink)" }}>{failure.body}</span>
        </div>
      )}
    </DcPage>
  );
}
