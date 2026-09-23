"use client";

import { useState } from "react";
import Link from "next/link";
import type { Copy, UiLanguage } from "@/lib/i18n";
import { restore } from "@/lib/redact";
import type { StoredResult } from "@/lib/storage";
import { Mark, TONE, WhatToDoPanel } from "../dc";
import { fill, type CheckCopy } from "./content";
import { confidenceAndSignalsLine, numberedSignals, signalDescription, signalTitle, summaryLine, verdictTone, whatToDoSteps } from "./helpers";
import { highlightSegments, type EvidenceMark } from "@/lib/highlight";

/**
 * The inline result article shared by the Check workspace's right column and
 * the top of /result: verdict + confidence/signals line, the huge verdict
 * word, the explanation, the annotated message ("The message"), the
 * numbered "Why" list, the ink "What to do now" panel, report/share and a
 * "See full evidence" link. Every value comes from the real AnalyzeResponse
 * plus content/<lang>.json copy — nothing here is invented.
 */
export default function ResultArticle({
  result,
  t,
  oldCopy,
  lang,
  fullEvidenceLink = true,
}: {
  result: StoredResult;
  t: CheckCopy;
  oldCopy: Copy;
  lang: UiLanguage;
  fullEvidenceLink?: boolean;
}) {
  const { response, redacted, redactions } = result;
  const show = (s: string) => restore(s, redactions);
  const original = show(redacted);
  const tone = verdictTone(response.verdict);
  const numbered = numberedSignals(response.signals);
  const numberByIdx = new Map(numbered.map((s) => [s._idx, s.n]));

  const marks: EvidenceMark[] = response.signals
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => typeof s.evidence === "string" && s.evidence.trim() !== "")
    .map(({ s, i }) => ({ evidence: show(s.evidence as string), severity: s.severity, id: `sig-${i}`, label: signalTitle(s.type, oldCopy, lang) }));
  const segments = response.verdict === "safe" ? [{ text: original }] : highlightSegments(original, marks);

  const explanation = summaryLine(response, t, show);
  const metaLine = confidenceAndSignalsLine(response, t);
  const { prose, steps } = whatToDoSteps(response, oldCopy);
  const channel = response.analysis?.channel;
  const aiOk = response.analysis?.semantic.status === "ok";

  return (
    <article data-nofx style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Mark tone={tone} glyph={response.verdict === "safe" ? "✓" : response.verdict === "scam" ? "✕" : "!"} size={40} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{metaLine}</span>
          {channel && <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text3)" }}>{fill(t.result.receivedBy, { channel: t.work.channels[channel] })}</span>}
        </div>
      </div>

      <h2 style={{ margin: 0, fontSize: 56, lineHeight: 0.98, fontWeight: 600, letterSpacing: "-0.045em", color: TONE[tone].fg }}>
        {t.result.words[response.verdict]}
      </h2>
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "var(--dc-text2)" }}>{explanation}</p>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.result.theMessage}</span>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: "var(--dc-ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {segments.map((s, i) => {
            if (!s.severity) return <span key={i}>{s.text}</span>;
            const idx = s.id ? Number(s.id.replace("sig-", "")) : undefined;
            const num = idx !== undefined ? numberByIdx.get(idx) : undefined;
            const st = s.severity === "low" ? undefined : TONE[s.severity === "high" ? "red" : "amber"];
            return (
              <mark
                key={i}
                title={s.label}
                style={{ background: st?.hl ?? "transparent", color: st?.fg ?? "inherit", borderBottom: `2px solid ${st?.fg ?? "var(--dc-line-strong)"}`, padding: "0 1px" }}
              >
                {s.text}
                {num && <sup style={{ fontSize: 11, marginLeft: 1 }}>{num}</sup>}
              </mark>
            );
          })}
        </p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 13, color: "var(--dc-text3)", marginBottom: 6 }}>{t.result.why}</span>
        {numbered.length === 0 ? (
          <p style={{ margin: 0, fontSize: 15, color: "var(--dc-text3)" }}>{t.result.noSignals}</p>
        ) : (
          <ol style={{ display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" }}>
            {numbered.map((s) => (
              <li key={s.n} id={`sig-${s._idx}`} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12, padding: "12px 0", borderTop: "1px solid var(--dc-line2)" }}>
                <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)" }}>{String(s.n).padStart(2, "0")}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{signalTitle(s.type, oldCopy, lang)}</span>
                  <span style={{ fontSize: 14, color: "var(--dc-text2)", lineHeight: 1.5 }}>{signalDescription(s, oldCopy, show)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {(prose || steps.length > 0) && (
        <WhatToDoPanel label={t.result.whatToDo} headline={prose ?? steps[0]}>
          {steps.length > (prose ? 0 : 1) && (
            <ol style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none", width: "100%" }}>
              {(prose ? steps : steps.slice(1)).map((s, i) => (
                <li key={i} style={{ display: "flex", gap: 10, fontSize: 14, opacity: 0.85 }}>
                  <span aria-hidden="true">·</span>
                  {s}
                </li>
              ))}
            </ol>
          )}
        </WhatToDoPanel>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <Link
          href="/report"
          style={{ height: 48, padding: "0 22px", borderRadius: 999, background: "var(--dc-red-hl)", color: "var(--dc-red)", fontSize: 15, fontWeight: 500, display: "inline-flex", alignItems: "center" }}
        >
          {t.result.report}
        </Link>
        <ShareButton result={result} t={t} explanation={explanation} numbered={numbered} oldCopy={oldCopy} lang={lang} show={show} />
        {fullEvidenceLink && (
          <Link href="/result" style={{ marginLeft: "auto", fontSize: 14, color: "var(--dc-text2)", textDecoration: "underline", textUnderlineOffset: 3 }}>
            {t.result.fullEvidence} →
          </Link>
        )}
      </div>

      <span className="dc-mono" style={{ fontSize: 11, color: "var(--dc-text3)" }}>{aiOk ? t.result.ai.ok : t.result.ai.off}</span>

      <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)", borderTop: "1px solid var(--dc-line2)", paddingTop: 16 }}>
        {t.result.acted}{" "}
        <Link href="/report" style={{ color: "var(--dc-ink)", textDecoration: "underline", textUnderlineOffset: 3 }}>
          {t.result.actedLink}
        </Link>
      </p>
    </article>
  );
}

function ShareButton({
  result,
  t,
  explanation,
  numbered,
  oldCopy,
  lang,
  show,
}: {
  result: StoredResult;
  t: CheckCopy;
  explanation: string;
  numbered: ReturnType<typeof numberedSignals>;
  oldCopy: Copy;
  lang: UiLanguage;
  show: (s: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  async function share() {
    // Never the raw message: only the verdict, the summary sentence and the
    // signal titles — no evidence quotes, so no identifiers can leak.
    const text = [
      t.result.shareTitle,
      "",
      t.result.words[result.response.verdict],
      explanation,
      "",
      ...numbered.map((s) => `• ${signalTitle(s.type, oldCopy, lang)}`),
      "",
      t.result.shareFooter,
    ].join("\n");
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: t.result.shareTitle, text });
      } catch {
        /* cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      type="button"
      onClick={() => void share()}
      style={{ height: 48, padding: "0 22px", borderRadius: 999, background: "transparent", border: "1px solid var(--dc-line-strong)", color: "var(--dc-ink)", fontSize: 15, cursor: "pointer" }}
    >
      {copied ? t.result.copied : t.result.share}
    </button>
  );
}
