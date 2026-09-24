"use client";

import { useEffect, useState } from "react";
import { DcPage, PageHeader, Pill, Seg, card, MONO } from "@/components/dc";
import { getRadar, type RadarData, type RadarRange } from "@/lib/intelligence-api";
import { useLanguage } from "../LanguageProvider";
import ToolsCard from "../ToolsCard";
import { radarCopy, fill, label, type RadarCopy } from "./content";

type Status = "loading" | "ok" | "error";

/**
 * Radar (Radar.dc.html): what scammers are sending in Mauritius, from real
 * checks on FraudLens. Every tile is either the backend's real aggregate
 * (services/radar via GET /api/trends?range=) or this screen's own honest
 * empty state — never the design's sample numbers.
 */
export default function RadarScreen() {
  const { lang, copy } = useLanguage();
  const t = radarCopy(lang);
  const [range, setRange] = useState<RadarRange>("7d");
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<RadarData | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    getRadar(range, controller.signal)
      .then((d) => {
        if (controller.signal.aborted) return;
        setData(d);
        setStatus("ok");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [range, attempt]);

  return (
    <DcPage label="radar" gap={48}>
      <PageHeader
        title={t.title}
        lede={t.lede}
        titleSize={60}
        aside={
          <Seg
            label={t.rangeLabel}
            variant="ink"
            value={range}
            onChange={setRange}
            options={[
              { id: "7d", label: t.ranges["7d"] },
              { id: "30d", label: t.ranges["30d"] },
              { id: "12m", label: t.ranges["12m"] },
            ]}
          />
        }
      />

      {status === "loading" && (
        <div style={{ ...card(32), minHeight: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dc-text3)" }}>
          {t.loading}
        </div>
      )}

      {status === "error" && (
        <div style={{ ...card(32), minHeight: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--dc-text3)" }}>
          <span>{t.error}</span>
          <Pill variant="outline" onClick={() => setAttempt((n) => n + 1)} height={40}>
            {t.retry}
          </Pill>
        </div>
      )}

      {status === "ok" && data && (
        <>
          <div className="dc-cols-1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)", gap: 20, alignItems: "stretch" }}>
            <div style={{ ...card(32), padding: 28, display: "flex", flexDirection: "column", gap: 20 }} data-fx>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 14, color: "var(--dc-text3)" }}>{t.caught}</span>
                <span className="dc-mono" style={{ fontFamily: MONO, fontSize: 64, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {data.scamsCaught.toLocaleString()}
                </span>
                <span style={{ fontSize: 15, color: data.change && data.change.pct >= 0 ? "var(--dc-red)" : data.change ? "var(--dc-green)" : "var(--dc-text3)" }}>
                  {data.change ? fill(t.vsPrev, { pct: (data.change.pct >= 0 ? "+" : "") + data.change.pct }) : t.noPrev}
                </span>
              </div>
              <BarChart data={data} t={t} />
            </div>

            <div style={{ ...card(28), padding: 24, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8 }} data-fx>
              <span style={{ fontSize: 14, color: "var(--dc-text3)" }}>{t.mostCopied}</span>
              {data.topImpersonated ? (
                <>
                  <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{data.topImpersonated.name}</span>
                  <span style={{ fontSize: 15, color: "var(--dc-text2)" }}>{fill(t.shareOf, { pct: data.topImpersonated.sharePct })}</span>
                </>
              ) : (
                <span style={{ fontSize: 15, color: "var(--dc-text3)" }}>{t.noneCopied}</span>
              )}
            </div>

            <div style={{ borderRadius: 28, background: "var(--dc-red-hl)", padding: 24, display: "flex", flexDirection: "column", gap: 8 }} data-fx>
              <span style={{ fontSize: 14, color: "var(--dc-red)" }}>{data.rising && data.rising.previous === 0 ? t.newlySeen : t.rising}</span>
              {data.rising ? (
                <>
                  <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{label(t.types, data.rising.scamType)}</span>
                  <span style={{ fontSize: 15, color: "var(--dc-text2)" }}>
                    {data.rising.previous > 0 ? fill(t.risingUp, { n: data.rising.current, prev: data.rising.previous }) : fill(t.risingNew, { n: data.rising.current })}
                    {data.rising.mainChannel && ` · ${fill(t.mostlyBy, { channel: label(t.channels, data.rising.mainChannel) })}`}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 15, color: "var(--dc-text2)" }}>{t.noneRising}</span>
              )}
            </div>
          </div>

          <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
            <section style={{ ...card(32), padding: 24, display: "flex", flexDirection: "column", gap: 14 }} data-fx>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{t.topTypes}</h2>
              {data.topScamTypes.length === 0 ? (
                <Empty t={t} />
              ) : (
                <ul style={{ display: "flex", flexDirection: "column", gap: 12, margin: 0, padding: 0, listStyle: "none" }}>
                  {data.topScamTypes.map((s) => (
                    <li key={s.scamType} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                        <span style={{ fontWeight: 500 }}>{label(t.types, s.scamType)}</span>
                        <span className="dc-mono" style={{ fontFamily: MONO, fontSize: 14, color: "var(--dc-text3)" }}>{s.pct}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--dc-hover)" }}>
                        <div style={{ height: 6, borderRadius: 3, width: `${s.pct}%`, background: "var(--dc-accent)" }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={{ ...card(32), padding: 24, display: "flex", flexDirection: "column", gap: 14 }} data-fx>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{t.fakeLinks}</h2>
              {data.fakeLinks.length === 0 ? (
                <Empty t={t} />
              ) : (
                <ul style={{ display: "flex", flexDirection: "column", gap: 0, margin: 0, padding: 0, listStyle: "none" }}>
                  {data.fakeLinks.map((l, i) => (
                    <li
                      key={`${l.domain}-${l.imitates}`}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--dc-line2)" }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span className="dc-mono" style={{ fontFamily: MONO, fontSize: 15, overflowWrap: "anywhere" }}>{l.domain}</span>
                        <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{l.imitates ? fill(t.pretends, { brand: l.imitates }) : t.imitatesUnknown}</span>
                      </div>
                      <span style={{ fontSize: 13, color: "var(--dc-text2)", whiteSpace: "nowrap" }}>{l.times === 1 ? t.once : fill(t.times, { n: l.times })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p style={{ margin: 0, padding: "0 4px", fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.5 }}>{t.coverage}</p>
        </>
      )}

      <ToolsCard copy={copy} />
    </DcPage>
  );
}

function Empty({ t }: { t: RadarCopy }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
      <span style={{ fontSize: 15, fontWeight: 500 }}>{t.empty}</span>
      <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.emptyBody}</span>
    </div>
  );
}

function BarChart({ data, t }: { data: RadarData; t: RadarCopy }) {
  const max = Math.max(1, ...data.series.map((b) => b.scams));
  const unit = data.unit === "month" ? t.unitMonth : t.unitDay;
  const allZero = data.series.every((b) => b.scams === 0);
  const lastIdx = data.series.length - 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--dc-text3)" }}>{fill(t.chartLabel, { unit })}</span>
      {allZero ? (
        <Empty t={t} />
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: data.series.length > 20 ? 2 : 6, height: 80 }}>
          {data.series.map((b, i) => (
            <div
              key={b.start}
              title={`${b.start}: ${b.scams}`}
              style={{
                flex: 1,
                minWidth: 2,
                height: `${Math.max(3, (b.scams / max) * 100)}%`,
                borderRadius: 6,
                background: i === lastIdx ? "var(--dc-accent)" : "var(--dc-line-strong)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
