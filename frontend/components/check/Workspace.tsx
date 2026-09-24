"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeMessage, checkUrl, textProfile, type ApiError } from "@/lib/api";
import { redact } from "@/lib/redact";
import { addRecentCheck, saveResult, type StoredResult } from "@/lib/storage";
import { MAX_MESSAGE_LENGTH, type AnalyzeScreenshotResponse, type Channel, type CheckUrlResponse } from "@/lib/types";
import { useLanguage } from "../LanguageProvider";
import { card, chipStyle, MONO, Pill } from "../dc";
import { ScreenshotRow, useScreenshot } from "../ScreenshotUpload";
import { SUCCESS_DELAY_MS, useWaitStage, WaitFill } from "../WaitProgress";
import { fill, type CheckCopy } from "./content";
import LinkResult from "./LinkResult";
import ResultArticle from "./ResultArticle";

type Mode = "message" | "link" | "screenshot";
type Status = "idle" | "loading" | "finishing" | "error";
const CHANNELS: Channel[] = ["sms", "whatsapp", "email", "facebook", "call"];

/** A pasted/dropped screenshot arrives as a file, not text — used by the message box's paste/drop handlers. */
function imageFromClipboard(data: DataTransfer): File | null {
  for (const item of data.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

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

  // The screenshot route's own verdict (text + image forensics), shown as-is
  // on Check. Re-sending its OCR text to /api/analyze would drop the image
  // signals and spend a second analysis.
  const [screenshotResult, setScreenshotResult] = useState<AnalyzeScreenshotResponse | null>(null);
  const shot = useScreenshot({ lang, onResult: setScreenshotResult });

  // Hub hand-off: "Check message" / "Try it with a real MCB scam" already
  // fired a real check — the workspace opens straight into it, once.
  const autoFired = useRef(false);

  // Unmounting aborts the check in flight, so the hand-off must be allowed to
  // fire again on a remount (React's dev double-mount did exactly this and
  // left the workspace stuck on "Reading the message…").
  useEffect(
    () => () => {
      abortRef.current?.abort();
      autoFired.current = false;
    },
    []
  );
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
      const stored: StoredResult = { response: res.data, redacted, redactions, language: lang, at, source: "typed" };
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

  function showScreenshotResult() {
    if (!screenshotResult || loading) return;
    // Already redacted server-side, so there is no local placeholder mapping.
    const redacted = screenshotResult.extractedText;
    const at = Date.now();
    const stored: StoredResult = { response: screenshotResult, redacted, redactions: [], language: lang, at, source: "screenshot" };
    saveResult(stored);
    addRecentCheck({ text: redacted, verdict: screenshotResult.verdict, at });
    setError(null);
    setStatus("finishing");
    setTimeout(() => {
      setResult(stored);
      setStatus("idle");
    }, SUCCESS_DELAY_MS);
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

  // Lets the message box double as a screenshot drop target: paste or drop an
  // image there and it's handed to the same screenshot pipeline as the
  // Screenshot tab, switching modes so its progress/result show up.
  function handleImageFile(file: File) {
    setMode("screenshot");
    void shot.pick(file);
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
    setScreenshotResult(null);
  }

  const metaText = [
    meta?.language ? t.work.meta.lang[meta.language] : null,
    meta && meta.links > 0 ? (meta.links === 1 ? t.work.meta.links.one : fill(t.work.meta.links.other, { n: meta.links })) : null,
    text.length > 0 ? fill(t.work.meta.chars, { n: text.length }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const TABS: { id: Mode | "document"; label: string }[] = [
    { id: "message", label: t.work.modes.message },
    { id: "link", label: t.work.modes.link },
    { id: "screenshot", label: t.work.modes.screenshot },
    { id: "document", label: t.work.modes.document },
  ];

  const anyLoading = loading || linkStatus === "loading";
  const primaryLabel =
    mode === "link" ? (linkStatus === "loading" ? `${t.work.checkLink}…` : t.work.checkLink) : loading ? `${t.work.check}…` : t.work.check;
  const primaryDisabled =
    mode === "link" ? !linkText.trim() || linkStatus === "loading" : mode === "screenshot" ? shot.state.phase !== "done" || !screenshotResult || loading : !text.trim() || loading;
  const primaryOnClick = mode === "link" ? () => void submitLink() : mode === "screenshot" ? showScreenshotResult : () => void submitMessage();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      <button
        type="button"
        onClick={onBack}
        style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--dc-text2)", padding: 0 }}
      >
        {t.work.back}
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
        <h1 className="dc-h1" style={{ margin: 0, fontSize: 68, lineHeight: 1, fontWeight: 600, letterSpacing: "-0.04em" }}>
          {t.work.titleA}
          <span style={{ color: "var(--dc-text3)" }}>{t.work.titleB}</span>
          {t.work.titleC}
        </h1>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "var(--dc-text2)" }}>{t.work.lede}</p>
      </div>

      <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr)", gap: 48, alignItems: "start" }}>
        {/* LEFT: input card + controls, sticky */}
        <div className="dc-sticky" style={{ position: "sticky", top: 108, display: "flex", flexDirection: "column", gap: 20 }}>
          <section style={{ ...card(28, true), overflow: "hidden" }} data-fx>
            <div style={{ display: "flex", gap: 24, padding: "18px 28px 0", borderBottom: "1px solid var(--dc-line2)" }}>
              {TABS.map((tab) => {
                const active = tab.id === mode;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => (tab.id === "document" ? router.push("/document") : setMode(tab.id as Mode))}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 14,
                      padding: "0 0 14px",
                      marginBottom: -1,
                      color: active ? "var(--dc-ink)" : "var(--dc-text3)",
                      borderBottom: active ? "1.5px solid var(--dc-ink)" : "1.5px solid transparent",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {mode === "message" && (
              <div
                style={{ display: "flex", flexDirection: "column" }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && file.type.startsWith("image/")) handleImageFile(file);
                }}
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onPaste={(e) => {
                    const file = imageFromClipboard(e.clipboardData);
                    if (file) {
                      e.preventDefault();
                      handleImageFile(file);
                    }
                  }}
                  placeholder={t.work.placeholder}
                  rows={7}
                  style={{
                    resize: "none",
                    border: "none",
                    outline: "none",
                    padding: "28px 28px 20px",
                    fontSize: 20,
                    lineHeight: 1.55,
                    background: "transparent",
                    color: "var(--dc-ink)",
                    fontFamily: "inherit",
                    width: "100%",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "0 28px 4px" }}>
                  <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text3)" }}>{metaText || " "}</span>
                  <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text4)" }}>{fill(t.work.meta.chars, { n: text.length })}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--dc-text4)", padding: "0 28px 20px" }}>{t.work.pasteHint}</p>
              </div>
            )}

            {mode === "link" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "24px 28px 24px" }}>
                <input
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder={t.work.linkPlaceholder}
                  style={{
                    border: "none",
                    outline: "none",
                    padding: 0,
                    fontSize: 20,
                    lineHeight: 1.55,
                    background: "transparent",
                    color: "var(--dc-ink)",
                    fontFamily: MONO,
                    width: "100%",
                  }}
                />
                <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.work.linkHint}</p>
              </div>
            )}

            {mode === "screenshot" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 28px 24px" }}>
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
                <Pill variant="outline" height={48} onClick={() => fileRef.current?.click()} disabled={shot.busy} style={{ alignSelf: "flex-start" }}>
                  {t.work.shotChoose}
                </Pill>
                <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.work.shotHint}</p>
                <ScreenshotRow state={shot.state} copy={copy} onRemove={() => { shot.remove(); setScreenshotResult(null); }} onRetry={shot.retry} onTypeInstead={() => setMode("message")} />
                {shot.state.phase === "done" && <p style={{ margin: 0, fontSize: 13, color: "var(--dc-accent)" }}>{t.work.shotReady}</p>}
              </div>
            )}
          </section>

          {mode === "message" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.work.receivedBy}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CHANNELS.map((c) => (
                  <button key={c} type="button" style={chipStyle(channel === c, 36)} onClick={() => setChannel(channel === c ? null : c)}>
                    {t.work.channels[c]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "message" && status === "error" && error && <ErrorNote message={error.message} />}
          {mode === "link" && linkStatus === "error" && linkError && <ErrorNote message={linkError.message} />}
          {mode === "screenshot" && status === "error" && error && <ErrorNote message={error.message} />}

          <div style={{ display: "flex", gap: 10 }}>
            <Pill variant="ink" height={56} onClick={primaryOnClick} disabled={primaryDisabled} style={{ flex: 1 }}>
              {primaryLabel}
            </Pill>
            <Pill variant="outline" height={56} onClick={clearAll} disabled={anyLoading}>
              {t.work.clear}
            </Pill>
          </div>

          {((mode === "link" && linkStatus === "loading") || (mode !== "link" && loading)) && (
            <LoadingRow
              label={mode === "link" ? t.work.loadingLink : t.work.loadingTitle}
              stage={stage}
              onCancel={cancel}
              progressLabel={copy.wait.progressLabel}
              cancelLabel={copy.wait.cancel}
            />
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.work.privacy}</span>
            <button
              type="button"
              onClick={() => router.push("/document")}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--dc-text2)", textDecoration: "underline", textDecorationColor: "var(--dc-underline)", textUnderlineOffset: 3, padding: 0 }}
            >
              {t.work.docInstead}
            </button>
          </div>
        </div>

        {/* RIGHT: idle / loading / result */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {result ? (
            <ResultArticle result={result} t={t} oldCopy={copy} lang={lang} />
          ) : mode === "link" && linkResult ? (
            <div style={{ ...card(28, true), padding: 32, overflow: "hidden" }}>
              <LinkResult data={linkResult} t={t} />
            </div>
          ) : (
            <div style={{ border: "1px solid var(--dc-line)", borderRadius: 28, minHeight: 520, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 36, gap: 10 }}>
              <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.1 }}>
                {anyLoading ? (mode === "link" ? t.work.loadingLink : t.work.loadingTitle) : t.work.idleTitle}
              </span>
              {!anyLoading && <span style={{ fontSize: 15, color: "var(--dc-text3)" }}>{t.work.idleBody}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
