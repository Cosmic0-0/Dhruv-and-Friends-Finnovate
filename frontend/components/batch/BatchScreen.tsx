"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { signalTitle } from "@/components/result/sections";
import { card, DcPage, PageHeader, Pill, TONE, type Tone } from "@/components/dc";
import { batchScan, extractScreenshotText, type ApiError, type ClientBatchResult } from "@/lib/api";
import { compressImage, ImageError } from "@/lib/image";
import { redact, type Redaction } from "@/lib/redact";
import { saveResult } from "@/lib/storage";
import { MAX_BATCH_SIZE, MAX_MESSAGE_LENGTH, type AnalyzeResponse, type Verdict } from "@/lib/types";
import { getVerdictDisplay } from "@/lib/verdict";
import { batchCopy, fill } from "./content";

/** One paste box, messages separated by a blank line. */
function parseMessages(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((m) => m.trim())
    .filter(Boolean);
}

interface Shot {
  id: string;
  fileName: string;
  status: "reading" | "review" | "error";
  text: string;
  error?: string;
}

interface Row {
  from: string;
  text: string;
  redacted: string;
  redactions: Redaction[];
  source: "typed" | "screenshot";
  result: ClientBatchResult;
}

const VERDICT_TONE: Record<Verdict, Tone> = { scam: "red", suspicious: "amber", safe: "green" };
const SUMMARY_VERDICTS: Verdict[] = ["scam", "suspicious", "safe"];

/**
 * Batch scan (design: Batch Scan.dc.html). One input card (paste box +
 * screenshot review items together, never empty) feeds ONE real
 * POST /api/batch-scan call: pasted messages (blank-line separated) and
 * screenshots (multi-file OCR via the real /api/analyze/screenshot, reviewed
 * and editable before scanning). No mock data: summary counts, verdicts and
 * "why" signals are all from the backend response; a chevron opens the full
 * per-message result via the same saveResult()+/result flow as a single check.
 * The summary tiles and results card are always on screen (design: "before a
 * scan show them with '–', not hidden") so the page is never a big empty box.
 */
