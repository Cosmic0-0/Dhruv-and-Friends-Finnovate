"use client";

import { useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { card, chipStyle, DcPage, IdlePanel, Mark, PageHeader, Pill, TONE, WhatToDoPanel, type Tone } from "@/components/dc";
import { analyzeConversation, type ApiError } from "@/lib/api";
import { actionPlan } from "@/lib/result";
import { redact, restore, type Redaction } from "@/lib/redact";
import { MAX_CONVERSATION_MESSAGES, MAX_CONVERSATION_MESSAGE_LENGTH, type ConversationResponse } from "@/lib/types";
import { getVerdictCopy } from "@/lib/verdict";
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

function formatDate(d: Date | null, lang: string): string {
  if (!d) return "";
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Whole-conversation analysis (design: Conversation.dc.html — this session
 * had no DesignSync access; built with the shared dc-* design system tokens
 * used elsewhere instead, see components/dc). Real WhatsApp .txt / Messenger
 * JSON parsing (./parse.ts) happens entirely client-side; only the redacted,
 * size-capped text of the chosen participant's counterpart is ever sent, in
 * one call to POST /api/analyze/conversation (backend/src/services/
 * conversation — additive, documented in docs/API-CONTRACT.md). Every flag,
 * stage and date shown below comes from that response or the export itself.
 */
export default function ConversationScreen() {
  const { lang, copy } = useLanguage();
  const t = conversationCopy(lang);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [parsed, setParsed] = useState<ParsedChat | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [prepared, setPrepared] = useState<PreparedMessage[] | null>(null);
  const [result, setResult] = useState<ConversationResponse | null>(null);
  const [trimmed, setTrimmed] = useState(false);

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

  function reset() {
    setParsed(null);
    setMe(null);
    setResult(null);
    setPrepared(null);
    setFileError(null);
    setError(null);
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

  const plan = result ? actionPlan(result.verdict, result.suggestedAction) : null;

  return (
    <DcPage label="Conversation">
      <PageHeader eyebrow={t.eyebrow} title={t.title} lede={t.lede} />

      {!result && (
        <div data-fx style={{ ...card(32), padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.upload.label}</span>
          <span style={{ fontSize: 14, color: "var(--dc-text3)" }}>{t.upload.hint}</span>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.json,text/plain,application/json"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
          />
          <Pill variant="outline" onClick={() => fileInput.current?.click()} style={{ alignSelf: "flex-start" }}>
            {t.upload.choose}
          </Pill>
          {fileError && <span style={{ fontSize: 14, color: "var(--dc-red)" }}>{fileError}</span>}

          {parsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid var(--dc-line2)", paddingTop: 18 }}>
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
      )}

      {!parsed && !result && <IdlePanel title={t.empty.title} body={t.empty.body} minHeight={280} />}

      {result && prepared && (
        <div data-nofx style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>
                {fill(t.header.with, { name: otherNames.join(", ") || "—" })}
              </span>
              <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)" }}>
                {fill(t.header.messages, { n: prepared.length })}
                {prepared[0]?.at && prepared.at(-1)?.at ? ` · ${fill(t.header.range, { from: formatDate(prepared[0].at, lang), to: formatDate(prepared.at(-1)!.at, lang) })}` : ""}
              </span>
              {(trimmed || result.conversation.truncated) && <span style={{ fontSize: 13, color: "var(--dc-amber)" }}>{t.header.truncated}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Mark tone={result.verdict === "scam" ? "red" : result.verdict === "suspicious" ? "amber" : "green"} glyph={result.verdict === "scam" ? "✕" : result.verdict === "suspicious" ? "!" : "✓"} size={48} />
              <span style={{ fontSize: 17, fontWeight: 600 }}>{getVerdictCopy(result.verdict, lang).label}</span>
            </div>
            <Pill variant="outline" onClick={reset}>{t.another}</Pill>
          </div>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>{t.story.title}</h2>
            {result.conversation.stages.length === 0 ? (
              <span style={{ fontSize: 14, color: "var(--dc-text3)" }}>{t.story.empty}</span>
            ) : (
              <ol style={{ display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" }}>
                {result.conversation.stages.map((s, i) => (
                  <li key={s.stage} style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 16, alignItems: "center", padding: "16px 0", borderTop: i === 0 ? "none" : "1px solid var(--dc-line2)" }}>
                    <span className="dc-mono" style={{ width: 44, height: 44, borderRadius: 15, background: "var(--dc-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 500 }}>{copy.result.journey.labels[s.stage]}</span>
                    <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)" }}>{formatDate(prepared[s.index]?.at ?? null, lang)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>{t.thread.title}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {prepared.map((m, i) => {
                const mine = m.from === "me";
                const flags = flagsByIndex.get(i) ?? [];
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", gap: 6 }}>
                    <div
                      style={{
                        maxWidth: "72%", borderRadius: 20, padding: "12px 16px", fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap",
                        background: mine ? "var(--dc-mine)" : "var(--dc-bubble)", color: "var(--dc-ink)",
                      }}
                    >
                      {m.text}
                    </div>
                    <span className="dc-mono" style={{ fontSize: 11, color: "var(--dc-text3)" }}>
                      {mine ? t.thread.me : m.sender}{m.at ? ` · ${formatDate(m.at, lang)}` : ""}
                    </span>
                    {flags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: "72%" }}>
                        {flags.map((f, j) => {
                          const tone = SEVERITY_TONE[f.severity];
                          return (
                            <span
                              key={j}
                              title={restore(f.evidence, m.redactions)}
                              style={{
                                fontSize: 12, padding: "4px 10px", borderRadius: 999,
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
                );
              })}
            </div>
          </section>

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
        </div>
      )}
    </DcPage>
  );
}
