"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeMessage, analyzeScreenshot, type ApiError } from "@/lib/api";
import { redact } from "@/lib/redact";
import { addRecentCheck, saveResult } from "@/lib/storage";
import { MAX_IMAGE_BYTES, MAX_MESSAGE_LENGTH } from "@/lib/types";
import type { Copy } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";
import { ImageIcon, RetryIcon, Spinner } from "./icons";

/** Show the live character count once the message gets close to the API's limit. */
const COUNT_FROM = 4500;
/** A silent spinner past this point reads as a crash, so the label changes. */
const SLOW_AFTER_MS = 8000;
/** Backend sniffs actual bytes and accepts these three - see routes/index.js IMAGE_SIGNATURES. */
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";

type Status = "idle" | "loading" | "error";
/** Which submission is in flight/failed, so loading and retry target the right one. */
type Kind = "text" | "image";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

export default function CheckForm() {
  const router = useRouter();
  const { lang, copy } = useLanguage();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [kind, setKind] = useState<Kind>("text");
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Kept so "Try again" can resubmit an image error without re-picking the file.
  const lastFileRef = useRef<File | null>(null);

  // Cancel an in-flight check if the user leaves the screen.
  useEffect(() => () => abortRef.current?.abort(), []);

  const length = text.length;
  const overLimit = length > MAX_MESSAGE_LENGTH;
  const loading = status === "loading";
  const canSubmit = text.trim().length > 0 && !overLimit && !loading;

  async function submit() {
    if (!canSubmit) return;
    setKind("text");

    // Only the redacted text ever leaves the browser; the mapping stays local.
    const { redacted, redactions } = redact(text);
    if (redacted.length > MAX_MESSAGE_LENGTH) {
      // Placeholders are longer than some originals, so re-check the limit.
      setError({ kind: "validation", reason: "message_too_long", message: copy.tooLong });
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError(null);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await analyzeMessage({ message: redacted, language: lang }, { signal: controller.signal });
    clearTimeout(slowTimer);

    if (res.ok) {
      const at = Date.now();
      saveResult({ response: res.data, redacted, redactions, language: lang, at });
      addRecentCheck({ text: redacted, verdict: res.data.verdict, at });
      router.push("/result");
      return; // stay in the loading state until the result screen takes over
    }
    if (res.error.kind === "aborted") return;
    setError(res.error);
    setStatus("error");
  }

  async function submitScreenshot(file: File) {
    if (loading) return;
    lastFileRef.current = file;
    setKind("image");

    if (file.size > MAX_IMAGE_BYTES) {
      setError({ kind: "validation", reason: "image_too_large", message: copy.errors.validation.image_too_large });
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError(null);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const controller = new AbortController();
    abortRef.current = controller;

    let dataUrl: string;
    try {
      dataUrl = await readAsDataUrl(file);
    } catch {
      clearTimeout(slowTimer);
      setError({ kind: "validation", reason: "image_invalid", message: copy.errors.validation.image_invalid });
      setStatus("error");
      return;
    }

    // Backend content-sniffs the real bytes and redacts identifiers from the
    // OCR text server-side (see backend/src/services/redact) - the raw image
    // has to reach the server for OCR, so there's no client-side redaction
    // step to run first here, unlike the pasted-text path above.
    const res = await analyzeScreenshot({ image: dataUrl, language: lang }, { signal: controller.signal });
    clearTimeout(slowTimer);

    if (res.ok) {
      const at = Date.now();
      // No client-side "original" exists to restore (see backend redaction
      // note above), so redactions is empty - the result screen shows the
      // already-redacted extracted text as-is, not a restored original.
      saveResult({ response: res.data, redacted: res.data.extractedText, redactions: [], language: lang, at });
      addRecentCheck({ text: res.data.extractedText, verdict: res.data.verdict, at });
      router.push("/result");
      return;
    }
    if (res.error.kind === "aborted") return;
    setError(res.error);
    setStatus("error");
  }

  function retry() {
    if (kind === "image" && lastFileRef.current) void submitScreenshot(lastFileRef.current);
    else void submit();
  }

  return (
    <section className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* One sheet: field name, input and actions read as a single instrument
            face separated by rules, not three stacked boxes. */}
        <div className="sheet focus-within:border-accent">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <label htmlFor="message" className="micro text-ink-muted">
              {copy.messageLabel}
            </label>
            {length > COUNT_FROM && (
              <span
                aria-live="polite"
                className={`data ${overLimit ? "font-medium text-danger-ink" : "text-ink-muted"}`}
              >
                {copy.charCount(length, MAX_MESSAGE_LENGTH)}
              </span>
            )}
          </div>
          <textarea
            id="message"
            name="message"
            rows={6}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (status === "error" && error?.kind === "validation") setStatus("idle");
            }}
            placeholder={copy.placeholder}
            aria-invalid={overLimit || undefined}
            aria-describedby={overLimit ? "message-too-long" : undefined}
            className="block w-full resize-none border-0 bg-transparent px-4 py-3.5 text-[1.0625rem] leading-relaxed text-ink outline-none placeholder:text-ink-muted/60 focus:outline-none focus-visible:outline-none"
          />
          {overLimit && (
            <p id="message-too-long" className="bg-danger-soft px-4 py-2.5 text-sm text-danger-ink">
              {copy.tooLong}
            </p>
          )}

          <div className="flex">
            {/* Disabled is a muted surface with dark muted text, not white on
                pale grey — the label has to stay readable while inactive. */}
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={loading && kind === "text"}
              className="pressable font-heading flex min-h-14 flex-1 items-center justify-center gap-2.5 px-5 text-[1.0625rem] font-semibold tracking-[0.06em] uppercase disabled:cursor-not-allowed bg-ink text-on-ink hover:bg-ink-2 disabled:bg-muted-surface disabled:text-ink-muted"
            >
              {loading && kind === "text" && <Spinner className="size-5 shrink-0" />}
              <span aria-live="polite">
                {loading && kind === "text" ? (slow ? copy.stillWorking : copy.checking) : copy.submit}
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // allow re-picking the same file later
                if (file) void submitScreenshot(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              aria-busy={loading && kind === "image"}
              aria-label={copy.uploadScreenshot}
              className="pressable flex min-h-14 shrink-0 flex-col items-center justify-center gap-1 border-l border-card-border px-4 text-ink-muted hover:bg-muted-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && kind === "image" ? (
                <Spinner className="size-[18px] shrink-0" />
              ) : (
                <ImageIcon className="size-[18px]" />
              )}
              <span className="micro text-[0.5625rem]">{copy.screenshotLabel}</span>
            </button>
          </div>
        </div>
      </form>

      {status === "error" && error && <ErrorCard error={error} copy={copy} onRetry={retry} />}

      <p className="text-[0.8125rem] leading-snug text-ink-muted">{copy.privacyNote}</p>
    </section>
  );
}

