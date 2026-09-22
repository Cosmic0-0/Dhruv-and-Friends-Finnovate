/**
 * Evidence highlighting for the result screen. Pure, so it's unit-tested
 * (lib/highlight.test.ts).
 *
 * Guarantee: the returned segments, joined, are EXACTLY the input text.
 * Highlighting only ever splits the user's text; it never changes, reorders
 * or drops a character. Evidence that doesn't match is ignored silently.
 */

import type { Severity } from "./types";

export interface EvidenceMark {
  evidence: string;
  severity: Severity;
}

export interface Segment {
  text: string;
  /** Present when this segment is highlighted. */
  severity?: Severity;
}

const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive, and any run of whitespace in the evidence matches any run in the text. */
function evidencePattern(evidence: string): RegExp | null {
  const words = evidence.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return new RegExp(words.map(escapeRegExp).join("\\s+"), "gi");
}

interface Range {
  start: number;
  end: number;
  severity: Severity;
}

export function highlightSegments(text: string, marks: readonly EvidenceMark[]): Segment[] {
  const candidates: Range[] = [];
  for (const { evidence, severity } of marks) {
    if (typeof evidence !== "string") continue;
    const re = evidencePattern(evidence);
    if (!re) continue;
    for (const m of text.matchAll(re)) {
      if (m[0].length > 0) candidates.push({ start: m.index, end: m.index + m[0].length, severity });
    }
  }

  // Higher severity claims first; ties go to the earlier, then longer, match.
  candidates.sort(
    (a, b) => RANK[b.severity] - RANK[a.severity] || a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const accepted: Range[] = [];
  for (const c of candidates) {
    if (!accepted.some((a) => c.start < a.end && c.end > a.start)) accepted.push(c);
  }
  accepted.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const r of accepted) {
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start) });
    segments.push({ text: text.slice(r.start, r.end), severity: r.severity });
    cursor = r.end;
  }
  if (cursor < text.length || segments.length === 0) segments.push({ text: text.slice(cursor) });
  return segments;
}