export default function BatchScreen() {
  const { lang, copy } = useLanguage();
  const t = batchCopy(lang);
  const router = useRouter();

  const [pasted, setPasted] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; scamCount: number; suspiciousCount: number; safeCount: number; unanalyzedCount: number } | null>(null);
  const [filter, setFilter] = useState<Verdict | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pastedMessages = parseMessages(pasted);
  const reviewedShots = shots.filter((s) => s.status === "review" && s.text.trim());
  const queueSize = pastedMessages.length + reviewedShots.length;
  const tooMany = queueSize > MAX_BATCH_SIZE;
  const tooLong = pastedMessages.some((m) => m.length > MAX_MESSAGE_LENGTH) || reviewedShots.some((s) => s.text.length > MAX_MESSAGE_LENGTH);
  const canSubmit = queueSize > 0 && !tooMany && !tooLong && status !== "loading";

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    const newShots: Shot[] = picked.map((f) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, fileName: f.name, status: "reading", text: "" }));
    setShots((s) => [...s, ...newShots]);
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      const id = newShots[i].id;
      try {
        const img = await compressImage(file);
        // OCR only: the text is reviewed here and analysed with the batch.
        const res = await extractScreenshotText({ image: img.dataUrl, language: lang });
        if (!res.ok) {
          setShots((s) => s.map((x) => (x.id === id ? { ...x, status: "error", error: t.screenshots.failed } : x)));
          continue;
        }
        const text = res.data.extractedText.trim();
        setShots((s) => s.map((x) => (x.id === id ? { ...x, status: text ? "review" : "error", text, error: text ? undefined : t.screenshots.failed } : x)));
      } catch (err) {
        const msg = err instanceof ImageError ? t.screenshots.failed : t.screenshots.failed;
        setShots((s) => s.map((x) => (x.id === id ? { ...x, status: "error", error: msg } : x)));
      }
    }
  }

  function removeShot(id: string) {
    setShots((s) => s.filter((x) => x.id !== id));
  }

  function focusPaste() {
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submit() {
    if (!canSubmit) return;
    setStatus("loading");
    setError(null);
    setFilter(null);
    const items = [
      ...pastedMessages.map((text, i) => ({ from: fill(t.row.line, { n: i + 1 }), text, source: "typed" as const })),
      ...reviewedShots.map((s, i) => ({ from: fill(t.row.screenshot, { n: i + 1 }), text: s.text, source: "screenshot" as const })),
    ];
    const prepared = items.map((it) => ({ ...it, ...redact(it.text) }));
    const controller = new AbortController();
    abortRef.current = controller;
    const res = await batchScan({ messages: prepared.map((p) => p.redacted) }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (res.ok) {
      setRows(prepared.map((p, i) => ({ from: p.from, text: p.text, redacted: p.redacted, redactions: p.redactions, source: p.source, result: res.data.results[i] })));
      setSummary({ ...res.data.summary, unanalyzedCount: res.data.summary.unanalyzedCount ?? res.data.failedCount });
      setStatus("idle");
      return;
    }
    if (res.error.kind === "aborted") return;
    setError(res.error);
    setStatus("error");
  }

  function openRow(row: Row) {
    if (row.result.verdict === "unknown" || row.result.analysisFailed) return;
    const { message: _message, analysisFailed: _analysisFailed, ...response } = row.result;
    void _message;
    void _analysisFailed;
    saveResult({
      response: response as AnalyzeResponse,
      redacted: row.redacted,
      redactions: row.redactions,
      language: lang,
      at: Date.now(),
      source: row.source,
    });
    router.push("/result");
  }

  const filtered = rows && filter ? rows.filter((r) => r.result.verdict === filter) : rows;
  const SUMMARY_LABEL: Record<Verdict, string> = { scam: t.summary.scam, suspicious: t.summary.caution, safe: t.summary.genuine };
  const SUMMARY_COUNT: Record<Verdict, number | undefined> = { scam: summary?.scamCount, suspicious: summary?.suspiciousCount, safe: summary?.safeCount };

  return (
    <DcPage label="Batch scan">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        aside={
          <div className="batch-actions" style={{ display: "flex", gap: 12 }}>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
            <Pill variant="outline" height={48} onClick={() => fileInput.current?.click()}>
              {t.modes.screenshots}
            </Pill>
            <Pill variant="ink" height={48} onClick={focusPaste}>
              {t.modes.paste}
            </Pill>
          </div>
        }
      />

      <div data-fx style={{ ...card(32), padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
        <textarea
          ref={textareaRef}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={7}
          placeholder={t.paste.placeholder}
          style={{ width: "100%", resize: "vertical", border: "none", outline: "none", fontSize: 17, lineHeight: 1.6, color: "var(--dc-ink)", background: "transparent", fontFamily: "inherit" }}
        />
        <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{fill(t.paste.hint, { max: MAX_BATCH_SIZE })}</span>

        {shots.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--dc-line2)", paddingTop: 16 }}>
            {shots.map((s, i) => (
              <div key={s.id} style={{ border: "1px solid var(--dc-line2)", borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)" }}>
                    {fill(t.row.screenshot, { n: i + 1 })} · {s.fileName}
                  </span>
                  <button type="button" onClick={() => removeShot(s.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--dc-text3)" }}>
                    {t.screenshots.remove}
                  </button>
                </div>
                {s.status === "reading" && <span style={{ fontSize: 14, color: "var(--dc-text3)" }}>{t.screenshots.reading}</span>}
                {s.status === "error" && <span style={{ fontSize: 14, color: "var(--dc-red)" }}>{s.error}</span>}
                {s.status === "review" && (
                  <textarea
                    value={s.text}
                    onChange={(e) => setShots((old) => old.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)))}
                    rows={3}
                    style={{ width: "100%", resize: "vertical", border: "1px solid var(--dc-line2)", borderRadius: 14, padding: "10px 12px", fontSize: 15, lineHeight: 1.5, background: "var(--dc-hover)", fontFamily: "inherit", color: "var(--dc-ink)" }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {(tooMany || tooLong) && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: "var(--dc-red)" }}>
            {tooMany ? fill(t.errors.tooMany, { max: MAX_BATCH_SIZE }) : fill(t.errors.tooLong, { max: MAX_MESSAGE_LENGTH })}
          </p>
        )}
        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: "var(--dc-red)" }}>
            {error.message}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Pill onClick={() => void submit()} disabled={!canSubmit} height={48}>
            {status === "loading" ? t.scanning : t.submit}
          </Pill>
          <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)" }}>{fill(t.paste.count, { n: queueSize, max: MAX_BATCH_SIZE })}</span>
        </div>
      </div>

      <div data-nofx style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="dc-cols-1" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20 }}>
          {SUMMARY_VERDICTS.map((verdict) => {
            const tone = VERDICT_TONE[verdict];
            const on = filter === verdict;
            const count = SUMMARY_COUNT[verdict];
            return (
              <button
                key={verdict}
                type="button"
                aria-pressed={on}
                disabled={!summary}
                onClick={() => summary && setFilter(on ? null : verdict)}
                className={summary ? "dc-lift" : undefined}
                style={{
                  ...card(28), textAlign: "left", cursor: summary ? "pointer" : "default", padding: 28, display: "flex", flexDirection: "column", gap: 12,
                  border: `1px solid ${on ? TONE[tone].dot : "var(--dc-line)"}`,
                }}
              >
                <span style={{ fontSize: 14, color: "var(--dc-text3)" }}>{SUMMARY_LABEL[verdict]}</span>
                <span className="dc-mono" style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.05em", color: TONE[tone].fg }}>
                  {count === undefined ? "–" : count}
                </span>
              </button>
            );
          })}
        </div>

        {summary && summary.unanalyzedCount > 0 && (
          <p style={{ margin: 0, fontSize: 14, color: "var(--dc-text3)" }}>{fill(t.summary.unanalysed, { n: summary.unanalyzedCount })}</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>
              {t.results.title} {filter && <span style={{ color: "var(--dc-text3)", fontWeight: 400 }}>· {t.results.filtered}</span>}
            </h2>
            {filter && (
              <button type="button" onClick={() => setFilter(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--dc-text2)", textDecoration: "underline" }}>
                {t.results.clear}
              </button>
            )}
          </div>
          <div style={{ ...card(32, true), padding: "12px 32px" }}>
            {!rows ? (
              <div style={{ padding: "22px 0", fontSize: 15, color: "var(--dc-text3)" }}>{t.results.placeholder}</div>
            ) : (
              (filtered ?? []).map((row, i) => (
                <BatchRow key={i} row={row} last={i === (filtered?.length ?? 0) - 1} copy={copy} lang={lang} unknownLabel={t.verdictUnknown} openLabel={t.row.open} onOpen={() => openRow(row)} />
              ))
            )}
          </div>
        </div>
      </div>
    </DcPage>
  );
}

function BatchRow({
  row,
  last,
  copy,
  lang,
  unknownLabel,
  openLabel,
  onOpen,
}: {
  row: Row;
  last: boolean;
  copy: Parameters<typeof signalTitle>[1];
  lang: Parameters<typeof signalTitle>[2];
  unknownLabel: string;
  openLabel: string;
  onOpen: () => void;
}) {
  const failed = row.result.verdict === "unknown" || row.result.analysisFailed;
  const display = !failed ? getVerdictDisplay(row.result.verdict as Verdict) : null;
  const tone: Tone | null = failed ? null : VERDICT_TONE[row.result.verdict as Verdict];
  const top = !failed ? [...row.result.signals].sort((a, b) => (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0))[0] : undefined;
  const rowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "120px 1fr 0.8fr 24px", gap: 24, alignItems: "center", padding: "22px 0", borderBottom: last ? "none" : "1px solid var(--dc-line2)" };
  return (
    <div className="batch-result-row" style={rowStyle}>
      <span
        className="batch-result-badge"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content", height: 32, padding: "0 12px",
          borderRadius: 999, fontSize: 13, fontWeight: 500,
          background: tone ? TONE[tone].hl : "var(--dc-hover)", color: tone ? TONE[tone].fg : "var(--dc-text3)",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: tone ? TONE[tone].dot : "var(--dc-text3)" }} />
        {failed ? unknownLabel : display!.label}
      </span>
      <div className="batch-result-message" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)" }}>{row.from}</span>
        <span style={{ fontSize: 16, color: "var(--dc-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.text.replace(/\s+/g, " ").trim()}
        </span>
      </div>
      <span className="batch-result-signal" style={{ fontSize: 14, color: "var(--dc-text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {top ? signalTitle(top.type, copy, lang) : ""}
      </span>
      {!failed ? (
        <button className="batch-result-open" type="button" onClick={onOpen} aria-label={openLabel} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--dc-text4)" }}>
          ›
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