function errorCopy(error: ApiError, copy: Copy): { title: string; body: string } {
  const e = copy.errors;
  switch (error.kind) {
    case "validation":
      return { title: e.validationTitle, body: e.validation[error.reason ?? "invalid"] };
    case "llm_unavailable":
      return { title: e.llmTitle, body: e.llm };
    case "network":
      return { title: e.networkTitle, body: e.network };
    case "timeout":
      return { title: e.timeoutTitle, body: e.timeout };
    default:
      return { title: e.unexpectedTitle, body: e.unexpected };
  }
}

/** Never renders backend text: copy comes from lib/i18n.ts, keyed by the error kind. */
function ErrorCard({ error, copy, onRetry }: { error: ApiError; copy: Copy; onRetry: () => void }) {
  const { title, body } = errorCopy(error, copy);
  const isInputProblem = error.kind === "validation";
  return (
    <div
      role="alert"
      className={`flex flex-col gap-3 border-l-2 p-4 ${
        isInputProblem ? "border-l-caution bg-caution-soft" : "border-l-danger bg-danger-soft"
      }`}
    >
      <div className="flex flex-col gap-1">
        <p className={`micro ${isInputProblem ? "text-caution-ink" : "text-danger-ink"}`}>{title}</p>
        <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{body}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="pressable micro flex min-h-10 w-fit items-center gap-2 bg-ink px-4 text-on-ink hover:bg-ink-2"
      >
        <RetryIcon className="size-3.5" strokeWidth={2} />
        {copy.retry}
      </button>
    </div>
  );
}
