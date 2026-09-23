"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeScreenshot, type ApiErrorKind, type ValidationReason } from "@/lib/api";
import { compressImage, ImageError, type ImageErrorCode } from "@/lib/image";
import type { Copy, UiLanguage } from "@/lib/i18n";
import { MAX_IMAGE_BYTES } from "@/lib/types";
import { CheckIcon, RetryIcon, XIcon } from "./icons";
import { SUCCESS_DELAY_MS, useWaitStage, WaitStatus } from "./WaitProgress";

/**
 * Screenshot → text, for the user to review. The image is compressed in the
 * browser, sent to POST /api/analyze/screenshot (the backend's OCR; nothing
 * is read client-side), and only `extractedText` is used: it goes into the
 * editable textarea, never straight to a verdict. OCR misreads characters,
 * so the user sees and fixes the text, then presses Check, which redacts it
 * like typed text.
 *
 * DEMO NOTE: attach an SMS screenshot and let the extracted text appear in
 * the box, fix a character live, then press Check.
 */

type ServiceErrorKind = Exclude<ApiErrorKind, "validation" | "aborted">;
export type ShotError = { kind: "image"; reason: ValidationReason } | { kind: ServiceErrorKind };

/**
 * preparing → reading → finishing → done. "finishing" is the short success
 * run-in: the bar goes to 100% and holds, then the text is handed over.
 */
export type ShotState =
  | { phase: "none" }
  | { phase: "preparing" }
  | { phase: "reading"; previewUrl: string }
  | { phase: "finishing"; previewUrl: string }
  | { phase: "done"; previewUrl: string }
  | { phase: "error"; previewUrl?: string; error: ShotError; canRetry: boolean };

const IMAGE_ERROR_REASON: Record<ImageErrorCode, ValidationReason> = {
  not_image: "image_invalid",
  too_large: "image_too_large",
  unreadable: "image_unreadable",
};

export function useScreenshot({ lang, onText }: { lang: UiLanguage; onText: (text: string) => void }) {
  const [state, setState] = useState<ShotState>({ phase: "none" });
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);
  const dataUrlRef = useRef<string | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const releasePreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  };

  // Cancel an in-flight read and free the preview when leaving the screen.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      releasePreview();
    },
    [],
  );

  const read = useCallback(
    async (dataUrl: string, previewUrl: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ phase: "reading", previewUrl });

      const res = await analyzeScreenshot({ image: dataUrl, language: lang }, { signal: controller.signal });
      if (controller.signal.aborted) return; // removed or replaced meanwhile

      if (res.ok) {
        const text = res.data.extractedText.trim();
        if (!text) {
          setState({ phase: "error", previewUrl, error: { kind: "image", reason: "image_no_text" }, canRetry: false });
          return;
        }
        // Run the bar to 100% and hold, then hand the text over (unless removed meanwhile).
        setState({ phase: "finishing", previewUrl });
        setTimeout(() => {
          if (controller.signal.aborted || abortRef.current !== controller) return;
          setState({ phase: "done", previewUrl });
          onTextRef.current(text);
        }, SUCCESS_DELAY_MS);
        return;
      }
      const e = res.error;
      if (e.kind === "aborted") return;
      if (e.kind === "validation") {
        setState({ phase: "error", previewUrl, error: { kind: "image", reason: e.reason ?? "invalid" }, canRetry: false });
      } else {
        setState({ phase: "error", previewUrl, error: { kind: e.kind }, canRetry: true });
      }
    },
    [lang],
  );

  const pick = useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      releasePreview();
      dataUrlRef.current = null;
      setState({ phase: "preparing" });
      try {
        const img = await compressImage(file);
        if (img.blob.size > MAX_IMAGE_BYTES) throw new ImageError("too_large");
        const previewUrl = URL.createObjectURL(img.blob);
        previewRef.current = previewUrl;
        dataUrlRef.current = img.dataUrl;
        await read(img.dataUrl, previewUrl);
      } catch (err) {
        const code: ImageErrorCode = err instanceof ImageError ? err.code : "unreadable";
        if (!(err instanceof ImageError)) console.warn("[screenshot] couldn't prepare image", err);
        setState({ phase: "error", error: { kind: "image", reason: IMAGE_ERROR_REASON[code] }, canRetry: false });
      }
    },
    [read],
  );

  const retry = useCallback(() => {
    if (dataUrlRef.current && previewRef.current) void read(dataUrlRef.current, previewRef.current);
  }, [read]);

  const remove = useCallback(() => {
    abortRef.current?.abort();
    releasePreview();
    dataUrlRef.current = null;
    setState({ phase: "none" });
  }, []);

  const busy = state.phase === "preparing" || state.phase === "reading" || state.phase === "finishing";
  return { state, pick, retry, remove, busy };
}

