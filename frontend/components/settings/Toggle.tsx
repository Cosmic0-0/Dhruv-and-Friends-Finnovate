"use client";

import type { CSSProperties } from "react";

/**
 * iOS-style toggle switch, styled from the --dc-* tokens (Settings.dc.html).
 * A plain <button role="switch">, not a checkbox, so it composes with the
 * design's other pill controls without extra CSS.
 */
export default function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const track: CSSProperties = {
    width: 46,
    height: 27,
    borderRadius: 999,
    border: `1px solid ${on ? "var(--dc-ink)" : "var(--dc-line-strong)"}`,
    background: on ? "var(--dc-ink)" : "var(--dc-hover)",
    position: "relative",
    padding: 2,
    flexShrink: 0,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "background .2s ease, border-color .2s ease",
  };
  const thumb: CSSProperties = {
    display: "block",
    width: 21,
    height: 21,
    borderRadius: "50%",
    background: "var(--dc-surface)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    transform: on ? "translateX(19px)" : "translateX(0)",
    transition: "transform .2s cubic-bezier(.2,.8,.2,1)",
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={track}
    >
      <span style={thumb} />
    </button>
  );
}
