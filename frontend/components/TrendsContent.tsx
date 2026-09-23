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
      <div className="gutter flex flex-col gap-4 pt-4">
        <p className="text-[1.0625rem] leading-[1.4375rem] text-ink-soft">{copy.trends.intro}</p>

        <ToolsCard copy={copy} />

      <ol className="sheet">
        {copy.trends.categories.map((c, i) => (
          <li key={c.title} className="flex gap-3.5 px-4 py-4">
            <span aria-hidden="true" className="data shrink-0 pt-0.5 font-medium text-accent-ink">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 className="font-sans text-[1.0625rem] leading-snug font-semibold text-ink">{c.title}</h2>
              <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{c.body}</p>
              {/* A verbatim scam sample — monospaced and rule-marked so it's
                  clearly quoted evidence, not the app talking. */}
              <p className="data mt-1 border-l-2 border-l-card-border bg-muted-surface px-3 py-2.5 leading-relaxed text-ink-soft">
                {c.example}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-[0.8125rem] leading-snug text-ink-muted">{copy.trends.footerNote}</p>

      <section className="flex flex-col gap-4">
        <h2 className="micro border-t border-line-strong pt-6 text-ink-muted">{l.heading}</h2>

        {status === "loading" && <p className="text-sm text-ink-muted">{l.loading}</p>}
        {status === "error" && <p className="text-sm text-ink-muted">{l.error}</p>}

        {status === "ok" && data && !hasActivity && <p className="text-sm text-ink-muted">{l.empty}</p>}

        {status === "ok" && data && hasActivity && (
          <>
            <div className="grid grid-cols-2 gap-px border border-card-border bg-card-border sm:grid-cols-4">
              {[
                [data.totals.reportedSenders, l.reportedSenders(data.totals.reportedSenders)],
                [data.totals.campaigns, l.campaigns(data.totals.campaigns)],
              ].map(([count, label]) => (
                <div key={label as string} className="bg-card p-5">
                  <p className="font-heading text-3xl">{count}</p>
                  <p className="micro text-ink-muted">{label}</p>
                </div>
              ))}
            </div>

            {data.topSenders.length > 0 && (
              <div>
                <h3 className="micro mb-2 text-ink-muted">{l.topSendersTitle}</h3>
                <ul className="divide-y divide-card-border border-y border-card-border">
                  {data.topSenders.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="data text-ink">{s.sender}</span>
                      <span className="text-sm text-ink-muted">{l.reports(s.reportCount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.topCampaigns.length > 0 && (
              <div>
                <h3 className="micro mb-2 text-ink-muted">{l.topCampaignsTitle}</h3>
                <ul className="divide-y divide-card-border border-y border-card-border">
                  {data.topCampaigns.map((c) => (
                    <li key={c.fingerprintId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-sm font-medium text-ink">{c.claimedIdentity ?? c.scamType.replaceAll("_", " ")}</span>
                      <span className="text-sm text-ink-muted">{l.messages(c.messageCount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
      </div>
    </>
  );
}
