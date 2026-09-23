import type { Copy, UiLanguage } from "@/lib/i18n";
import { documentFindings, previewFacts } from "@/lib/document";
import type { AnalyzeResponse, DocumentInfo, Severity, Signal } from "@/lib/types";

const SEVERITY_RULE: Record<Severity, string> = {
  high: "bg-danger",
  medium: "bg-caution",
  low: "bg-ink-muted/35",
};

/** The usual "transparent" checkerboard, so a pasted image's see-through background is visible. */
const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage: "conic-gradient(#d4d4d8 25%, transparent 0 50%, #d4d4d8 0 75%, transparent 0)",
  backgroundSize: "12px 12px",
};

const DOC_ACTIONS = ["doc_verify_with_issuer", "doc_dont_enable_content"] as const;

/**
 * "What to do now" for a flagged document. The steps are the backend
 * intervention policy's document actions (response.actions ids), worded in
 * the UI language - the SMS-oriented steps ("block the sender", "don't open
 * the link") don't fit a file.
 */
export function DocumentWhatToDo({ actions, copy }: { actions: AnalyzeResponse["actions"]; copy: Copy }) {
  const w = copy.document.whatToDo;
  const ids = new Set((actions ?? []).map((a) => a.id));
  const picked = DOC_ACTIONS.filter((id) => ids.has(id)).map((id) => w[id]);
  const steps = [w.dontAct, ...(picked.length ? picked : [w.verify])];
  return (
    <section className="suggestion flex flex-col gap-3.5 px-5 py-[18px]" aria-labelledby="doc-todo-label">
      <h2 id="doc-todo-label" className="micro text-ink-muted">
        {copy.result.whatToDoTitle}
      </h2>
      <ol className="flex flex-col">
        {steps.map((text, i) => (
          <li key={i} className="flex gap-3 border-t border-black/[0.08] py-2.5 first:border-t-0 first:pt-0 last:pb-0">
            <span aria-hidden="true" className="data mt-px shrink-0 font-semibold text-ink-muted">
              {i + 1}
            </span>
            <span className="text-[0.9375rem] leading-5 text-ink">{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * "Document integrity": what the backend found in the uploaded FILE (not its
 * text) - the file's facts, each DOC-* finding in plain words, and small
 * previews of images found pasted onto a scan. Rendered only when the result
 * came from /api/analyze/document. Everything is shown as text nodes; previews
 * are PNG data URLs already validated in lib/api.ts. Nothing is inferred here:
 * an empty list means the backend found nothing, and says only that.
 */
export default function DocumentIntegrityPanel({
  document,
  signals,
  copy,
  lang,
}: {
  document: DocumentInfo;
  signals: Signal[];
  copy: Copy;
  lang: UiLanguage;
}) {
  const p = copy.document.panel;
  const findings = documentFindings(signals);
  const m = document.metadata;
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : null;
  const editedAfterSigning = findings.some((f) => f.key === "DOC-02:after_signature");

  const facts: [string, string | null][] = [
    [p.fileType, p.fileTypes[document.fileType]],
    [p.pages, document.pageCount === null && document.pagesAnalyzed === null ? null : p.pagesValue(document.pagesAnalyzed, document.pageCount)],
    [p.producer, m.producer],
    [p.creator, m.creator && m.creator !== m.producer ? m.creator : null],
    [p.created, date(m.created)],
    [p.modified, m.modified && m.modified !== m.created ? date(m.modified) : null],
    [
      p.revisions,
      m.incrementalUpdates === null ? null : editedAfterSigning ? p.editedAfterSigning : p.revisionsValue(m.incrementalUpdates),
    ],
    [p.signature, document.fileType === "pdf" || m.signed ? (m.signed ? p.signed : p.notSigned) : null],
    [p.textSource, p.textSources[document.textSource]],
  ];

  return (
    <section className="sheet" aria-labelledby="doc-integrity-title">
      <div className="px-5 pt-4 pb-3">
        <h2 id="doc-integrity-title" className="micro text-ink-muted">
          {p.title}
        </h2>
        <p className="mt-1 text-[0.9375rem] leading-snug text-ink-soft">{p.subtitle}</p>
      </div>

      {document.previews.length > 0 && (
        <div className="px-5 py-4">
          <p className="micro text-ink-muted">{p.previewsTitle}</p>
          <ul className="mt-3 flex flex-col gap-4">
            {document.previews.map((pv, i) => (
              <li key={i} className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
                <span className="inline-flex w-fit shrink-0 rounded-xl border border-card-border p-2" style={CHECKERBOARD}>
                  {/* A data: URL validated in lib/api.ts; shown enlarged with
                      nearest-neighbour scaling so hard, pixelated edges stay visible. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pv.dataUrl}
                    alt={p.previewAlt(pv.page)}
                    width={Math.min(pv.widthPx * 2, 240)}
                    className="h-auto max-w-[240px]"
                    style={{ imageRendering: "pixelated" }}
                  />
                </span>
                <p className="text-[0.9375rem] leading-snug text-ink">{p.previewCaption(previewFacts(pv))}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-5 py-4">
        <p className="micro text-ink-muted">{p.findingsTitle}</p>
        {findings.length === 0 ? (
          <p className="mt-2 text-[0.9375rem] leading-snug text-ink">{p.none}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {findings.map((f, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden="true" className={`mt-1 w-0.5 shrink-0 self-stretch ${SEVERITY_RULE[f.severity]}`} />
                <p className="text-[0.9375rem] leading-relaxed text-ink [overflow-wrap:anywhere]">
                  <span className="sr-only">{copy.result.severity[f.severity]}: </span>
                  {p.findings[f.key](f)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 py-4">
        <p className="micro text-ink-muted">{p.fileFacts}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.9375rem]">
          {facts
            .filter((row): row is [string, string] => Boolean(row[1]))
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-ink [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      {document.textTruncated && <p className="bg-caution-soft px-5 py-3 text-[0.9375rem] leading-snug text-ink">{p.truncated}</p>}

      <p className="px-5 py-4 text-[0.8125rem] leading-snug text-ink-muted">{p.caveat}</p>
    </section>
  );
}
