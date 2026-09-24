"use client";

import { useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { card, chipStyle, DcPage, Mark, PageHeader, Pill, TONE, WhatToDoPanel, type Tone } from "@/components/dc";
import { dcCopy } from "@/components/dc/content";
import { analyzeConversation, type ApiError } from "@/lib/api";
import { actionPlan } from "@/lib/result";
import { redact, restore, type Redaction } from "@/lib/redact";
import { MAX_CONVERSATION_MESSAGES, MAX_CONVERSATION_MESSAGE_LENGTH, SCAM_STAGES, type ConversationResponse } from "@/lib/types";
import { getVerdictCopy } from "@/lib/verdict";
import styles from "./Conversation.module.css";
import { conversationCopy, fill } from "./content";
import { parseChatExport, type ParsedChat } from "./parse";

interface PreparedMessage {
  sender: string;
  from: "me" | "them";
  text: string;
  at: Date | null;
  redacted: string;
  redactions: Redaction[];
}

const SEVERITY_TONE: Record<string, Tone | null> = { high: "red", medium: "amber", low: null };
const FORMAT_LABEL: Record<ParsedChat["format"], string> = { whatsapp: "WhatsApp", messenger: "Messenger" };

function formatDate(d: Date | null, lang: string): string {
  if (!d) return "";
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Whole-conversation analysis (design: Conversation.dc.html). Real WhatsApp
 * .txt / Messenger JSON parsing (./parse.ts) happens entirely client-side;
 * only the redacted, size-capped text of the chosen participant's counterpart
 * is ever sent, in one call to POST /api/analyze/conversation
 * (backend/src/services/conversation — documented in docs/API-CONTRACT.md).
 * The page is a persistent two-column split throughout: the left chat card
 * goes from an upload drop zone + real "how to export" steps + participant
 * picker to the actual thread; the right aside goes from the real playbook
 * stage list (what the analysis looks for) to the verdict once one exists.
 * Every flag, stage and date shown comes from that response or the export
 * itself — nothing invented.
 */
export default function ConversationScreen() {
  const { lang, copy } = useLanguage();
  const t = conversationCopy(lang);
  const dc = dcCopy(lang);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [parsed, setParsed] = useState<ParsedChat | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [prepared, setPrepared] = useState<PreparedMessage[] | null>(null);
  const [result, setResult] = useState<ConversationResponse | null>(null);
  const [trimmed, setTrimmed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function onFile(file: File) {
    setFileError(null);
    setResult(null);
    setPrepared(null);
    try {
      const raw = await file.text();
      const chat = parseChatExport(file.name, raw);
      if (!chat) {
        setFileError(t.upload.invalid);
        setParsed(null);
        return;
      }
      setParsed(chat);
      setMe(null);
    } catch {
      setFileError(t.errors.network);
    }
  }

  function reset() {
    setParsed(null);
    setMe(null);
    setResult(null);
    setPrepared(null);
    setFileError(null);
    setError(null);
  }

  const noThemMessages = useMemo(() => {
    if (!parsed || !me) return false;
    return !parsed.messages.some((m) => m.sender !== me);
  }, [parsed, me]);

  async function submit() {
    if (!parsed || !me || status === "loading") return;
    setStatus("loading");
    setError(null);

    const clean = parsed.messages
      .map((m) => ({ ...m, text: m.text.trim() }))
      .filter((m) => m.text.length > 0)
      .map((m) => ({ ...m, text: m.text.length > MAX_CONVERSATION_MESSAGE_LENGTH ? m.text.slice(0, MAX_CONVERSATION_MESSAGE_LENGTH) : m.text }));
    const overCap = clean.length > MAX_CONVERSATION_MESSAGES;
    const kept = overCap ? clean.slice(-MAX_CONVERSATION_MESSAGES) : clean;
    setTrimmed(overCap);

    const items: PreparedMessage[] = kept.map((m) => {
      const { redacted, redactions } = redact(m.text);
      return { sender: m.sender, from: m.sender === me ? "me" : "them", text: m.text, at: m.at, redacted, redactions };
    });

    const res = await analyzeConversation({
      messages: items.map((it) => ({ from: it.from, text: it.redacted })),
      language: lang,
    });
    if (res.ok) {
      setPrepared(items);
      setResult(res.data);
      setStatus("idle");
      return;
    }
    setError(res.error);
    setStatus("error");
  }

  const otherNames = parsed && me ? parsed.participants.filter((p) => p !== me) : [];
  const flagsByIndex = useMemo(() => {
    const map = new Map<number, ConversationResponse["conversation"]["flags"]>();
    for (const f of result?.conversation.flags ?? []) {
      const list = map.get(f.index) ?? [];
      list.push(f);
      map.set(f.index, list);
    }
    return map;
  }, [result]);

  const dayCount = useMemo(() => {
    if (!prepared) return 0;
    return new Set(prepared.filter((m) => m.at).map((m) => formatDate(m.at, lang))).size;
  }, [prepared, lang]);

  const plan = result ? actionPlan(result.verdict, result.suggestedAction) : null;
  const verdictTone: Tone | null = result ? (result.verdict === "scam" ? "red" : result.verdict === "suspicious" ? "amber" : "green") : null;
  const headerName = parsed?.title || otherNames.join(", ") || parsed?.participants.join(", ") || "—";

  return (
    <DcPage label="Conversation">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        aside={
          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.json,text/plain,application/json"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
            />
            <Pill variant="outline" height={48} onClick={() => fileInput.current?.click()}>
              {t.upload.label}
            </Pill>
          </div>
        }
      />

      <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        {/* LEFT: chat card */}
        <div data-fx style={{ ...card(32, true), overflow: "hidden" }}>
          {!result ? (
            <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
              <div
                className={`${styles.dropZone}${dragOver ? ` ${styles.active}` : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void onFile(f); }}
                style={{ border: "1.5px dashed var(--dc-line-strong)", borderRadius: 20, padding: "36px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}
              >
                <span style={{ fontSize: 16, fontWeight: 500 }}>{t.upload.label}</span>
                <span style={{ fontSize: 13, color: "var(--dc-text3)", maxWidth: 420 }}>{t.upload.hint}</span>
                <Pill variant="outline" onClick={() => fileInput.current?.click()} style={{ marginTop: 6 }}>
                  {t.upload.choose}
                </Pill>
              </div>
              {fileError && <span style={{ fontSize: 14, color: "var(--dc-red)" }}>{fileError}</span>}

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.howTo.title}</span>
                <div className="dc-cols-1" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{t.howTo.whatsapp.label}</span>
                    <span style={{ fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.howTo.whatsapp.android}</span>
                    <span style={{ fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.howTo.whatsapp.iphone}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{t.howTo.messenger.label}</span>
                    <span style={{ fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.howTo.messenger.steps}</span>
                  </div>
                </div>
              </div>

              {parsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid var(--dc-line2)", paddingTop: 20 }}>
                  <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.who.title}</span>
                  <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.who.hint}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {parsed.participants.map((p) => (
                      <button key={p} type="button" style={chipStyle(me === p)} onClick={() => setMe(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                  {noThemMessages && <span style={{ fontSize: 14, color: "var(--dc-red)" }}>{t.upload.empty}</span>}
                  {error && <span style={{ fontSize: 14, color: "var(--dc-red)" }}>{error.message}</span>}
                  <Pill onClick={() => void submit()} disabled={!me || noThemMessages || status === "loading"} height={56} style={{ alignSelf: "flex-start" }}>
                    {status === "loading" ? t.analysing : t.submit}
                  </Pill>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ padding: "20px 28px", borderBottom: "1px solid var(--dc-line2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: "var(--dc-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600 }}>
                    {headerName.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headerName}</span>
                    <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text3)" }}>
                      {FORMAT_LABEL[parsed!.format]} · {fill(t.header.days, { n: dayCount })} · {fill(t.header.messages, { n: prepared!.length })}
                    </span>
                  </div>
                </div>
                <Pill variant="outline" onClick={reset} style={{ flexShrink: 0 }}>{t.another}</Pill>
              </div>
              <div data-nofx style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, maxHeight: 640, overflowY: "auto" }}>
                {(trimmed || result.conversation.truncated) && <span style={{ fontSize: 13, color: "var(--dc-amber)" }}>{t.header.truncated}</span>}
                {prepared!.map((m, i) => {
                  const mine = m.from === "me";
                  const flags = flagsByIndex.get(i) ?? [];
                  const flagged = flags.length > 0;
                  const dayLabel = formatDate(m.at, lang);
                  const prevDayLabel = i > 0 ? formatDate(prepared![i - 1].at, lang) : "";
                  const showDayChip = m.at && dayLabel !== prevDayLabel;
                  const flagTone = flagged ? (SEVERITY_TONE[flags[0].severity] ?? null) : null;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {showDayChip && <span className={styles.dayChip}>{dayLabel}</span>}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", gap: 6 }}>
                        <div
                          style={{
                            maxWidth: "78%", padding: "12px 16px", fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap",
                            background: mine ? "var(--dc-mine)" : "var(--dc-bubble)", color: mine ? "#fff" : "var(--dc-ink)",
                            borderRadius: mine ? "22px 22px 6px 22px" : "6px 22px 22px 22px",
                            outline: flagged && flagTone ? `1.5px solid ${TONE[flagTone].fg}` : "none",
                            outlineOffset: 2,
                          }}
                        >
                          {m.text}
                        </div>
                        <span className="dc-mono" style={{ fontSize: 11, color: "var(--dc-text3)" }}>
                          {mine ? t.thread.me : m.sender}{m.at ? ` · ${formatDate(m.at, lang)}` : ""}
                        </span>
                        {flagged && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: "78%" }}>
                            {flags.map((f, j) => {
                              const tone = SEVERITY_TONE[f.severity];
                              return (
                                <span
                                  key={j}
                                  title={restore(f.evidence, m.redactions)}
                                  style={{
                                    fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 999,
                                    background: tone ? TONE[tone].hl : "var(--dc-hover)", color: tone ? TONE[tone].fg : "var(--dc-text3)",
                                  }}
                                >
                                  {f.label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: aside */}
        <aside className="dc-sticky" style={{ position: "sticky", top: 92, display: "flex", flexDirection: "column", gap: 20 }}>
          {!result ? (
            <div data-fx style={{ ...card(32), padding: 32, display: "flex", flexDirection: "column", gap: 20 }}>
              <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.lookFor.title}</span>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {SCAM_STAGES.map((stage) => (
                  <li key={stage} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: "var(--dc-ink)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dc-text3)", flexShrink: 0 }} />
                    {copy.result.journey.labels[stage]}
                  </li>
                ))}
              </ul>
              <span style={{ fontSize: 13, color: "var(--dc-text3)", borderTop: "1px solid var(--dc-line2)", paddingTop: 16 }}>{t.sourceNote}</span>
            </div>
          ) : (
            <>
              <div data-fx style={{ ...card(32), padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Mark tone={verdictTone!} glyph={result.verdict === "scam" ? "✕" : result.verdict === "suspicious" ? "!" : "✓"} size={60} />
                  <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{dc.common.verdict}</span>
                  <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.03em", color: TONE[verdictTone!].fg }}>{getVerdictCopy(result.verdict, lang).label}</span>
                </div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: "var(--dc-text2)" }}>{result.explanation}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "var(--dc-text3)", paddingBottom: 6 }}>{t.story.title}</span>
                  {result.conversation.stages.length === 0 ? (
                    <span style={{ fontSize: 14, color: "var(--dc-text3)" }}>{t.story.empty}</span>
                  ) : (
                    result.conversation.stages.map((s, i) => (
                      <div key={s.stage} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", gap: 12, alignItems: "center", padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--dc-line2)" }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: TONE[verdictTone!].dot }} />
                        <span style={{ fontSize: 15, fontWeight: 500 }}>{copy.result.journey.labels[s.stage]}</span>
                        <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)" }}>{formatDate(prepared?.[s.index]?.at ?? null, lang)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {plan && (
                <WhatToDoPanel
                  label={t.todo.label}
                  headline={getVerdictCopy(result.verdict, lang).headline}
                  body={
                    <ol style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
                      {plan.steps.map((k) => (
                        <li key={k} style={{ display: "flex", gap: 10 }}>
                          <span style={{ opacity: 0.5 }}>—</span>
                          <span>{copy.result.steps[k]}</span>
                        </li>
                      ))}
                      {plan.prose && <li style={{ display: "flex", gap: 10 }}><span style={{ opacity: 0.5 }}>—</span><span>{plan.prose}</span></li>}
                    </ol>
                  }
                />
              )}

              <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.sourceNote}</span>
            </>
          )}
        </aside>
      </div>
    </DcPage>
  );
}
