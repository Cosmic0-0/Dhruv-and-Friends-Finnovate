"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeMessage, checkUrl, textProfile, type ApiError } from "@/lib/api";
import { redact } from "@/lib/redact";
import { addRecentCheck, saveResult, type StoredResult } from "@/lib/storage";
import { MAX_MESSAGE_LENGTH, type Channel, type CheckUrlResponse } from "@/lib/types";
import { useLanguage } from "../LanguageProvider";
import { card, chipStyle, IdlePanel, MONO, Pill, Seg } from "../dc";
import { ScreenshotRow, useScreenshot } from "../ScreenshotUpload";
import { SUCCESS_DELAY_MS, useWaitStage, WaitFill } from "../WaitProgress";
import { fill, type CheckCopy } from "./content";
import LinkResult from "./LinkResult";
import ResultArticle from "./ResultArticle";

type Mode = "message" | "link" | "screenshot";
type Status = "idle" | "loading" | "finishing" | "error";
const CHANNELS: Channel[] = ["sms", "whatsapp", "email", "facebook", "call"];

export default function Workspace({
  t,
  initialText = "",
  autoSubmit,
  onBack,
}: {
  t: CheckCopy;
  initialText?: string;
  /** Set by the Hub's "Check message" / "Try it with a real MCB scam": fire a real check immediately on mount. */
  autoSubmit?: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const { lang, copy } = useLanguage();
  const [mode, setMode] = useState<Mode>("message");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [text, setText] = useState(initialText);
  const [linkText, setLinkText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<StoredResult | null>(null);
  const [meta, setMeta] = useState<{ language: "en" | "fr" | "kreol" | "mixed" | null; links: number } | null>(null);
  const [linkStatus, setLinkStatus] = useState<Status>("idle");
  const [linkError, setLinkError] = useState<ApiError | null>(null);
  const [linkResult, setLinkResult] = useState<CheckUrlResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [screenshotText, setScreenshotText] = useState("");
  const shot = useScreenshot({ lang, onText: (extracted) => setScreenshotText(extracted) });

  useEffect(() => () => abortRef.current?.abort(), []);

  // Hub hand-off: "Check message" / "Try it with a real MCB scam" already
  // fired a real check — the workspace opens straight into it, once.
  const autoFired = useRef(false);
  useEffect(() => {
    if (!autoSubmit || autoFired.current) return;
    autoFired.current = true;
    setText(autoSubmit);
    void submitMessage(autoSubmit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit]);

  // Meta row: language + link count from the real, non-LLM /api/text-profile,
  // debounced while typing. Char count is just text.length (no round trip).
  useEffect(() => {
    if (mode !== "message" || !text.trim()) {
      setMeta(null);
      return;
    }
    const controller = new AbortController();
    const id = setTimeout(() => {
      void textProfile({ text: text.slice(0, MAX_MESSAGE_LENGTH) }, { signal: controller.signal }).then((res) => {
        if (res.ok) setMeta({ language: res.data.language, links: res.data.links });
      });
    }, 400);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [text, mode]);

  const loading = status === "loading" || status === "finishing";
  const stage = useWaitStage(status === "loading" || linkStatus === "loading");

  async function submitMessage(overrideText?: string) {
    const raw = (overrideText ?? text).trim();
    if (!raw || loading) return;
    const { redacted, redactions } = redact(raw);
    if (redacted.length > MAX_MESSAGE_LENGTH) {
      setError({ kind: "validation", reason: "message_too_long", message: copy.tooLong });
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError(null);
    setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const res = await analyzeMessage({ message: redacted, language: lang, ...(channel ? { channel } : {}) }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (res.ok) {
      const at = Date.now();
      const stored: StoredResult = { response: res.data, redacted, redactions, language: lang, at, source: overrideText !== undefined ? "screenshot" : "typed" };
      saveResult(stored);
      addRecentCheck({ text: redacted, verdict: res.data.verdict, at });
      setStatus("finishing");
      setTimeout(() => {
        setResult(stored);
        setStatus("idle");
      }, SUCCESS_DELAY_MS);
      return;
    }
    if (res.error.kind === "aborted") return;
    setError(res.error);
    setStatus("error");
  }

  async function submitLink() {
    const url = linkText.trim();
    if (!url || linkStatus === "loading") return;
    setLinkStatus("loading");
    setLinkError(null);
    setLinkResult(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const res = await checkUrl({ url }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (res.ok) {
      setLinkResult(res.data);
      setLinkStatus("idle");
    } else if (res.error.kind !== "aborted") {
      setLinkError(res.error);
      setLinkStatus("error");
    }
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setLinkStatus("idle");
  }

  function clearAll() {
    setText("");
    setLinkText("");
    setResult(null);
    setLinkResult(null);
    setError(null);
    setLinkError(null);
    setMeta(null);
    shot.remove();
  }

  const metaText = [
    meta?.language ? t.work.meta.lang[meta.language] : null,
    meta && meta.links > 0 ? (meta.links === 1 ? t.work.meta.links.one : fill(t.work.meta.links.other, { n: meta.links })) : null,
    text.length > 0 ? fill(t.work.meta.chars, { n: text.length }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      <button
        type="button"
        onClick={onBack}
        style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--dc-text2)", padding: 0 }}
      >
        {t.work.back}
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 680 }}>
        <h1 className="dc-h1" style={{ margin: 0, fontSize: 44, lineHeight: 1.02, fontWeight: 600, letterSpacing: "-0.04em" }}>
          {t.work.titleA}
          <em style={{ fontStyle: "normal", color: "var(--dc-accent)" }}>{t.work.titleB}</em>
          {t.work.titleC}
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--dc-text2)" }}>{t.work.lede}</p>
      </div>

      <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        {/* Input card */}
        <section style={{ ...card(32, true), padding: 28, display: "flex", flexDirection: "column", gap: 18 }} data-fx>
          <Seg
            options={[
              { id: "message", label: t.work.modes.message },
              { id: "link", label: t.work.modes.link },
              { id: "screenshot", label: t.work.modes.screenshot },
              { id: "document", label: t.work.modes.document },
            ]}
            value={mode === "message" ? "message" : mode === "link" ? "link" : "screenshot"}
            onChange={(v) => (v === "document" ? router.push("/document") : setMode(v as Mode))}
          />

          {mode === "message" && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.work.placeholder}
                rows={7}
                style={{
                  resize: "vertical",
                  border: "1px solid var(--dc-line)",
                  borderRadius: 20,
                  padding: 16,
                  fontSize: 15,
                  lineHeight: 1.6,
                  background: "var(--dc-hover)",
                  color: "var(--dc-ink)",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              {metaText && <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text3)" }}>{metaText}</span>}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.work.receivedBy}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CHANNELS.map((c) => (
                    <button key={c} type="button" style={chipStyle(channel === c)} onClick={() => setChannel(channel === c ? null : c)}>
                      {t.work.channels[c]}
                    </button>
                  ))}
                </div>
              </div>

              {status === "error" && error && <ErrorNote message={error.message} />}

              <div style={{ display: "flex", gap: 10 }}>
                <Pill variant="ink" height={52} onClick={() => void submitMessage()} disabled={!text.trim() || loading} style={{ flex: 1 }}>
                  {loading ? `${t.work.check}…` : t.work.check}
                </Pill>
                <Pill variant="outline" height={52} onClick={clearAll} disabled={loading}>
                  {t.work.clear}
                </Pill>
              </div>
              {loading && (
                <LoadingRow label={t.work.loadingTitle} stage={stage} onCancel={cancel} progressLabel={copy.wait.progressLabel} cancelLabel={copy.wait.cancel} />
              )}

              <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.work.privacy}</p>
              <button
                type="button"
                onClick={() => router.push("/document")}
                style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--dc-text2)", textDecoration: "underline", padding: 0 }}
              >
                {t.work.docInstead}
              </button>
            </>
          )}

          {mode === "link" && (
            <>
              <input
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder={t.work.linkPlaceholder}
                style={{
                  height: 52,
                  border: "1px solid var(--dc-line)",
                  borderRadius: 16,
                  padding: "0 16px",
                  fontSize: 15,
                  background: "var(--dc-hover)",
                  color: "var(--dc-ink)",
                  outline: "none",
                  fontFamily: MONO,
                }}
              />
              <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.work.linkHint}</p>
              {linkStatus === "error" && linkError && <ErrorNote message={linkError.message} />}
              <Pill variant="ink" height={52} onClick={() => void submitLink()} disabled={!linkText.trim() || linkStatus === "loading"}>
                {linkStatus === "loading" ? `${t.work.checkLink}…` : t.work.checkLink}
              </Pill>
              {linkStatus === "loading" && (
                <LoadingRow label={t.work.loadingLink} stage={stage} onCancel={cancel} progressLabel={copy.wait.progressLabel} cancelLabel={copy.wait.cancel} />
              )}
            </>
          )}

          {mode === "screenshot" && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void shot.pick(file);
                }}
              />
              <Pill variant="outline" height={52} onClick={() => fileRef.current?.click()} disabled={shot.busy}>
                {t.work.shotChoose}
              </Pill>
              <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.work.shotHint}</p>
              <ScreenshotRow state={shot.state} copy={copy} onRemove={shot.remove} onRetry={shot.retry} onTypeInstead={() => setMode("message")} />
              {shot.state.phase === "done" && (
                <>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--dc-accent)" }}>{t.work.shotReady}</p>
                  {status === "error" && error && <ErrorNote message={error.message} />}
                  <Pill variant="ink" height={52} onClick={() => void submitMessage(screenshotText)} disabled={loading}>
                    {loading ? `${t.work.check}…` : t.work.check}
                  </Pill>
                  {loading && (
                    <LoadingRow label={t.work.loadingTitle} stage={stage} onCancel={cancel} progressLabel={copy.wait.progressLabel} cancelLabel={copy.wait.cancel} />
                  )}
                </>
              )}
            </>
          )}
        </section>

        {/* Right column: idle / loading / result */}
        <div className="dc-sticky" style={{ position: "sticky", top: 92 }}>
          {result ? (
            <div style={{ ...card(32, true), padding: 32 }}>
              <ResultArticle result={result} t={t} oldCopy={copy} lang={lang} />
            </div>
          ) : mode === "link" && linkResult ? (
            <div style={{ ...card(32, true), padding: 32 }}>
              <LinkResult data={linkResult} t={t} />
            </div>
          ) : loading || linkStatus === "loading" ? (
            <IdlePanel title={mode === "link" ? t.work.loadingLink : t.work.loadingTitle} />
          ) : (
            <IdlePanel title={t.work.idleTitle} body={t.work.idleBody} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Screenshot OCR's own text never rendered — this reads it back only to hand to submitMessage. */

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" style={{ margin: 0, fontSize: 14, color: "var(--dc-red)", background: "var(--dc-red-hl)", borderRadius: 12, padding: "10px 14px" }}>
      {message}
    </p>
  );
}

function LoadingRow({
  label,
  stage,
  onCancel,
  progressLabel,
  cancelLabel,
}: {
  label: string;
  stage: number;
  onCancel: () => void;
  progressLabel: string;
  cancelLabel: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 14, color: "var(--dc-text2)" }}>{label}</span>
      <div role="progressbar" aria-label={progressLabel} style={{ position: "relative", height: 3, borderRadius: 3, overflow: "hidden", background: "var(--dc-line2)" }}>
        <WaitFill phase="running" stage={stage} className="bg-accent" />
      </div>
      <button type="button" onClick={onCancel} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--dc-text3)", padding: 0 }}>
        {cancelLabel}
      </button>
    </div>
  );
}
