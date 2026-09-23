"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { analyzeMessage, type ApiError } from "@/lib/api";
import { redact } from "@/lib/redact";
import { revealSteps } from "@/lib/result";
import { addRecentCheck, saveResult } from "@/lib/storage";
import { MAX_MESSAGE_LENGTH } from "@/lib/types";
import type { Copy } from "@/lib/i18n";
import InvestigationReveal from "./InvestigationReveal";
import { useLanguage } from "./LanguageProvider";
import { ScreenshotRow, useScreenshot } from "./ScreenshotUpload";
import { SUCCESS_DELAY_MS, useWaitStage, WaitFill, WaitStatus } from "./WaitProgress";
import { RetryIcon } from "./icons";

/** Per-item reveal pace in InvestigationReveal, plus a beat to read the last line before navigating. */
const REVEAL_HOLD_MS = (stepCount: number) => Math.min(2600, 500 + stepCount * 170);

/** Show the live character count once the message gets close to the API's limit. */
const COUNT_FROM = 4500;
/** "finishing": the answer is in; the bar runs to 100% and holds before navigating. */
type Status = "idle" | "loading" | "finishing" | "error";

/** What the Check screen's hero buttons drive. */
export interface CheckFormHandle {
  /** Open the field, and fill it from the clipboard if the browser allows it. */
  pasteAndFocus: () => void;
  /** Open the OS picker for a screenshot. */
  pickScreenshot: () => void;
}

/**
 * The Check form. Two ways in, one way out:
 *  - typed or pasted text, and
 *  - a screenshot, whose text is extracted by the backend OCR and put in the
 *    field for the user to review and correct (ScreenshotUpload.tsx).
 *
 * Either way the text is always shown in an editable field before anything is
 * checked, and only "Check this message" sends it. It always redacts in the
 * browser first (lib/redact.ts), so identifiers never leave the device from
 * this form; the backend redacts OCR text server-side as a second layer.
 *
 * The field starts collapsed: the hero's two buttons are the entry points, so
 * the screen opens on one question rather than on an empty textarea.
 */
