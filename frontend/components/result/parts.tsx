import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import { highlightSegments, type EvidenceMark } from "@/lib/highlight";
import type { AnalyzeResponse, Severity, Verdict } from "@/lib/types";
import { card, Pill, TONE, type Tone } from "../dc";
import ScreenTitle from "../ScreenTitle";

/** Small 13px/text3 section label, matching components/check/ResultArticle.tsx's own labels ("The message", "Why", ...). */
export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)", fontWeight: 400 }}>
      {children}
    </h2>
  );
}

export function ResultHeader({ copy, sender, subtitle }: { copy: Copy; sender?: string; subtitle?: string }) {
  return (
    <ScreenTitle
      title={copy.result.title}
      subtitle={subtitle ?? (sender ? copy.result.fromSender(sender) : undefined)}
      back={{ href: "/app", label: copy.tabs.check }}
    />
  );
}

export const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Severity → dc tone. Low severity reads as neutral grey rather than a fourth colour. */
export function severityTone(sev: Severity): { fg: string; dot: string; hl: string } {
  if (sev === "high") return TONE.red;
  if (sev === "medium") return TONE.amber;
  return { fg: "var(--dc-text3)", dot: "var(--dc-line-strong)", hl: "var(--dc-hover)" };
}

/** Plain "← ..." back link (components/check/Workspace.tsx's own back button style). */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={{ alignSelf: "flex-start", fontSize: 14, color: "var(--dc-text2)", textDecoration: "none" }}>
      {label}
    </Link>
  );
}

/** No stored result (or nothing to replay): a dc card with a way back into the product. */
export function MissingResult({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  return (
    <div style={{ ...card(32), padding: 36, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.04em" }}>{title}</h1>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: "var(--dc-text2)" }}>{body}</p>
      <Pill href={href}>{cta}</Pill>
    </div>
  );
}

/**
 * The user's ORIGINAL text, with signal evidence highlighted ("Scam X-Ray"),
 * styled like ResultArticle's "The message" section. highlightSegments only
 * splits the text (never alters it); a highlighted span carrying an evidence
 * id links to that row in the "Why" list below.
 */
export function MessageCard({
  text,
  marks,
  verdict,
  copy,
  title,
}: {
  text: string;
  marks: EvidenceMark[];
  verdict: Verdict;
  copy: Copy;
  /** Card title; defaults to "The message you sent" (a document check passes its own). */
  title?: string;
}) {
  const segments = verdict === "safe" ? [{ text }] : highlightSegments(text, marks);
  const hasHighlights = segments.some((s) => s.severity);
  return (
    <section style={{ ...card(28, true), padding: "32px 32px 28px", display: "flex", flexDirection: "column", gap: 14 }} aria-labelledby="message-label">
      <SectionLabel id="message-label">{title ?? copy.result.messageYouSent}</SectionLabel>
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.85, color: "var(--dc-text-body)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {segments.map((s, i) => {
          if (!s.severity) return <Fragment key={i}>{s.text}</Fragment>;
          const tone = s.severity === "low" ? undefined : TONE[s.severity === "high" ? "red" : "amber"];
          const style: CSSProperties = {
            background: tone?.hl ?? "transparent",
            color: tone?.fg ?? "inherit",
            borderBottom: `2px solid ${tone?.fg ?? "var(--dc-line-strong)"}`,
            padding: "0 1px",
          };
          if (s.id) {
            return (
              <a key={i} href={`#${s.id}`} title={s.label} style={{ ...style, textDecoration: "none" }}>
                {s.text}
              </a>
            );
          }
          return (
            <mark key={i} style={style}>
              {s.text}
            </mark>
          );
        })}
      </p>
      {hasHighlights && <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)" }}>{copy.result.xrayHint}</p>}
    </section>
  );
}

type SemanticInfo = NonNullable<AnalyzeResponse["analysis"]>["semantic"];

/** "Analyzed by: local/fallback/unavailable" line — see docs/API-CONTRACT.md's `analysis.semantic`. */
export function aiSourceLabel(semantic: SemanticInfo | undefined, copy: Copy): string {
  if (!semantic || semantic.status === "unavailable" || semantic.status === "skipped") return copy.result.aiSource.unavailable;
  if (semantic.provider === "ollama") return copy.result.aiSource.local;
  if (semantic.provider) return copy.result.aiSource.fallback.replace("{provider}", semantic.provider);
  return copy.result.aiSource.unavailable;
}

/** "What was sent for analysis": the redacted text that actually left the device, as a dc disclosure card. */
export function SentPanel({
  redacted,
  fromScreenshot,
  fromDocument = false,
  analysis,
  copy,
}: {
  redacted: string;
  /** The text came from a screenshot: the image itself also left the device. */
  fromScreenshot: boolean;
  /** The text came from an uploaded document: the file itself went to the server. */
  fromDocument?: boolean;
  analysis?: AnalyzeResponse["analysis"];
  copy: Copy;
}) {
  return (
    <details style={{ ...card(28), overflow: "hidden" }}>
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "18px 28px",
          fontSize: 15,
          color: "var(--dc-text2)",
        }}
      >
        {copy.result.sentTitle}
        <span aria-hidden="true" className="dc-mono" style={{ fontSize: 16, color: "var(--dc-text3)" }}>
          +
        </span>
      </summary>
      <div style={{ borderTop: "1px solid var(--dc-line2)", padding: "20px 28px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--dc-text2)" }}>
          {fromDocument ? copy.result.sentBodyDocument : fromScreenshot ? copy.result.sentBodyScreenshot : copy.result.sentBody}
        </p>
        <p
          className="dc-mono"
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--dc-text2)",
            background: "var(--dc-hover)",
            borderRadius: 16,
            padding: "14px 16px",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {redacted}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--dc-text3)" }}>
          {copy.result.aiSource.label}: {aiSourceLabel(analysis?.semantic, copy)}
        </p>
      </div>
    </details>
  );
}

export function CheckAnotherButton({ copy }: { copy: Copy }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <Pill href="/app" height={56}>
        {copy.result.checkAnother}
      </Pill>
    </div>
  );
}
