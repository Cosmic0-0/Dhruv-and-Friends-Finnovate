/**
 * Primitives for the Claude Design pages (*.dc.html). Every value here is
 * copied from the design files; pages compose these with inline styles so a
 * page reads side by side with its .dc.html source.
 *
 * Colours are the --dc-* tokens from app/globals.css. The dc-* class names
 * only carry behaviour inline styles cannot: stacking below desktop width
 * (dc-split, dc-sticky, dc-h1, dc-panel, dc-cols-1), hover lift (dc-lift,
 * dc-pill) and the monospace face (dc-mono).
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export type Tone = "red" | "amber" | "green";

/** [highlight background, foreground, dot] per tone. */
export const TONE: Record<Tone, { hl: string; fg: string; dot: string }> = {
  red: { hl: "var(--dc-red-hl)", fg: "var(--dc-red)", dot: "var(--dc-red-dot)" },
  amber: { hl: "var(--dc-amber-hl)", fg: "var(--dc-amber)", dot: "var(--dc-amber)" },
  green: { hl: "var(--dc-green-hl)", fg: "var(--dc-green)", dot: "var(--dc-green-dot)" },
};

export const MONO = "var(--font-geist-mono), ui-monospace, monospace";

/** A surface card. radius 28 (tiles) or 32 (panels), as in the designs. */
export function card(radius: 20 | 24 | 28 | 32 | 40 = 32, shadow = false): CSSProperties {
  return {
    background: "var(--dc-surface)",
    border: "1px solid var(--dc-line)",
    borderRadius: radius,
    ...(shadow ? { boxShadow: "var(--dc-shadow)" } : {}),
  };
}

/** The page column: `<main style="max-width:1280px;...;padding:72px 48px 120px">`. */
export function DcPage({
  children,
  label,
  maxWidth = 1280,
  gap = 48,
  padding = "72px 48px 120px",
}: {
  children: ReactNode;
  label?: string;
  maxWidth?: number;
  gap?: number;
  padding?: string;
}) {
  return (
    <div
      className="dc-main"
      data-screen-label={label}
      style={{ maxWidth, width: "100%", margin: "0 auto", padding, display: "flex", flexDirection: "column", gap }}
    >
      {children}
    </div>
  );
}

