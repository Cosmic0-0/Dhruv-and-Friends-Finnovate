"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import ScreenTitle from "./ScreenTitle";
import { batchScan, type ApiError, type ClientBatchResult } from "@/lib/api";
import { intelligenceCopy } from "@/lib/intelligence-copy";
import { humanizeType, signalKind, sortSignals } from "@/lib/result";
import { MAX_BATCH_SIZE, MAX_MESSAGE_LENGTH } from "@/lib/types";
import { getVerdictDisplay } from "@/lib/verdict";
import { useLanguage } from "./LanguageProvider";
import { signalTitle } from "./result/sections";

type Status = "idle" | "loading" | "error";

/** One paste box, messages separated by a blank line — matches how people
 * actually have several SMS sitting in a notes app, rather than a growing
 * list of tiny inputs. */
function parseMessages(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Batch investigation workspace (Phase 11): submit several messages, see an
 * aggregate summary, any campaign a scan actually surfaced (grouped by the
 * same ScamDNA fingerprint the single-check flow uses — never a fabricated
 * cluster), and the per-message breakdown. Calls the existing
 * POST /api/batch-scan through lib/api.ts's batchScan() — no local
 * detection logic.
 */
export default function BatchScan() {
  const { lang, copy } = useLanguage();
  const t = intelligenceCopy(lang);
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [results, setResults] = useState<ClientBatchResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; scamCount: number; suspiciousCount: number; safeCount: number; failedCount: number } | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messages = parseMessages(raw);
  const tooMany = messages.length > MAX_BATCH_SIZE;
  const tooLong = messages.some((m) => m.length > MAX_MESSAGE_LENGTH);
  const canSubmit = messages.length > 0 && !tooMany && !tooLong && status !== "loading";

  async function submit() {
    if (!canSubmit) return;
    setStatus("loading");
    setError(null);
    setFilter(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const res = await batchScan({ messages }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (res.ok) {
      setResults(res.data.results);
      setSummary({ ...res.data.summary, failedCount: res.data.failedCount });
      setStatus("idle");
      return;
    }
    if (res.error.kind === "aborted") return;
    setError(res.error);
    setStatus("error");
  }

  // Only ever built from campaigns THIS scan actually matched — a message
  // whose ScamDNA lookup came back "new" never appears here.
  const campaigns = results
    ? groupByCampaign(results)
    : [];

  const filtered = results && filter ? results.filter((r) => r.scamDna?.fingerprintId === filter) : results;

  return (
    <>
      <ScreenTitle title={t("Batch scan")} back={{ href: "/", label: copy.tabs.check }} />
      <div className="gutter flex flex-col gap-4 pt-4">
        <p className="text-[1.0625rem] leading-[1.4375rem] text-ink-soft">
          {t("Paste each message separately, with a blank line between them, up to 50 at a time.")}
        </p>

      <div className="sheet flex flex-col">
        <label htmlFor="batch-messages" className="micro px-4 pt-3 text-ink-muted">
          {t("Messages to scan")}
        </label>
        <textarea
          id="batch-messages"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder={t("Message one…\n\nMessage two…\n\nMessage three…")}
          className="block w-full resize-y border-0 bg-transparent px-4 py-3.5 text-[1.0625rem] leading-relaxed text-ink outline-none placeholder:text-ink-muted/60 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 border-t border-card-border px-4 py-2.5">
          <span className="data text-ink-muted">
            {messages.length} / {MAX_BATCH_SIZE}
          </span>
          {(tooMany || tooLong) && (
            <span className="text-sm text-danger-ink">{tooMany ? copy.errors.validation.batch_too_many : copy.errors.validation.batch_item_too_long}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="pill pressable bg-primary text-on-primary disabled:cursor-not-allowed disabled:bg-muted-surface disabled:text-ink-muted"
        >
          {status === "loading" && <span className="size-4 animate-spin rounded-full border-2 border-on-ink/30 border-t-on-ink" />}
          {status === "loading" ? t("Scanning…") : t("Scan messages")}
        </button>
      </div>

      {error && (
        <div role="alert" className="border-l-2 border-danger bg-danger-soft p-4 text-sm text-ink">
          {error.kind === "validation" ? copy.errors.validation[error.reason ?? "invalid"] : copy.errors.network}
        </div>
      )}

      {summary && (
        <div className="flex flex-col gap-6">
          <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              [summary.total, t("Messages")],
              [summary.safeCount, t("Safe")],
              [summary.suspiciousCount, t("Suspicious")],
              [summary.scamCount, t("Scam")],
            ].map(([count, label]) => (
              <div key={label as string} className="flex flex-col">
                <p className="data text-[1.75rem] leading-8 font-bold text-ink">{count}</p>
                <p className="text-[0.9375rem] text-ink-muted">{label}</p>
              </div>
            ))}
          </div>
          {summary.failedCount > 0 && (
            <p className="px-1 text-[0.9375rem] leading-5 text-ink-muted">
              {t(`${summary.failedCount} ${summary.failedCount === 1 ? "message" : "messages"} could not be analysed and should be treated with caution.`)}
            </p>
          )}

          {campaigns.length > 0 && (
            <div>
              <h2 className="micro mb-2.5 px-1 text-ink-muted">{t("Possible campaigns")}</h2>
              <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {campaigns.map((c) => (
                  <li key={c.fingerprintId} className="card">
                    <button
                      type="button"
                      onClick={() => setFilter(filter === c.fingerprintId ? null : c.fingerprintId)}
                      aria-pressed={filter === c.fingerprintId}
                      className="pressable text-left"
                    >
                      <p className="text-[1.0625rem] font-semibold text-ink">{c.label}</p>
                      <p className="micro mt-2 text-ink-muted">
                        {c.count} {t(c.count === 1 ? "message" : "messages")} · {c.senders.size} {t(c.senders.size === 1 ? "sender" : "senders")} · {c.domains.size} {t(c.domains.size === 1 ? "domain" : "domains")}
                      </p>
                      <span className="mt-3 inline-block text-sm font-medium text-ink underline underline-offset-4">
                        {filter === c.fingerprintId ? t("Clear filter") : t("Filter to this campaign")}
                      </span>
                    </button>
                    <Link
                      href={`/network/${encodeURIComponent(c.fingerprintId)}`}
                      className="pressable mt-3 block text-sm font-medium text-ink underline underline-offset-4"
                    >
                      {copy.result.networkLink}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="micro mb-3 text-ink-muted">
              {t("Results")} {filter && `· ${t("filtered")}`}
            </h2>
            <ul className="divide-y divide-card-border border-y border-card-border">
              {(filtered ?? []).map((r, i) => (
                <ResultRow key={i} result={r} copy={copy} lang={lang} />
              ))}
            </ul>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

function groupByCampaign(results: ClientBatchResult[]) {
  const groups = new Map<string, { fingerprintId: string; label: string; count: number; senders: Set<string>; domains: Set<string> }>();
  for (const r of results) {
    if (!r.scamDna || r.scamDna.matchStrength !== "matched") continue;
    const id = r.scamDna.fingerprintId;
    const label = r.scamProfile?.claimedIdentity ?? (r.scamProfile?.type ? humanizeType(r.scamProfile.type) : "Unknown pattern");
    const existing = groups.get(id);
    if (existing) {
      existing.count++;
      if (r.sender) existing.senders.add(r.sender);
    } else {
      groups.set(id, { fingerprintId: id, label, count: 1, senders: new Set(r.sender ? [r.sender] : []), domains: new Set() });
    }
  }
  return [...groups.values()];
}

function ResultRow({ result, copy, lang }: { result: ClientBatchResult; copy: Parameters<typeof signalTitle>[1]; lang: Parameters<typeof signalTitle>[2] }) {
  // "unknown" only ever appears paired with analysisFailed (see lib/api.ts's
  // ClientBatchResult doc comment) — checked explicitly so TS can narrow
  // `result.verdict` to the real Verdict union below.
  if (result.analysisFailed || result.verdict === "unknown") {
    return (
      <li className="flex items-start gap-3 px-4 py-3.5">
        <span aria-hidden="true" className="mt-1.5 h-2.5 w-0.5 shrink-0 bg-ink-muted/35" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{result.message.replace(/\s+/g, " ").trim()}</p>
          <p className="micro mt-1 text-ink-muted">{result.explanation}</p>
        </div>
      </li>
    );
  }
  const display = getVerdictDisplay(result.verdict);
  const top = sortSignals(result.signals)[0];
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <span aria-hidden="true" className={`mt-1.5 h-2.5 w-0.5 shrink-0 ${display.classes.bg}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{result.message.replace(/\s+/g, " ").trim()}</p>
        <p className={`micro mt-1 ${display.classes.inkText}`}>
          {display.label}
          {top && ` · ${signalTitle(top.type, copy, lang)}`}
        </p>
      </div>
    </li>
  );
}
