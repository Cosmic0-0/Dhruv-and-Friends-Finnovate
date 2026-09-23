"use client";

import { useState } from "react";
import { reportSender } from "@/lib/api";
import type { Copy } from "@/lib/i18n";
import { CheckIcon, FlagIcon, Spinner } from "../icons";

type Status = "idle" | "form" | "sending" | "error";

/**
 * POST /api/report. With a known sender it's one tap; otherwise the user
 * types who sent it. Only the sender and the REDACTED message are sent.
 * DEMO NOTE: report twice to show the crowdsourced count going up.
 */
export default function ReportButton({
  sender,
  redacted,
  reported,
  onReported,
  copy,
}: {
  /** Original (restored) sender, when known. */
  sender?: string;
  redacted: string;
  reported?: { sender: string; reportCount: number };
  onReported: (r: { sender: string; reportCount: number }) => void;
  copy: Copy;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const r = copy.result.report;

  if (reported) {
    return (
      <div role="status" className="suggestion flex items-center gap-3 px-5 py-4">
        <CheckIcon className="size-[18px] shrink-0 text-safe-ink" strokeWidth={2.5} />
        <p className="text-[0.9375rem] leading-snug font-medium text-ink">{r.done(reported.reportCount)}</p>
      </div>
    );
  }

  async function send(who: string) {
    const trimmed = who.trim();
    if (!trimmed) return;
    setStatus("sending");
    setError("");
    const res = await reportSender({ sender: trimmed, message: redacted });
    if (res.ok) {
      onReported({ sender: res.data.sender, reportCount: res.data.reportCount });
      return;
    }
    setError(
      res.error.kind === "validation" ? copy.errors.validation[res.error.reason ?? "invalid"] : r.failed,
    );
    setStatus(sender ? "error" : "form");
  }

  const sending = status === "sending";
  // Unknown sender: after the first tap, the form stays open (including while sending and after an error).
  const showForm = !sender && status !== "idle";

  return (
    <section className="flex flex-col gap-3">
      {showForm ? (
        <form
          className="sheet flex flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void send(value);
          }}
        >
          <div className="flex flex-col gap-2.5 p-5">
            <label htmlFor="report-sender" className="micro text-ink-muted">
              {r.senderLabel}
            </label>
            <input
              id="report-sender"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={r.senderPlaceholder}
              inputMode="text"
              autoComplete="off"
              className="data rounded-2xl bg-muted-surface px-3.5 py-3 text-[0.9375rem] text-ink outline-none placeholder:text-ink-muted/60 focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={!value.trim() || sending}
            className="btn pressable m-5 mt-0 bg-primary text-on-primary disabled:bg-surface-dark/25"
          >
            {sending && <Spinner className="size-4" />}
            {sending ? r.sending : r.submit}
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={sending}
          onClick={() => (sender ? void send(sender) : setStatus("form"))}
          className="btn pressable w-full bg-danger-soft text-danger-ink hover:bg-danger-soft disabled:opacity-60"
        >
          {sending ? <Spinner className="size-4" /> : <FlagIcon className="size-4" strokeWidth={2} />}
          {sending ? r.sending : sender ? r.reportSender : r.reportMessage}
        </button>
      )}
      {error && (
        <p role="alert" className="px-1 text-[0.9375rem] text-danger-ink">
          {error}
        </p>
      )}
      <p className="px-1 text-[0.9375rem] leading-5 text-ink-muted">{r.note}</p>
    </section>
  );
}
