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
      <div role="status" className="flex items-center gap-3 rounded-card border border-card-border bg-card px-5 py-4">
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-safe text-white">
          <CheckIcon className="size-4" strokeWidth={2.5} />
        </span>
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
          className="card flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(value);
          }}
        >
          <label htmlFor="report-sender" className="text-sm font-semibold text-ink">
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
            className="rounded-card border border-card-border bg-page px-4 py-3 text-base text-ink outline-none placeholder:text-ink-muted/70 focus:border-ink/40"
          />
          <button
            type="submit"
            disabled={!value.trim() || sending}
            className="flex min-h-12 items-center justify-center gap-2 rounded-card bg-ink px-5 font-semibold text-on-ink disabled:opacity-40"
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
          className="flex min-h-14 items-center justify-center gap-2.5 rounded-card border border-danger/30 bg-card px-5 font-semibold text-danger disabled:opacity-60"
        >
          {sending ? <Spinner className="size-5" /> : <FlagIcon className="size-5" strokeWidth={2} />}
          {sending ? r.sending : sender ? r.reportSender : r.reportMessage}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="px-1 text-[0.8125rem] leading-snug text-ink-muted">{r.note}</p>
    </section>
  );
}
