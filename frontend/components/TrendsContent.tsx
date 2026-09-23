"use client";

import { useEffect, useState } from "react";
import { getTrends, type TrendsSummary } from "@/lib/intelligence-api";
import { useLanguage } from "./LanguageProvider";
import ScreenTitle from "./ScreenTitle";
import ToolsCard from "./ToolsCard";

type Status = "loading" | "ok" | "error";

/**
 * Radar / trends page. The category list above is reference material
 * (static, hand-written). The block below it is live: GET /api/trends,
 * real counts from actual usage — never seeded or fabricated (root
 * CLAUDE.md's "no fake live statistics" rule). A quiet/empty demo database
 * shows the honest empty state, not padded numbers.
 */
export default function TrendsContent() {
  const { copy } = useLanguage();
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<TrendsSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTrends(controller.signal)
      .then((d) => {
        if (controller.signal.aborted) return;
        setData(d);
        setStatus("ok");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, []);

  const l = copy.trends.live;
  const hasActivity = data && (data.totals.reportedSenders > 0 || data.totals.campaigns > 0);

  return (
    <>
      <ScreenTitle tabKey="trends" />
      <div className="gutter screen-grid flex flex-col gap-4 pt-4 lg:grid">
        <p className="span-2 text-[1.0625rem] leading-[1.4375rem] text-ink-soft">{copy.trends.intro}</p>

        <div className="flex flex-col gap-4">
        <ToolsCard copy={copy} />

      <section className="sheet">
        <div className="px-5 pt-4 pb-1">
          <h2 className="micro text-ink-muted">{copy.trends.knownFormats}</h2>
        </div>
        <ul className="flex flex-col px-5 pb-2 [&>li+li]:border-t [&>li+li]:border-card-border">
          {copy.trends.categories.map((c) => (
            <li key={c.title} className="flex flex-col gap-2 py-3.5">
              <h3 className="text-[1.0625rem] leading-snug font-semibold text-ink">{c.title}</h3>
              {/* A verbatim scam sample, set in a quiet block so it reads as
                  something quoted rather than the app talking. */}
              <p className="rounded-2xl bg-muted-surface px-3.5 py-3 text-[0.9375rem] leading-5 text-ink-soft [overflow-wrap:anywhere]">
                {c.example}
              </p>
              <p className="text-[0.9375rem] leading-5 text-ink-muted">{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="px-1 text-[0.9375rem] leading-5 text-ink-muted">{copy.trends.footerNote}</p>
      </div>

        <div className="flex flex-col gap-4">
        <section className="sheet flex flex-col">
        <div className="px-5 pt-4 pb-1">
          <h2 className="micro text-ink-muted">{l.heading}</h2>
        </div>

        {status === "loading" && <p className="px-5 py-4 text-[0.9375rem] text-ink-muted">{l.loading}</p>}
        {status === "error" && <p className="px-5 py-4 text-[0.9375rem] text-ink-muted">{l.error}</p>}

        {status === "ok" && data && !hasActivity && <p className="px-5 py-4 text-[0.9375rem] text-ink-muted">{l.empty}</p>}

        {status === "ok" && data && hasActivity && (
          <>
            <div className="flex gap-8 px-5 py-4">
              {[
                [data.totals.reportedSenders, l.reportedSenders(data.totals.reportedSenders)],
                [data.totals.campaigns, l.campaigns(data.totals.campaigns)],
              ].map(([count, label]) => (
                <div key={label as string} className="flex flex-col">
                  <p className="data text-[1.75rem] leading-8 font-bold text-ink">{count}</p>
                  <p className="text-[0.9375rem] text-ink-muted">{label}</p>
                </div>
              ))}
            </div>

            {data.topSenders.length > 0 && (
              <div className="border-t border-card-border px-5 py-2">
                <h3 className="micro py-2 text-ink-muted">{l.topSendersTitle}</h3>
                <ul className="flex flex-col [&>li+li]:border-t [&>li+li]:border-card-border">
                  {data.topSenders.map((s, i) => (
                    <li key={i} className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                      <span className="data text-ink [overflow-wrap:anywhere]">{s.sender}</span>
                      <span className="shrink-0 text-[0.9375rem] text-ink-muted">{l.reports(s.reportCount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.topCampaigns.length > 0 && (
              <div className="border-t border-card-border px-5 py-2">
                <h3 className="micro py-2 text-ink-muted">{l.topCampaignsTitle}</h3>
                <ul className="flex flex-col [&>li+li]:border-t [&>li+li]:border-card-border">
                  {data.topCampaigns.map((c) => (
                    <li key={c.fingerprintId} className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                      <span className="text-[0.9375rem] font-medium text-ink">{c.claimedIdentity ?? c.scamType.replaceAll("_", " ")}</span>
                      <span className="shrink-0 text-[0.9375rem] text-ink-muted">{l.messages(c.messageCount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        </section>
        </div>
      </div>
    </>
  );
}
