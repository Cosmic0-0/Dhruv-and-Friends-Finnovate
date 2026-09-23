"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeDocument, type ApiError, type ValidationReason } from "@/lib/api";
import { DOCUMENT_ACCEPT, formatFileSize, precheckDocument, withoutPreviews, type DocumentPrecheck } from "@/lib/document";
import type { Copy } from "@/lib/i18n";
import { redact } from "@/lib/redact";
import { addRecentCheck, saveResult, type StoredResult } from "@/lib/storage";
import { MAX_DOCUMENT_BYTES } from "@/lib/types";
import { DocumentIcon, RetryIcon, XIcon } from "../icons";
import { useLanguage } from "../LanguageProvider";
import ScreenTitle from "../ScreenTitle";
import { useWaitStage, WaitFill } from "../WaitProgress";

/**
 * Document check: a PDF or DOCX goes to POST /api/analyze/document as it is.
 * It is read raw (FileReader), never re-encoded like screenshots are
 * (lib/image.ts), because re-encoding would destroy exactly the structure the
 * backend inspects. All detection is server-side; this screen only picks the
 * file, shows honest progress (reading -> uploading % -> analysing) and hands
 * the result to /result.
 *
 * DEMO NOTE: drop data/test-payloads/documents/forged-signature.pdf here.
 */

type Failure = ApiError | "storage";
type Phase =
  | { kind: "idle" }
  | { kind: "selected"; file: File }
  | { kind: "reading"; file: File }
  | { kind: "uploading"; file: File; percent: number | null }
  | { kind: "analysing"; file: File }
  | { kind: "error"; file: File | null; error: Failure };

const PRECHECK_REASON: Record<Exclude<DocumentPrecheck, "ok">, ValidationReason> = {
  too_large: "document_too_large",
  unsupported: "document_unsupported",
  empty: "document_unreadable",
};

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

/** Never shows backend text: copy comes from lib/i18n.ts, keyed by the error kind. */
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

