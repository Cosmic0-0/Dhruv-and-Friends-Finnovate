"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeMessage, type ApiError } from "@/lib/api";
import { redact } from "@/lib/redact";
import { addRecentCheck, saveResult } from "@/lib/storage";
import { MAX_MESSAGE_LENGTH } from "@/lib/types";
import type { Copy } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";
import { ScreenshotRow, useScreenshot } from "./ScreenshotUpload";
import { ImageIcon, RetryIcon, Spinner } from "./icons";

/** Show the live character count once the message gets close to the API's limit. */
const COUNT_FROM = 4500;
/** A silent spinner past this point reads as a crash, so the label changes. */
const SLOW_AFTER_MS = 8000;

type Status = "idle" | "loading" | "error";

export default function CheckForm() {
  const router = useRouter();
  const { lang, copy } = useLanguage();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // True while the textarea holds text that came from a screenshot: the image
  // itself went to the server, so the typed-text privacy promise doesn't apply.
  const [textFromImage, setTextFromImage] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const shot = useScreenshot({
    lang,
    onText: (extracted) => {
      // Never overwrite what the user already typed: append after it.
      setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${extracted}` : extracted));
      setTextFromImage(true);
      if (status === "error") setStatus("idle");
      // Bring the text into view without focusing (a phone keyboard would cover it).
      requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    },
  });

  // Cancel an in-flight check if the user leaves the screen.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Grow the textarea to fit its content (from 6 rows up to a cap), so the
  // whole message, including OCR text that needs checking, is visible without
  // scrolling inside a small box.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.round(window.innerHeight * 0.6);
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [text]);

  const length = text.length;
  const overLimit = length > MAX_MESSAGE_LENGTH;
  const loading = status === "loading";
  const canSubmit = text.trim().length > 0 && !overLimit && !loading && !shot.busy;
  // The screenshot wording applies once an image is on its way to (or reached) the
  // server. A file rejected in the browser (no preview) never left the device.
  const s = shot.state;
  const imageInvolved =
    textFromImage ||
    s.phase === "preparing" ||
    s.phase === "reading" ||
    s.phase === "done" ||
    (s.phase === "error" && Boolean(s.previewUrl));

  function removeScreenshot() {
    shot.remove();
    if (!text.trim()) setTextFromImage(false);
  }

  function typeInstead() {
    removeScreenshot();
    textareaRef.current?.focus();
  }

  async function submit() {
    if (!canSubmit) return;

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
      saveResult({
        response: res.data,
        redacted,
        redactions,
        language: lang,
        at,
        source: textFromImage ? "screenshot" : "typed",
      });
      addRecentCheck({ text: redacted, verdict: res.data.verdict, at });
      router.push("/result");
      return; // stay in the loading state until the result screen takes over
    }
    if (res.error.kind === "aborted") return;
    setError(res.error);
    setStatus("error");
  }

  return (
    <section className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div
          ref={cardRef}
          className="card flex scroll-mt-4 flex-col gap-2 transition-shadow focus-within:border-ink/30 focus-within:ring-2 focus-within:ring-ink/10"
        >
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor="message"
              className="text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-muted uppercase"
            >
              {copy.messageLabel}
            </label>
            {length > COUNT_FROM && (
              <span
                aria-live="polite"
                className={`text-xs tabular-nums ${overLimit ? "font-semibold text-danger" : "text-ink-muted"}`}
              >
                {copy.charCount(length, MAX_MESSAGE_LENGTH)}
              </span>
            )}
          </div>
          <textarea
            ref={textareaRef}
            id="message"
            name="message"
            rows={6}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (status === "error" && error?.kind === "validation") setStatus("idle");
              // Cleared and no image attached: whatever is typed next is typed text.
              if (!e.target.value.trim() && shot.state.phase === "none") setTextFromImage(false);
            }}
            placeholder={copy.placeholder}
            aria-invalid={overLimit || undefined}
            aria-describedby={overLimit ? "message-too-long" : undefined}
            className="w-full resize-none border-0 bg-transparent p-0 text-[1.0625rem] leading-relaxed text-ink outline-none placeholder:text-ink-muted/70 focus:outline-none focus-visible:outline-none"
          />
          {overLimit && (
            <p id="message-too-long" className="text-sm text-danger">
              {copy.tooLong}
            </p>
          )}
          <ScreenshotRow
            state={shot.state}
            copy={copy}
            onRemove={removeScreenshot}
            onRetry={shot.retry}
            onTypeInstead={typeInstead}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            aria-busy={loading}
            className="flex min-h-14 flex-1 items-center justify-center gap-2.5 rounded-card bg-ink px-5 text-base font-semibold text-on-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40 aria-busy:opacity-100"
          >
            {loading && <Spinner className="size-5 shrink-0" />}
            <span aria-live="polite">{loading ? (slow ? copy.stillWorking : copy.checking) : copy.submit}</span>
          </button>

          {/* The OS picker offers Photo Library / Take Photo on phones; no custom camera. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow choosing the same file again
              if (file) void shot.pick(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={shot.busy || loading}
            aria-label={copy.uploadScreenshot}
            title={copy.uploadScreenshot}
            className={`grid size-14 shrink-0 place-items-center rounded-card border bg-card text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              shot.state.phase !== "none" ? "border-ink/40" : "border-card-border hover:border-ink/30"
            }`}
          >
            <ImageIcon className="size-6" />
          </button>
        </div>
      </form>

      {status === "error" && error && <ErrorCard error={error} copy={copy} onRetry={() => void submit()} />}

      {/* Each promise only where it's true: redaction happens in the browser for
          typed text, but a screenshot is sent to the server as it is. */}
      <p className="px-1 text-[0.8125rem] leading-snug text-ink-muted" aria-live="polite">
        {imageInvolved ? copy.imagePrivacyNote : copy.privacyNote}
      </p>
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
      className={`flex flex-col gap-3 rounded-card border p-5 ${
        isInputProblem ? "border-caution/30 bg-caution-soft" : "border-danger/20 bg-danger-soft"
      }`}
    >
      <div className="flex flex-col gap-1">
        <p className="font-serif text-lg leading-tight font-medium text-ink">{title}</p>
        <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{body}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex w-fit items-center gap-2 rounded-pill bg-ink px-4 py-2 text-sm font-semibold text-on-ink"
      >
        <RetryIcon className="size-4" strokeWidth={2} />
        {copy.retry}
      </button>
    </div>
  );
}
