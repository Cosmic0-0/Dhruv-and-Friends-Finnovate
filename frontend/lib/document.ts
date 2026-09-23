/**
 * Pure helpers for the document check (components/document/CheckDocumentScreen.tsx)
 * and the result screen's "Document integrity" panel. They pre-check a file
 * before upload and turn the backend's DOC-* findings and preview numbers
 * into keys the copy can phrase (lib/i18n.ts). No detection happens here:
 * every finding comes from the backend. Unit-tested in lib/document.test.ts.
 */

import type { DocumentPreview, Severity, Signal } from "./types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The file picker's accept list. The backend decides the real type from the file's bytes. */
export const DOCUMENT_ACCEPT = `.pdf,.docx,application/pdf,${DOCX_MIME}`;

export type DocumentPrecheck = "ok" | "too_large" | "unsupported" | "empty";

/**
 * A quick check before uploading, so an obviously wrong file never leaves the
 * device. The name/type are only a hint here - the server checks the content,
 * so a renamed .txt still comes back as "unsupported" from the server.
 */
export function precheckDocument(file: { name: string; size: number; type: string }, maxBytes: number): DocumentPrecheck {
  if (file.size === 0) return "empty";
  if (file.size > maxBytes) return "too_large";
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || name.endsWith(".docx") || file.type === "application/pdf" || file.type === DOCX_MIME) return "ok";
  return "unsupported";
}

/** "830 KB", "2.4 MB" - for showing the picked file. */
export function formatFileSize(bytes: number, locale = "en"): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}

export const DOC_FINDING_KEYS = [
  "DOC-01",
  "DOC-02",
  "DOC-02:incremental_update",
  "DOC-02:after_signature",
  "DOC-03",
  "DOC-03:mod_before_create",
  "DOC-03:future_date",
  "DOC-03:producer_mismatch",
  "DOC-04",
  "DOC-04:transparent_overlay",
  "DOC-04:resolution_mismatch",
  "DOC-04:overlay",
  "DOC-04:docx_transparent_image",
  "DOC-05",
  "DOC-06",
  "DOC-06:invisible_render_mode",
  "DOC-06:white_text",
  "DOC-06:tiny_font",
  "DOC-07",
  "DOC-07:javascript",
  "DOC-07:launch_action",
  "DOC-07:embedded_file",
  "DOC-07:submit_form",
  "DOC-07:macro",
  "DOC-07:external_template",
  "DOC-07:ole_object",
  "DOC-08",
  "other",
] as const;
export type DocFindingKey = (typeof DOC_FINDING_KEYS)[number];

/** One document finding, reduced to the facts its sentence needs. Strings are backend-redacted document text. */
export interface DocFinding {
  key: DocFindingKey;
  severity: Severity;
  page: number | null;
  tools: string[];
  snippet: string | null;
  font: string | null;
  dominantFont: string | null;
  host: string | null;
  ratio: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const KNOWN = new Set<string>(DOC_FINDING_KEYS);

/** The DOC-* signals of a result, in severity order as the backend sent them sorted. */
export function documentFindings(signals: readonly Signal[]): DocFinding[] {
  return signals
    .filter((s) => typeof s.code === "string" && s.code.startsWith("DOC-"))
    .map((s) => {
      const m = s.metadata ?? {};
      const code = s.code as string;
      const variant = str(m.variant);
      const key = (variant && KNOWN.has(`${code}:${variant}`) ? `${code}:${variant}` : KNOWN.has(code) ? code : "other") as DocFindingKey;
      const snippets = Array.isArray(m.snippets) ? m.snippets.filter((x): x is string => typeof x === "string") : [];
      return {
        key,
        severity: s.severity,
        page: num(m.page),
        tools: Array.isArray(m.tools) ? m.tools.filter((x): x is string => typeof x === "string") : [],
        snippet: str(s.evidence) ?? snippets[0] ?? null,
        font: str(m.font),
        dominantFont: str(m.dominantFont),
        host: str(m.host),
        ratio: num(m.resolutionRatio),
      };
    });
}

export interface PreviewFacts {
  page: number | null;
  transparent: boolean;
  /** How many times lower its resolution is than the scan's, when that is at least 2x. */
  lowerRes: number | null;
  hardEdges: boolean;
}

/** What a preview's numbers mean, for its caption. */
export function previewFacts(p: DocumentPreview): PreviewFacts {
  const ratio = p.effectiveDpi && p.backgroundDpi ? p.backgroundDpi / p.effectiveDpi : null;
  return {
    page: p.page,
    transparent: p.hasAlpha,
    lowerRes: ratio !== null && ratio >= 2 ? Math.round(ratio * 10) / 10 : null,
    hardEdges: p.hardEdgeRatio !== null && p.hardEdgeRatio >= 0.8,
  };
}

/** The same stored result without preview images (for when sessionStorage is full). */
export function withoutPreviews<T extends { response: { document?: { previews: DocumentPreview[] } } }>(stored: T): T {
  const doc = stored.response.document;
  return doc ? { ...stored, response: { ...stored.response, document: { ...doc, previews: [] } } } : stored;
}