/** Eyebrow / 60px title / lede, with an optional block on the right. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  aside,
  titleSize = 60,
  maxWidth = 680,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
  titleSize?: number;
  maxWidth?: number;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth }}>
        {eyebrow && <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-accent)", letterSpacing: "0.04em" }}>{eyebrow}</span>}
        <h1 className="dc-h1" style={{ margin: 0, fontSize: titleSize, lineHeight: titleSize >= 72 ? 0.98 : 1, fontWeight: 600, letterSpacing: titleSize >= 72 ? "-0.045em" : "-0.04em" }}>
          {title}
        </h1>
        {lede && <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "var(--dc-text2)", textWrap: "pretty" }}>{lede}</p>}
      </div>
      {aside}
    </div>
  );
}

type PillVariant = "ink" | "outline" | "ghost" | "light";

export function pillStyle(variant: PillVariant = "ink", height = 48, pad = 22): CSSProperties {
  const base: CSSProperties = {
    height, padding: `0 ${pad}px`, borderRadius: 999, fontSize: height >= 56 ? 16 : height >= 52 ? 15 : 14,
    fontWeight: variant === "ink" || variant === "light" ? 500 : 400,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap",
    cursor: "pointer", textDecoration: "none", fontFamily: "inherit",
  };
  switch (variant) {
    case "ink":
      return { ...base, border: "none", background: "var(--dc-ink)", color: "var(--dc-surface)" };
    case "light":
      return { ...base, border: "none", background: "var(--dc-surface)", color: "var(--dc-ink)" };
    case "outline":
      return { ...base, border: "1px solid var(--dc-line-strong)", background: "transparent", color: "var(--dc-ink)" };
    default:
      return { ...base, border: "none", background: "transparent", color: "var(--dc-text2)" };
  }
}

/** A pill button or link. `href` renders a Next link (external for http/tel/mailto). */
export function Pill({
  children,
  variant = "ink",
  height = 48,
  pad,
  href,
  onClick,
  disabled,
  type = "button",
  style,
  ariaLabel,
}: {
  children: ReactNode;
  variant?: PillVariant;
  height?: number;
  pad?: number;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const s = { ...pillStyle(variant, height, pad ?? (height >= 56 ? 28 : 22)), ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}), ...style };
  const cls = `dc-pill${variant === "ink" ? " dc-pill-ink" : ""}`;
  if (href) {
    const external = /^(https?:|tel:|mailto:)/.test(href);
    return external ? (
      <a href={href} className={cls} style={s} aria-label={ariaLabel} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    ) : (
      <Link href={href} className={cls} style={s} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} style={s} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

/** Selectable chip (Check's "Received by", Before paying's "What is it for?"). */
export function chipStyle(on: boolean, height = 36): CSSProperties {
  return {
    fontSize: 14, height, padding: "0 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${on ? "var(--dc-ink)" : "var(--dc-line-strong)"}`,
    background: on ? "var(--dc-ink)" : "transparent", color: on ? "var(--dc-surface)" : "var(--dc-text2)",
  };
}

/** Segmented control (Before paying, Settings, Radar). */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  variant = "hover",
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
  /** "hover": grey track, white thumb. "ink": surface track, ink thumb (Radar). */
  variant?: "hover" | "ink";
}) {
  const track: CSSProperties =
    variant === "ink"
      ? { display: "flex", gap: 4, padding: 4, borderRadius: 999, background: "var(--dc-surface)", border: "1px solid var(--dc-line)" }
      : { display: "flex", gap: 4, padding: 4, borderRadius: 999, background: "var(--dc-hover)", alignSelf: "flex-start" };
  return (
    <div role="radiogroup" aria-label={label} style={track}>
      {options.map((o) => {
        const on = o.id === value;
        const s: CSSProperties =
          variant === "ink"
            ? { height: 36, padding: "0 16px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 14, background: on ? "var(--dc-ink)" : "transparent", color: on ? "var(--dc-surface)" : "var(--dc-text2)" }
            : { height: 36, padding: "0 16px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 14, background: on ? "var(--dc-surface)" : "transparent", color: on ? "var(--dc-ink)" : "var(--dc-text2)", boxShadow: on ? "0 1px 3px rgba(0,0,0,0.12)" : "none" };
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)} style={s}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The square verdict mark: "!" / "✓" / "✕" on a tone tint. */
export function Mark({ tone, glyph, size = 64 }: { tone: Tone; glyph: string; size?: 36 | 40 | 44 | 48 | 60 | 64 | 72 }) {
  const radius = size >= 72 ? 24 : size >= 60 ? (size === 60 ? 20 : 22) : size >= 48 ? 16 : 14;
  const font = size >= 72 ? 32 : size >= 64 ? 28 : size >= 60 ? 26 : size >= 48 ? 22 : 15;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, background: TONE[tone].hl, color: TONE[tone].fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: font, fontWeight: 700, flexShrink: 0 }}>
      {glyph}
    </span>
  );
}

/** The ink "What to do now" panel that closes every result. */
export function WhatToDoPanel({
  label,
  headline,
  body,
  children,
  radius = 32,
  size = 26,
}: {
  label: string;
  headline: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  radius?: number;
  size?: number;
}) {
  return (
    <div style={{ background: "var(--dc-ink)", color: "var(--dc-surface)", borderRadius: radius, padding: "32px 36px", display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: 13, opacity: 0.6 }}>{label}</span>
      <span style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.2, maxWidth: 560 }}>{headline}</span>
      {body && <span style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.7, maxWidth: 520 }}>{body}</span>}
      {children && <div style={{ display: "flex", gap: 10, paddingTop: 6, flexWrap: "wrap" }}>{children}</div>}
    </div>
  );
}

/** Dashed empty/idle panel ("The result will appear here."). */
export function IdlePanel({ title, body, minHeight = 460, dashed = true }: { title: ReactNode; body?: ReactNode; minHeight?: number; dashed?: boolean }) {
  return (
    <div style={{ border: dashed ? "1.5px dashed var(--dc-line-strong)" : "1px solid var(--dc-line)", borderRadius: 32, minHeight, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 36, gap: 8 }}>
      <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.04em" }}>{title}</span>
      {body && <span style={{ fontSize: 15, color: "var(--dc-text3)" }}>{body}</span>}
    </div>
  );
}
