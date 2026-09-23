// Aggregates for the full-screen Security Report (extension/report.html):
// per-area posture scores, severity counts and points lost per category.
// Computed here rather than in the extension, from the SAME per-category
// point losses computeGrade() uses (repeat weighting + category cap), so the
// category bars always sum to 100 - score and area scores never disagree
// with the grade. The page only draws these numbers.

import { pointsLostByCategory } from "./checks.js";

export const SEVERITIES = Object.freeze(["high", "medium", "low", "info"]);

// Every finding category belongs to exactly one area. `client: true` areas
// can only be judged from extension-collected signals; without them they are
// "not_checked", never "clean".
export const AREAS = Object.freeze([
  { id: "transport", label: "Transport & TLS", categories: ["tls", "network"] },
  { id: "headers", label: "Security headers", categories: ["headers", "cors", "policy"] },
  { id: "framing", label: "Clickjacking", categories: ["framing"] },
  { id: "cookies", label: "Cookies", categories: ["cookies"] },
  { id: "exposure", label: "Exposed files & info", categories: ["exposed-artifacts", "disclosure", "injection-signal"] },
  { id: "page-code", label: "Page code", categories: ["client-dom", "sri", "vulnerable-library"], client: true },
  { id: "content", label: "Forms & content", categories: ["mixed-content", "forms", "credentials"], client: true },
  { id: "third-party", label: "Third parties", categories: ["third-party", "api-surface"], client: true },
]);

const AREA_BY_CATEGORY = new Map(AREAS.flatMap((a) => a.categories.map((c) => [c, a.id])));

export function areaForCategory(category) {
  return AREA_BY_CATEGORY.get(category) ?? null;
}

/**
 * @param {object[]} findings
 * @param {{ reachable: boolean, clientSignals: boolean }} coverage
 */
export function summarizeReport(findings, { reachable, clientSignals }) {
  const severityCounts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) if (f.severity in severityCounts) severityCounts[f.severity]++;

  const lostByCategory = pointsLostByCategory(findings);
  const byCategory = new Map();
  for (const f of findings) {
    const entry = byCategory.get(f.category) ?? { category: f.category, area: areaForCategory(f.category), count: 0, points: lostByCategory.get(f.category) ?? 0 };
    entry.count++;
    byCategory.set(f.category, entry);
  }

  const areas = AREAS.map((area) => {
    const inArea = findings.filter((f) => area.categories.includes(f.category));
    const lost = area.categories.reduce((sum, c) => sum + (lostByCategory.get(c) ?? 0), 0);
    // Each side is judged independently: client areas come from the page
    // itself, so they're checked even when the backend couldn't reach the site.
    const checked = area.client ? clientSignals : reachable;
    const status = !checked ? "not_checked" : lost > 0 ? "issues" : "clean";
    return { id: area.id, label: area.label, status, score: checked ? Math.max(0, 100 - lost) : null, findings: inArea.length, pointsLost: lost };
  });

  return {
    severityCounts,
    categories: [...byCategory.values()].sort((a, b) => b.points - a.points || b.count - a.count),
    areas,
  };
}
