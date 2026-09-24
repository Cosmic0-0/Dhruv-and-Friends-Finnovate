"use client";

import { useState, type CSSProperties } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { reportCopy, type LevelN } from "./content";
import { actionsFor, directory, MATRIX, TONE_OF } from "./contacts";

/**
 * Report-a-scam escalation guide, implemented 1:1 from the Claude Design file
 * Report.dc.html: the values below are the design's own. Its palette and
 * fonts are scoped to this screen in globals.css (.report-dc, --dc-*); the
 * dc-* class names only carry the stacked layout below desktop width.
 *
 * Fully static: steps and contacts are fixed reference data, so it works
 * offline and never implies live reports. Copy comes from ./content/<lang>.json.
 */

const TONE = {
  green: ["var(--dc-green-hl)", "var(--dc-green)"],
  amber: ["var(--dc-amber-hl)", "var(--dc-amber)"],
  red: ["var(--dc-red-hl)", "var(--dc-red)"],
} as const;

const LEVELS: LevelN[] = [1, 2, 3, 4];
const ext = (href: string) => (href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {});

const card: CSSProperties = { background: "var(--dc-surface)", border: "1px solid var(--dc-line)" };
const matrixRow: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1.6fr) repeat(6,minmax(0,1fr))" };

export default function ReportScreen() {
  const { lang } = useLanguage();
  const t = reportCopy(lang);
  const [lvl, setLvl] = useState<LevelN>(3);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const cur = t.levels[lvl];

  return (
    <div className="report-dc" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        className="dc-main"
        style={{ maxWidth: 1280, width: "100%", margin: "0 auto", padding: "72px 48px 120px", display: "flex", flexDirection: "column", gap: 56 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
            <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-accent)", letterSpacing: "0.04em" }}>{t.eyebrow}</span>
            <h1 className="dc-h1" style={{ margin: 0, fontSize: 60, lineHeight: 1, fontWeight: 600, letterSpacing: "-0.04em" }}>{t.title}</h1>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "var(--dc-text2)", textWrap: "pretty" }}>{t.lede}</p>
          </div>
          <a
            href="tel:999"
            className="report-danger"
            style={{ height: 56, padding: "0 24px", borderRadius: 999, background: "var(--dc-red-hl)", color: "var(--dc-red)", fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}
          >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--dc-red-dot)" }} />
            {t.danger}
          </a>
        </div>

        <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,0.85fr) minmax(0,1.15fr)", gap: 20, alignItems: "start" }}>
          <section className="dc-sticky" aria-label={t.whatHappened} style={{ display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 24 }}>
            <span style={{ fontSize: 13, color: "var(--dc-text3)", padding: "0 4px 6px" }}>{t.whatHappened}</span>
            {LEVELS.map((n) => {
              const l = t.levels[n];
              const on = n === lvl;
              const [soft, ink] = TONE[TONE_OF[n]];
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLvl(n)}
                  style={{
                    display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 16, alignItems: "center", padding: 20,
                    borderRadius: 28, cursor: "pointer", background: "var(--dc-surface)",
                    border: `1.5px solid ${on ? ink : "var(--dc-line)"}`, boxShadow: on ? "var(--dc-shadow)" : "none",
                  }}
                >
                  <span style={{ width: 44, height: 44, borderRadius: 15, background: soft, color: ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700 }}>{n}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left", minWidth: 0 }}>
                    <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--dc-ink)" }}>{l.title}</span>
                    <span style={{ fontSize: 14, color: "var(--dc-text3)", lineHeight: 1.45 }}>{l.sub}</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, padding: "5px 10px", borderRadius: 999, background: soft, color: ink, whiteSpace: "nowrap" }}>{l.urgency}</span>
                </button>
              );
            })}
          </section>

          <section
            className="dc-panel"
            aria-live="polite"
            style={{ ...card, borderRadius: 32, boxShadow: "var(--dc-shadow)", padding: 36, display: "flex", flexDirection: "column", gap: 28 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.level} {lvl} · {cur.urgency}</span>
                <h2 style={{ margin: 0, fontSize: 32, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.1 }}>{cur.headline}</h2>
              </div>
            </div>
            <ol style={{ display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" }}>
              {cur.steps.map((s, i) => (
                <li key={s.who} style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr)", gap: 18, padding: "22px 0", borderTop: "1px solid var(--dc-line2)" }}>
                  <span className="dc-mono" style={{ width: 44, height: 44, borderRadius: 15, background: "var(--dc-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>{s.who}</span>
                      <span style={{ fontSize: 15, color: "var(--dc-text2)", lineHeight: 1.5 }}>{s.what}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {actionsFor(s.actions, t).map((a, j) => (
                        <a
                          key={a.href}
                          href={a.href}
                          {...ext(a.href)}
                          style={{
                            height: 40, padding: "0 16px", borderRadius: 999, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", whiteSpace: "nowrap",
                            background: j === 0 ? "var(--dc-ink)" : "transparent", color: j === 0 ? "var(--dc-surface)" : "var(--dc-ink)",
                            border: j === 0 ? "none" : "1px solid var(--dc-line-strong)",
                          }}
                        >
                          {a.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 36, fontWeight: 600, letterSpacing: "-0.04em" }}>{t.matrixTitle}</h2>
              <span style={{ fontSize: 16, color: "var(--dc-text2)" }}>{t.matrixSub}</span>
            </div>
            <div style={{ display: "flex", gap: 18, fontSize: 13, color: "var(--dc-text3)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--dc-ink)" }} />
                {t.contactFirst}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid var(--dc-text3)" }} />
                {t.alsoReport}
              </span>
            </div>
          </div>
          <div className="dc-scroll" style={{ ...card, borderRadius: 32, overflow: "hidden" }}>
            <div className="dc-table" role="table" aria-label={t.matrixTitle}>
              <div role="row" style={{ ...matrixRow, borderBottom: "1px solid var(--dc-line)" }}>
                <span role="columnheader" style={{ padding: "20px 24px", fontSize: 13, color: "var(--dc-text3)" }}>{t.situation}</span>
                {t.orgs.map((o) => (
                  <span key={o} role="columnheader" style={{ padding: "20px 8px", fontSize: 13, fontWeight: 500, textAlign: "center", lineHeight: 1.3 }}>{o}</span>
                ))}
              </div>
              {MATRIX.map(([n, cells], r) => {
                const [soft, ink] = TONE[TONE_OF[n]];
                return (
                  <div key={r} role="row" style={{ ...matrixRow, borderBottom: "1px solid var(--dc-line2)", alignItems: "center" }}>
                    <div role="rowheader" style={{ padding: "18px 24px", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 9, flexShrink: 0, background: soft, color: ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{n}</span>
                      <span style={{ fontSize: 15, lineHeight: 1.4 }}>{t.situations[r]}</span>
                    </div>
                    {cells.map((c, i) => (
                      <span key={i} role="cell" style={{ display: "flex", justifyContent: "center", padding: "18px 0" }}>
                        <span
                          role="img"
                          aria-label={c === 2 ? t.contactFirst : c === 1 ? t.alsoReport : t.notNeeded}
                          style={
                            c === 2
                              ? { width: 14, height: 14, borderRadius: "50%", background: "var(--dc-ink)" }
                              : c === 1
                                ? { width: 14, height: 14, borderRadius: "50%", border: "1.5px solid var(--dc-text3)" }
                                : { width: 14, height: 1.5, background: "var(--dc-line-strong)" }
                          }
                        />
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.035em" }}>{t.contactsTitle}</h2>
            <div className="dc-contacts" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
              {directory(t).map((d) => (
                <div key={d.id} style={{ ...card, borderRadius: 28, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>{t.contactNames[d.id]}</span>
                    <span style={{ fontSize: 13, color: "var(--dc-text3)", lineHeight: 1.45 }}>{t.contactFor[d.id]}</span>
                  </div>
                  <div className="dc-mono" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, overflowWrap: "anywhere" }}>
                    {d.lines.map(([text, href]) =>
                      href ? (
                        <a key={text} href={href} {...ext(href)} style={{ color: "var(--dc-ink)" }}>{text}</a>
                      ) : (
                        <span key={text}>{text}</span>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            className="dc-sticky dc-panel"
            style={{ ...card, borderRadius: 32, padding: 32, display: "flex", flexDirection: "column", gap: 18, position: "sticky", top: 24 }}
          >
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}>{t.beforeTitle}</h2>
            <span style={{ fontSize: 15, color: "var(--dc-text2)", lineHeight: 1.5 }}>{t.beforeBody}</span>
            {t.checklist.map((item, i) => {
              const on = !!done[i];
              return (
                <button
                  key={item}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setDone((d) => ({ ...d, [i]: !on }))}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", border: "none", borderTop: "1px solid var(--dc-line2)", background: "transparent", cursor: "pointer", color: "var(--dc-ink)", textAlign: "left", fontSize: 15 }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 24, height: 24, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#FFFFFF",
                      background: on ? "var(--dc-accent)" : "transparent", border: on ? "none" : "1.5px solid var(--dc-line-strong)",
                    }}
                  >
                    {on ? "✓" : ""}
                  </span>
                  {item}
                </button>
              );
            })}
            <span style={{ fontSize: 13, color: "var(--dc-text3)", paddingTop: 6 }}>{t.sourceNote}</span>
          </section>
        </div>
      </div>
    </div>
  );
}
