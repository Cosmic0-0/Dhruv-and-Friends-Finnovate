"use client";

import { useState } from "react";
import Link from "next/link";
import { card, Pill } from "../dc";
import type { CheckCopy } from "./content";

/**
 * The Check hub: headline, the message card (a real check, not a link to
 * somewhere else) and the four tool cards for situations that need a
 * different check entirely (a payee, a document, many messages, a whole
 * conversation).
 */
export default function Hub({
  t,
  onStart,
}: {
  t: CheckCopy;
  /** Switch to the workspace. `autoSubmit` (the example) fires a real check immediately; otherwise the text just prefills. */
  onStart: (text: string, autoSubmit?: boolean) => void;
}) {
  const [text, setText] = useState("");

  const go = () => text.trim() && onStart(text, true);

  // Values from Check.dc.html ("Check hub").
  return (
    <div data-screen-label="Check hub" style={{ display: "flex", flexDirection: "column", gap: 72 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
        <h1 className="dc-h1" style={{ margin: 0, fontWeight: 600, fontSize: 76, lineHeight: 0.98, letterSpacing: "-0.035em" }}>
          {t.hub.titleA}
          <span style={{ color: "var(--dc-text3)" }}>{t.hub.titleB}</span>
        </h1>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "var(--dc-text2)", maxWidth: 540, textWrap: "pretty" }}>{t.hub.lede}</p>
      </div>

      <div data-fx className="dc-split" style={{ ...card(28, true), display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)" }}>
        <div style={{ padding: 40, display: "flex", flexDirection: "column", gap: 14, borderRight: "1px solid var(--dc-line2)" }}>
          <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text4)" }}>{t.hub.eyebrow}</span>
          <span style={{ fontWeight: 600, fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.035em" }}>{t.hub.cardTitle}</span>
          <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--dc-text2)", maxWidth: 360, textWrap: "pretty" }}>{t.hub.cardBody}</span>
          <button
            type="button"
            onClick={() => onStart(t.example, true)}
            style={{ marginTop: "auto", alignSelf: "flex-start", border: "none", background: "transparent", padding: 0, fontSize: 14, color: "var(--dc-ink)", borderBottom: "1px solid var(--dc-underline)", cursor: "pointer" }}
          >
            {t.hub.tryExample}
          </button>
        </div>
        <div style={{ padding: "32px 32px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go();
            }}
            placeholder={t.work.placeholder}
            aria-label={t.work.placeholder}
            rows={5}
            style={{ width: "100%", border: "none", resize: "none", fontFamily: "inherit", fontSize: 20, lineHeight: 1.55, color: "var(--dc-ink)", background: "transparent", padding: "8px 0 0" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.work.privacy}</span>
            <Pill variant="ink" height={52} pad={28} onClick={go} disabled={!text.trim()} style={{ fontSize: 15 }}>
              {t.work.check}
            </Pill>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--dc-ink)" }}>{t.hub.toolsTitle}</h2>
          <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.hub.toolsNote}</span>
        </div>
        <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
          {t.hub.tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              data-fx
              className="dc-lift"
              style={{ ...card(28, true), padding: 28, display: "flex", flexDirection: "column", gap: 14, minHeight: 280, textDecoration: "none", color: "var(--dc-ink)" }}
            >
              <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text4)" }}>{tool.n}</span>
              <span style={{ fontWeight: 600, fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.035em", color: "var(--dc-ink)" }}>{tool.title}</span>
              <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--dc-text2)", textWrap: "pretty" }}>{tool.body}</span>
              <span style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 14, paddingTop: 18, borderTop: "1px solid var(--dc-line2)" }}>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--dc-text3)" }}>{tool.looks}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--dc-ink)" }}>{t.hub.open}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