export default function DocumentCheck() {
  const router = useRouter();
  const { lang, copy } = useLanguage();
  const d = copy.document;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase.kind === "reading" || phase.kind === "uploading" || phase.kind === "analysing";
  const stage = useWaitStage(phase.kind === "analysing");

  // Leaving the screen cancels a read or an upload in flight.
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
        onUploadProgress: (f) => setPhase((p) => (p.kind === "uploading" ? { ...p, percent: Math.min(100, Math.round(f * 100)) } : p)),
        onUploaded: () => setPhase((p) => (p.kind === "uploading" ? { kind: "analysing", file } : p)),
      },
    );
    if (controller.signal.aborted) return;
    if (!res.ok) {
      if (res.error.kind !== "aborted") setPhase({ kind: "error", file, error: res.error });
      return;
    }

    const at = Date.now();
    const stored: StoredResult = {
      response: res.data,
      redacted: res.data.extractedText,
      // Redaction happened on the server; there is no local mapping to restore.
      redactions: [],
      language: lang,
      at,
      source: "document",
      fileName: file.name,
    };
    // Previews are the heaviest part: if sessionStorage is full, keep the result without them.
    if (!saveResult(stored) && !saveResult(withoutPreviews(stored))) {
      setPhase({ kind: "error", file, error: "storage" });
      return;
    }
    addRecentCheck({ text: res.data.extractedText.trim() || redact(file.name).redacted, verdict: res.data.verdict, at });
    router.push("/result");
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase((p) => (p.kind === "reading" || p.kind === "uploading" || p.kind === "analysing" ? { kind: "selected", file: p.file } : p));
  }

  const file = phase.kind === "idle" ? null : phase.file;
  const failure = phase.kind === "error" ? failureCopy(phase.error, copy) : null;

  return (
    <div>
      <ScreenTitle title={d.title} subtitle={d.subtitle} back={{ href: "/app", label: copy.tabs.check }} />

      <div className="gutter document-layout grid gap-6 pt-5 pb-10">
        <div className="document-main">

        <input
          ref={inputRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // allow picking the same file again
            pick(f);
          }}
        />

        <section
          aria-label={d.title}
          onDragOver={(e) => {
            if (busy) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`document-intake flex flex-col gap-5 px-5 py-6 transition-colors ${dragging ? "document-intake-active" : ""}`}
        >
          <div className="document-intake-head">
            <span>{lang === "fr" ? "Pièce à vérifier" : lang === "kreol" ? "Dokiman pou verifye" : "File for verification"}</span>
            <span>PDF / DOCX</span>
          </div>
          {file ? (
            <div className="document-file flex items-center gap-3">
              <span className="document-file-icon flex size-[42px] shrink-0 items-center justify-center text-ink">
                <DocumentIcon className="size-[21px]" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[1.0625rem] font-semibold text-ink">{file.name}</p>
                <p className="text-[0.9375rem] text-ink-muted">{formatFileSize(file.size, lang === "fr" ? "fr" : "en")}</p>
              </div>
              {!busy && (
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "idle" })}
                  aria-label={d.remove}
                  title={d.remove}
                  className="pressable flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted"
                >
                  <XIcon className="size-5" strokeWidth={2} />
                </button>
              )}
            </div>
          ) : (
            <div className="document-empty flex flex-col items-center gap-2 py-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/dhruv-and-friends.png" alt="" width={88} height={88} className="document-seal" />
              <p className="text-[1.0625rem] font-semibold text-ink">{dragging ? d.dropActive : d.drop}</p>
              <p className="text-[0.9375rem] text-ink-muted">{d.types}</p>
            </div>
          )}

          {busy ? (
            <div className="flex flex-col gap-2.5" aria-live="polite">
              <p className="text-[0.9375rem] leading-snug text-ink">
                {phase.kind === "reading" ? d.status.reading : phase.kind === "uploading" ? d.status.uploading(phase.percent) : d.status.analysing}
              </p>
              <span className="relative block h-1.5 overflow-hidden rounded-full bg-muted-surface">
                {phase.kind === "uploading" && phase.percent !== null ? (
                  <span className="absolute inset-y-0 left-0 block bg-accent transition-[width]" style={{ width: `${phase.percent}%` }} />
                ) : phase.kind === "analysing" ? (
                  <WaitFill phase="running" stage={stage} className="bg-accent" />
                ) : null}
              </span>
              {phase.kind === "analysing" && <p className="text-[0.8125rem] text-ink-muted">{d.status.analysingNote}</p>}
              <button type="button" onClick={cancel} className="pressable micro mx-auto min-h-11 px-4 text-ink-muted">
                {d.cancel}
              </button>
            </div>
          ) : file && (phase.kind === "selected" || !failure?.isInput) ? (
            // A picked file, or a service failure on it: checking again is the way forward.
            <button type="button" onClick={() => void check(file)} className="btn pressable w-full bg-primary text-on-primary">
              {phase.kind === "error" ? (
                <>
                  <RetryIcon className="size-4" strokeWidth={2} />
                  {copy.retry}
                </>
              ) : (
                d.check
              )}
            </button>
          ) : (
            <button type="button" onClick={() => inputRef.current?.click()} className="btn pressable w-full bg-primary text-on-primary">
              {d.choose}
            </button>
          )}
        </section>

        {failure && (
          <div role="alert" className={`flex flex-col gap-3 rounded-[28px] p-5 ${failure.isInput ? "bg-caution-soft" : "bg-danger-soft"}`}>
            <div className="flex flex-col gap-1">
              <p className={`micro ${failure.isInput ? "text-caution-ink" : "text-danger-ink"}`}>{failure.title}</p>
              <p className="text-[1.0625rem] leading-[1.4375rem] text-ink">{failure.body}</p>
            </div>
          </div>
        )}

        </div>
        <aside className="document-notes">
          <div className="document-note-block">
            <h2>{lang === "fr" ? "Ce que nous examinons" : lang === "kreol" ? "Ki nou examine" : "What we inspect"}</h2>
            <p>{d.intro}</p>
          </div>
          <div className="document-note-block">
            <h2>{lang === "fr" ? "Confidentialité du dossier" : lang === "kreol" ? "Konfidansialite ou dokiman" : "Your file's privacy"}</h2>
            <p>{d.privacy}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