export default function CheckForm({
  ref,
  onStateChange,
}: {
  ref?: React.Ref<CheckFormHandle>;
  /**
   * `busy`: the field is open or a check is running, so the screen hides the
   * cards below. `shotBusy`: a screenshot is being read, which is the only
   * thing that should grey out the hero's screenshot button.
   */
  onStateChange?: (s: { busy: boolean; shotBusy: boolean }) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, copy } = useLanguage();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  /** Set when the clipboard was empty or unreadable, so the field explains why it is blank. */
  const [pasteNote, setPasteNote] = useState(false);
  // Lines revealed during "finishing", each backed by a field the response
  // actually has (lib/result.ts's revealSteps). Empty while loading.
  const [reveal, setReveal] = useState<string[]>([]);
  // True while the field holds text that came from a screenshot: the image
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

  /**
   * Open the field and try the clipboard.
   *
   * The fallback is the main path on purpose. navigator.clipboard does not
   * exist on a non-secure origin (which includes reaching a dev server by LAN
   * IP), Safari shows its own paste confirmation, and Firefox has no
   * readText() at all — so the field opening and taking focus is what always
   * happens, and clipboard text is a bonus on top when the browser allows it.
   */
  function pasteAndFocus() {
    setOpen(true);
    const focusField = () => requestAnimationFrame(() => textareaRef.current?.focus());

    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard?.readText) {
      setPasteNote(false);
      focusField();
      return;
    }

    void clipboard
      .readText()
      .then((clip) => {
        const trimmed = clip.trim();
        if (!trimmed) {
          setPasteNote(true);
          focusField();
          return;
        }
        // Pasted text is shown for review, exactly like OCR text; it is never
        // checked straight off the clipboard.
        setPasteNote(false);
        setText((prev) => (prev.trim() ? prev : trimmed.slice(0, MAX_MESSAGE_LENGTH)));
        setTextFromImage(false);
        focusField();
      })
      .catch(() => {
        // Refused (no permission, or not a user gesture Safari accepts).
        setPasteNote(true);
        focusField();
      });
  }

  function pickScreenshot() {
    setOpen(true);
    fileRef.current?.click();
  }

  useImperativeHandle(ref, () => ({ pasteAndFocus, pickScreenshot }));

  const loading = status === "loading" || status === "finishing";
  useEffect(() => {
    onStateChange?.({ busy: open || loading, shotBusy: shot.busy });
  }, [open, loading, shot.busy, onStateChange]);

  // Handoff from the browser extension ("Open in FraudLens", "Check selected
  // text"): a scanned/selected snippet arrives as ?scan=, pre-fills the field
  // for the user to review - same pattern as OCR text - and is never
  // auto-submitted. ?new=1 is the tab bar's centre button: open the field
  // ready to type. Both are consumed once, then stripped from the URL so a
  // refresh or back-navigation doesn't re-fire them.
  useEffect(() => {
    const scanned = searchParams.get("scan");
    const isNew = searchParams.get("new");
    if (!scanned && !isNew) return;
    if (scanned) {
      setText((prev) => (prev.trim() ? prev : scanned.slice(0, MAX_MESSAGE_LENGTH)));
      setOpen(true);
    } else {
      pasteAndFocus();
    }
    router.replace("/", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grow the field to fit its content (from 6 rows up to a cap), so the whole
  // message, including OCR text that needs checking, is visible without
  // scrolling inside a small box.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.round(window.innerHeight * 0.6);
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [text, open]);

  const length = text.length;
  const overLimit = length > MAX_MESSAGE_LENGTH;
  // Waiting covers the request and the short success finish, so the bar and
  // the button stay in one state until the result screen takes over.
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
      // Let the bar run to 100% and hold while the investigation checklist
      // reveals what this exact response found, then move on.
      const steps = revealSteps(res.data, copy);
      setReveal(steps);
      setStatus("finishing");
      setTimeout(() => router.push("/result"), steps.length > 0 ? REVEAL_HOLD_MS(steps.length) : SUCCESS_DELAY_MS);
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

  // The picker input stays mounted even when the field is closed, so the
  // hero's screenshot button can open it without a render in between.
  const picker = (
    // image/*: the OS picker offers Photo Library / Take Photo on phones (no
    // custom camera). Anything the browser can decode is accepted, because
    // lib/image.ts re-encodes it as JPEG before upload, which is one of the
    // three formats the backend sniffs for.
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
  );

  if (!open && !loading && status !== "error") return picker;

  return (
    <section className="flex flex-col gap-3.5">
      {picker}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div ref={sheetRef} className="sheet scroll-mt-4">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
            <label htmlFor="message" className="micro text-ink-muted">
              {copy.messageLabel}
            </label>
            {length > COUNT_FROM && (
              <span aria-live="polite" className={`data ${overLimit ? "font-semibold text-danger-ink" : "text-ink-muted"}`}>
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
              setPasteNote(false);
              if (status === "error" && error?.kind === "validation") setStatus("idle");
              // Cleared and no image attached: whatever is typed next is typed text.
              if (!e.target.value.trim() && shot.state.phase === "none") setTextFromImage(false);
            }}
            placeholder={copy.placeholder}
            aria-invalid={overLimit || undefined}
            aria-describedby={overLimit ? "message-too-long" : undefined}
            className="block w-full resize-none border-0 bg-transparent px-5 py-2.5 text-[1.0625rem] leading-[1.4375rem] text-ink outline-none placeholder:text-ink-muted/60 focus:outline-none focus-visible:outline-none"
          />
          {pasteNote && (
            <p className="px-5 py-2.5 text-[0.9375rem] text-ink-muted" aria-live="polite">
              {copy.check.pasteFallback}
            </p>
          )}
          {overLimit && (
            <p id="message-too-long" className="bg-danger-soft px-5 py-2.5 text-[0.9375rem] text-danger-ink">
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

          <div className="flex gap-2.5 px-5 py-4">
            {/* While waiting this stays the primary pill and shows a compact
                version of the wait (same stage, same fill), not a separate
                spinner. The row below carries the live announcements. */}
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={loading}
              className={`pill pressable relative grow overflow-hidden bg-primary text-on-primary ${
                loading ? "cursor-progress" : "disabled:cursor-not-allowed disabled:bg-muted-surface disabled:text-ink-muted"
              }`}
            >
              <span>{loading ? copy.wait.checkShort[stage] : copy.submit}</span>
              {loading && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 block h-0.5 overflow-hidden bg-on-primary/20">
                  <WaitFill phase={waitPhase} stage={stage} className="bg-on-primary" />
                </span>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* One slot: the wait row while checking, the reveal checklist once the
          response is in, or the error card if it fails. */}
      {status === "finishing" && reveal.length > 0 ? (
        <div className="card">
          <InvestigationReveal heading={copy.result.investigate.heading} steps={reveal} />
        </div>
      ) : (
        loading && (
          <div className="card flex items-start gap-4">
            <WaitStatus phase={waitPhase} stage={stage} labels={copy.wait.check} progressLabel={copy.wait.progressLabel} />
            {status === "loading" && (
              <button
                type="button"
                onClick={cancel}
                className="pressable micro -mr-1 min-h-11 shrink-0 px-2 text-ink-muted"
              >
                {copy.wait.cancel}
              </button>
            )}
          </div>
        )
      )}
      {status === "error" && error && <ErrorCard error={error} copy={copy} onRetry={() => void submit()} />}

      {/* Each promise only where it's true: typed text is redacted in the browser
          before anything leaves it; a screenshot goes to the server as it is. */}
      <p className="px-1 text-[0.9375rem] leading-5 text-ink-muted" aria-live="polite">
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
      className={`flex flex-col gap-3 rounded-[28px] p-5 ${isInputProblem ? "bg-caution-soft" : "bg-danger-soft"}`}
    >
      <div className="flex flex-col gap-1">
        <p className={`micro ${isInputProblem ? "text-caution-ink" : "text-danger-ink"}`}>{title}</p>
        <p className="text-[1.0625rem] leading-[1.4375rem] text-ink">{body}</p>
      </div>
      <button type="button" onClick={onRetry} className="pill-sm pressable w-fit bg-primary text-on-primary">
        <RetryIcon className="size-4" strokeWidth={2} />
        {copy.retry}
      </button>
    </div>
  );
}
