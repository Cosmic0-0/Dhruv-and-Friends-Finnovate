"use client";

import { useState } from "react";
import Link from "next/link";
import type { Copy, UiLanguage } from "@/lib/i18n";
import { restore } from "@/lib/redact";
import type { StoredResult } from "@/lib/storage";
import { Pill, TONE, WhatToDoPanel } from "../dc";
import { fill, type CheckCopy } from "./content";
import { confidenceAndSignalsLine, numberedSignals, signalDescription, signalTitle, summaryLine, verdictTone, whatToDoSteps } from "./helpers";
import { highlightSegments, type EvidenceMark } from "@/lib/highlight";
import TranslatePanel from "./TranslatePanel";

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
  // Only a campaign seen before this check; a brand-new fingerprint is not news.
  const campaign = response.scamDna?.matchStrength === "matched" && response.scamDna.relatedReports > 0 ? response.scamDna : null;

  return (
    <article data-nofx style={{ background: "var(--dc-surface)", border: "1px solid var(--dc-line)", borderRadius: 28, boxShadow: "var(--dc-shadow)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "40px 40px 36px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <span className="dc-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: TONE[tone].fg, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: TONE[tone].dot }} />
            {t.result.verdict}
          </span>
          <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text3)" }}>{metaLine}</span>
        </div>

        <h2 style={{ margin: 0, fontSize: 84, lineHeight: 0.9, fontWeight: 700, letterSpacing: "-0.05em", color: TONE[tone].fg }}>
          {t.result.words[response.verdict]}
        </h2>
        <p style={{ margin: 0, fontSize: 20, lineHeight: 1.5, color: "var(--dc-text2)" }}>{explanation}</p>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--dc-text2)" }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: "var(--dc-butter)", flexShrink: 0 }} />
          {t.hub.engineNote}
        </span>
        {channel && <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text3)" }}>{fill(t.result.receivedBy, { channel: t.work.channels[channel] })}</span>}
        {campaign && (
          <Link
            href={`/network/${encodeURIComponent(campaign.fingerprintId)}`}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "16px 20px", borderRadius: 20, background: "var(--dc-butter)", color: "var(--dc-on-butter)", textDecoration: "none" }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.35 }}>{fill(t.result.campaign, { n: campaign.relatedReports })}</span>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{t.result.campaignLink} →</span>
          </Link>
        )}
      </div>

      <section style={{ margin: "0 40px", borderTop: "1px solid var(--dc-line2)", padding: "28px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.result.theMessage}</span>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.9, color: "var(--dc-text-body)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
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
                {num && <sup className="dc-mono" style={{ fontSize: 11, marginLeft: 1, color: st?.fg }}>{num}</sup>}
              </mark>
            );
          })}
        </p>
      </section>

      <TranslatePanel result={result} t={t} />

      <section style={{ margin: "0 40px", borderTop: "1px solid var(--dc-line2)", padding: "28px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 13, color: "var(--dc-text3)", marginBottom: 6 }}>{t.result.why}</span>
        {numbered.length === 0 ? (
          <p style={{ margin: 0, fontSize: 15, color: "var(--dc-text3)" }}>{t.result.noSignals}</p>
        ) : (
          <ol style={{ display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" }}>
            {numbered.map((s) => (
              <li key={s.n} id={`sig-${s._idx}`} style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 12, padding: "14px 0", borderTop: "1px solid var(--dc-line2)" }}>
                <span className="dc-mono" style={{ fontSize: 14, color: TONE[tone].fg }}>{String(s.n).padStart(2, "0")}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.01em" }}>{signalTitle(s.type, oldCopy, lang)}</span>
                  <span style={{ fontSize: 14, color: "var(--dc-text2)", lineHeight: 1.5 }}>{signalDescription(s, oldCopy, show)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {(prose || steps.length > 0) && (
        <WhatToDoPanel label={t.result.whatToDo} headline={prose ?? steps[0]} radius={0} size={32}>
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
          <Pill href="/report" variant="light">{t.result.report}</Pill>
          <ShareButton result={result} t={t} explanation={explanation} numbered={numbered} oldCopy={oldCopy} lang={lang} show={show} />
        </WhatToDoPanel>
      )}

      <div style={{ padding: "20px 40px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, borderTop: "1px solid var(--dc-line2)" }}>
        <span className="dc-mono" style={{ fontSize: 11, color: "var(--dc-text3)" }}>{aiOk ? t.result.ai.ok : t.result.ai.off}</span>
        {fullEvidenceLink && (
          <Link href="/result" style={{ marginLeft: "auto", fontSize: 14, color: "var(--dc-text2)", textDecoration: "underline", textUnderlineOffset: 3 }}>
            {t.result.fullEvidence} →
          </Link>
        )}
        <p style={{ margin: 0, width: "100%", fontSize: 13, color: "var(--dc-text3)" }}>
          {t.result.acted}{" "}
          <Link href="/report" style={{ color: "var(--dc-ink)", textDecoration: "underline", textDecorationColor: "var(--dc-underline)", textUnderlineOffset: 3 }}>
            {t.result.actedLink}
          </Link>
        </p>
      </div>
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
      style={{ height: 48, padding: "0 22px", borderRadius: 999, background: "transparent", border: "1px solid currentColor", opacity: 0.9, color: "inherit", fontSize: 15, cursor: "pointer" }}
    >
      {copied ? t.result.copied : t.result.share}
    </button>
  );
}