function errorCopy(error: ShotError, copy: Copy): { title: string; body: string } {
  const e = copy.errors;
  if (error.kind === "image") return { title: e.ocrTitle, body: e.validation[error.reason] };
  switch (error.kind) {
    case "network":
      return { title: e.networkTitle, body: e.network };
    case "timeout":
      return { title: e.timeoutTitle, body: e.timeout };
    case "llm_unavailable":
      return { title: e.llmTitle, body: e.llm };
    case "ocr_failed":
      return { title: e.ocrTitle, body: e.ocr };
    default:
      return { title: e.unexpectedTitle, body: e.unexpected };
  }
}

/** Thumbnail, progress and outcome for the attached screenshot. Never renders backend text. */
export function ScreenshotRow({
  state,
  copy,
  onRemove,
  onRetry,
  onTypeInstead,
}: {
  state: ShotState;
  copy: Copy;
  onRemove: () => void;
  onRetry: () => void;
  onTypeInstead: () => void;
}) {
  // The whole wait (compressing, uploading, reading) is one continuous bar and stage sequence.
  const waiting = state.phase === "preparing" || state.phase === "reading" || state.phase === "finishing";
  const stage = useWaitStage(waiting);
  if (state.phase === "none") return null;
  const previewUrl = "previewUrl" in state ? state.previewUrl : undefined;

  let status: React.ReactNode = null;
  if (waiting)
    status = (
      <WaitStatus
        phase={state.phase === "finishing" ? "done" : "running"}
        stage={stage}
        labels={copy.wait.screenshot}
        progressLabel={copy.wait.progressLabel}
        textClassName="text-sm leading-snug text-ink-soft"
      />
    );
  else if (state.phase === "done")
    status = (
      <span className="flex items-start gap-2">
        <CheckIcon className="mt-0.5 size-4 shrink-0 text-accent-ink" strokeWidth={2.5} />
        <span className="text-ink-soft">{copy.shot.extracted}</span>
      </span>
    );

  // Sits inside CheckForm's .sheet, which draws the rule above it.
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden border border-card-border bg-muted-surface">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={previewUrl} alt={copy.shot.alt} className="size-full object-cover object-top" />
          )}
          {/* Dimmed while waiting; the bar beside it shows the wait (no separate spinner). */}
          {waiting && <div aria-hidden="true" className="absolute inset-0 bg-surface-dark/25" />}
        </div>
        {waiting ? (
          status
        ) : (
          <p className="min-w-0 flex-1 text-sm leading-snug text-ink-soft" aria-live="polite">
            {status}
          </p>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={copy.shot.remove}
          title={copy.shot.remove}
          className="pressable grid size-10 shrink-0 place-items-center text-ink-muted hover:bg-muted-surface hover:text-ink"
        >
          <XIcon className="size-5" strokeWidth={2} />
        </button>
      </div>

      {state.phase === "error" && (
        // Same treatment as CheckForm's ErrorCard: a left rule, not a floating box.
        <div role="alert" className="flex flex-col gap-3 border-l-2 border-l-caution bg-caution-soft p-4">
          <div className="flex flex-col gap-1">
            <p className="micro text-caution-ink">{errorCopy(state.error, copy).title}</p>
            <p className="text-sm leading-relaxed text-ink-soft">{errorCopy(state.error, copy).body}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.canRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="pressable micro flex min-h-10 items-center gap-2 bg-surface-dark px-4 text-on-ink hover:bg-surface-dark-2"
              >
                <RetryIcon className="size-3.5" strokeWidth={2} />
                {copy.retry}
              </button>
            )}
            <button
              type="button"
              onClick={onTypeInstead}
              className="pressable micro min-h-10 border border-line-strong bg-card px-4 text-ink hover:bg-muted-surface"
            >
              {copy.shot.typeInstead}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
