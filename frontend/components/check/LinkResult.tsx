import { Mark, TONE } from "../dc";
import { fill, type CheckCopy } from "./content";
import type { CheckUrlResponse } from "@/lib/types";
import type { Tone } from "../dc";

/**
 * "Link" mode's result: the real, deterministic POST /api/check-url answer
 * (domain matching, RDAP age, certificate transparency, community reports —
 * the page itself is never opened). No verdict is returned by the API for a
 * bare URL, so the tone here is derived honestly from what it DID return:
 * a high-severity signal, else "flagged", else trusted/official.
 */
export default function LinkResult({ data, t }: { data: CheckUrlResponse; t: CheckCopy }) {
  const highSeverity = data.signals.some((s) => s.severity === "high");
  const tone: Tone = highSeverity ? "red" : data.flagged ? "amber" : "green";
  const word = highSeverity ? t.result.words.scam : data.flagged ? t.result.words.suspicious : t.result.words.safe;

  const rows: { label: string; value: string }[] = [];
  if (data.officialInstitution) rows.push({ label: t.result.linkFacts.official.replace("{who}", data.officialInstitution), value: "" });
  else if (data.trusted) rows.push({ label: t.result.linkFacts.trusted, value: "" });
  if (typeof data.domainAgeDays === "number") {
    rows.push({ label: data.domainAgeDays >= 365 ? t.result.linkFacts.ageYears : fill(t.result.linkFacts.age, { n: data.domainAgeDays }), value: "" });
  }
  if (data.reportCount > 0) rows.push({ label: fill(t.result.linkFacts.reports, { n: data.reportCount }), value: "" });
  if (data.certificate?.organization) rows.push({ label: fill(t.result.linkFacts.cert, { org: data.certificate.organization }), value: "" });
  if (data.resolvedUrl) rows.push({ label: fill(t.result.linkFacts.shortened, { url: data.resolvedUrl }), value: "" });

  return (
    <article data-nofx style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Mark tone={tone} glyph={highSeverity ? "✕" : data.flagged ? "!" : "✓"} size={40} />
        <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)" }}>{data.host ?? data.url}</span>
      </div>
      <h2 style={{ margin: 0, fontSize: 48, lineHeight: 0.98, fontWeight: 600, letterSpacing: "-0.045em", color: TONE[tone].fg }}>{word}</h2>

      {rows.length > 0 && (
        <ul style={{ display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" }}>
          {rows.map((r, i) => (
            <li key={i} style={{ padding: "12px 0", borderTop: "1px solid var(--dc-line2)", fontSize: 15, color: "var(--dc-ink)" }}>
              {r.label}
            </li>
          ))}
        </ul>
      )}

      {data.signals.length > 0 && (
        <ul style={{ display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" }}>
          {data.signals.map((s, i) => (
            <li key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: "1px solid var(--dc-line2)", fontSize: 14, color: "var(--dc-text2)" }}>
              <span aria-hidden="true" style={{ color: TONE[s.severity === "high" ? "red" : s.severity === "medium" ? "amber" : "green"].fg }}>●</span>
              {s.description}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
