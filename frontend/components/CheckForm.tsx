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
import { SUCCESS_DELAY_MS, useWaitStage, WaitFill, WaitStatus } from "./WaitProgress";
import { ImageIcon, RetryIcon } from "./icons";

/** Show the live character count once the message gets close to the API's limit. */
const COUNT_FROM = 4500;
/** "finishing": the answer is in; the bar runs to 100% and holds before navigating. */
type Status = "idle" | "loading" | "finishing" | "error";

/**
 * The Check screen form. Two ways in, one way out:
 *  - typed/pasted text, and
 *  - a screenshot, whose text is extracted by the backend OCR and put in the
 *    textarea for the user to review and correct (ScreenshotUpload.tsx).
 * Either way, only "Check this message" sends anything for analysis, and it
 * always redacts in the browser first (lib/redact.ts), so identifiers never
 * leave the device from this form. The backend also redacts OCR text
 * server-side as a second layer.
 */
export default function CheckForm() {
  const router = useRouter();
  const { lang, copy } = useLanguage();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  // True while the textarea holds text that came from a screenshot: the image
  // itself went to the server, so the typed-text privacy promise doesn't apply.
  const [textFromImage, setTextFromImage] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const shot = useScreenshot({
    lang,
    onText: (extracted) => {
      // Never overwrite what the user already typed: append after it.
      setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${extracted}` : extracted));
      setTextFromImage(true);
      if (status === "error") setStatus("idle");
      // Bring the text into view without focusing (a phone keyboard would cover it).
      requestAnimationFrame(() => sheetRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
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
  // Waiting covers the request and the short success finish, so the bar and
  // the button stay in one state until the result screen takes over.
  const loading = status === "loading" || status === "finishing";
  const waitPhase = status === "finishing" ? "done" : "running";
  const stage = useWaitStage(loading);
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
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await analyzeMessage({ message: redacted, language: lang }, { signal: controller.signal });
    if (controller.signal.aborted) return; // cancelled: cancel() already reset the form

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
      // Let the bar run to 100% and hold, then move on (stays "waiting" until the result screen takes over).
      setStatus("finishing");
      setTimeout(() => router.push("/result"), SUCCESS_DELAY_MS);
      return;
    }
    if (res.error.kind === "aborted") return;
    // The wait row is replaced by the error card: no bar left frozen mid-fill.
    setError(res.error);
    setStatus("error");
  }

  /** Stop waiting: abort the request and return to the editable form (text kept). */
  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }

  return (
    <section className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* One sheet: field name, input, attached screenshot and actions read as a
            single instrument face separated by rules, not stacked boxes. */}
        <div ref={sheetRef} className="sheet scroll-mt-4 focus-within:border-accent">
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
            className="block w-full resize-none border-0 bg-transparent px-4 py-3.5 text-[1.0625rem] leading-relaxed text-ink outline-none placeholder:text-ink-muted/60 focus:outline-none focus-visible:outline-none"
          />
          {overLimit && (
            <p id="message-too-long" className="bg-danger-soft px-4 py-2.5 text-sm text-danger-ink">
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

          <div className="flex">
            {/* Disabled is a muted surface with dark muted text, not white on
                pale grey — the label has to stay readable while inactive.
                While waiting it stays ink and shows a compact version of the
                wait row (same stage, same fill), not a separate spinner. The
                row below carries the live announcements, so this doesn't. */}
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={loading}
              className={`pressable font-heading relative flex min-h-14 flex-1 items-center justify-center overflow-hidden bg-ink px-5 text-[1.0625rem] font-semibold tracking-[0.06em] text-on-ink uppercase ${
                loading
                  ? "cursor-progress"
                  : "hover:bg-ink-2 disabled:cursor-not-allowed disabled:bg-muted-surface disabled:text-ink-muted"
              }`}
            >
              <span>{loading ? copy.wait.checkShort[stage] : copy.submit}</span>
              {loading && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 block h-0.5 overflow-hidden bg-on-ink/20">
                  <WaitFill phase={waitPhase} stage={stage} className="bg-on-ink" />
                </span>
              )}
            </button>

            {/* image/*: the OS picker offers Photo Library / Take Photo on phones
                (no custom camera). Anything the browser can decode is accepted,
                because lib/image.ts re-encodes it as JPEG before upload, which is
                one of the three formats the backend sniffs for. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
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
              aria-busy={shot.busy}
              aria-label={copy.uploadScreenshot}
              title={copy.uploadScreenshot}
              className={`pressable flex min-h-14 shrink-0 flex-col items-center justify-center gap-1 border-l border-card-border px-4 hover:bg-muted-surface disabled:cursor-not-allowed disabled:opacity-50 ${
                shot.state.phase !== "none" ? "text-ink" : "text-ink-muted"
              }`}
            >
              {/* No spinner here: the screenshot row shows the wait. */}
              <ImageIcon className="size-[18px]" />
              <span className="micro">{copy.screenshotLabel}</span>
            </button>
          </div>
        </div>
      </form>

      {/* One slot: the wait row while checking, the error card if it fails. */}
      {loading && (
        <div className="flex items-start gap-4 border-l-2 border-l-accent bg-card px-4 py-3.5">
          <WaitStatus phase={waitPhase} stage={stage} labels={copy.wait.check} progressLabel={copy.wait.progressLabel} />
          {status === "loading" && (
            <button
              type="button"
              onClick={cancel}
              className="pressable micro -mr-1 min-h-9 shrink-0 px-2 text-ink-muted hover:bg-muted-surface hover:text-ink"
            >
              {copy.wait.cancel}
            </button>
          )}
        </div>
      )}
      {status === "error" && error && <ErrorCard error={error} copy={copy} onRetry={() => void submit()} />}

      {/* Each promise only where it's true: typed text is redacted in the browser
          before anything leaves it; a screenshot goes to the server as it is. */}
      <p className="text-[0.8125rem] leading-snug text-ink-muted" aria-live="polite">
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
