// Full-screen Security Report. Opened from the popup as
// report.html?id=<reportId>; the report itself was saved to
// chrome.storage.session by security-report.js. Every number drawn here -
// grade, score, area scores, points lost - comes from the backend's
// response (backend/src/services/site-security/summary.js); this page only
// renders it. All report text goes into the DOM via textContent, never
// innerHTML, because titles/evidence contain strings taken from the scanned
// site's own headers and markup.

import { loadReport } from "./security-report.js";

const Chart = globalThis.Chart;

const SEVERITIES = ["high", "medium", "low", "info"];
const CATEGORY_LABELS = {
  headers: "Security headers",
  framing: "Clickjacking",
  cors: "CORS",
  policy: "Disclosure policy",
  cookies: "Cookies",
  tls: "TLS / HTTPS",
  network: "Network",
  "exposed-artifacts": "Exposed files",
  disclosure: "Version disclosure",
  "injection-signal": "Error signatures",
  "client-dom": "DOM sinks",
  sri: "Subresource Integrity",
  "vulnerable-library": "Vulnerable libraries",
  "mixed-content": "Mixed content",
  forms: "Forms",
  credentials: "Credentials",
  "third-party": "Third-party scripts",
  "api-surface": "API calls",
  coverage: "Report coverage",
  identity: "Identity & intent",
};
const AREA_STATUS_LABEL = { clean: "Clean", issues: "Issues", not_checked: "Not checked" };

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

// Screen palette from styles.css tokens; print palette is fixed (charts are
// canvas pixels, so they don't follow the @media print variable overrides).
function palette(print = false) {
  if (print) {
    return { ink: "#111", muted: "#666", line: "#ddd", accent: "#3f6385", caution: "#9a7224", danger: "#9d3f32", neutral: "#888", track: "#eee" };
  }
  return {
    ink: cssVar("--ink"),
    muted: cssVar("--ink-muted"),
    line: cssVar("--line"),
    accent: cssVar("--accent"),
    caution: cssVar("--caution"),
    danger: cssVar("--danger"),
    neutral: cssVar("--neutral"),
    track: cssVar("--panel-2"),
  };
}

const bandColor = (score, p) => (score >= 75 ? p.accent : score >= 60 ? p.caution : p.danger);
const severityColor = (sev, p) => ({ high: p.danger, medium: p.caution, low: p.accent, info: p.neutral })[sev] ?? p.neutral;
const categoryLabel = (c) => CATEGORY_LABELS[c] ?? c;

// ---------------- Header / overview ----------------

function renderHeader(entry) {
  const { report, hostname } = entry;
  $("rp-host").textContent = hostname;
  $("rp-url").textContent = report.finalUrl || report.url;
  const scanned = new Date(report.scannedAt);
  $("rp-scanned").textContent = Number.isNaN(scanned.getTime()) ? "" : `Scanned ${scanned.toLocaleString()}`;
  document.title = `${hostname} — Security Report — FraudLens AI`;
}

function severityCounts(report) {
  if (report.summary?.severityCounts) return report.summary.severityCounts;
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of report.findings) if (f.severity in counts) counts[f.severity]++;
  return counts;
}

function renderOverview(report) {
  const counts = severityCounts(report);
  for (const sev of SEVERITIES) {
    $(`kpi-${sev}`).textContent = String(counts[sev] ?? 0);
    $(`kpi-${sev}`).parentElement.dataset.zero = String(!counts[sev]);
  }

  $("rp-grade").textContent = report.grade;
  $("rp-score").textContent = typeof report.score === "number" ? `${report.score} / 100` : "no score";
  const costly = (counts.high ?? 0) + (counts.medium ?? 0) + (counts.low ?? 0);
  $("rp-grade-note").textContent =
    report.grade === "N/A"
      ? "The FraudLens backend could not reach this site, so server-side checks did not run."
      : costly === 0
        ? "Nothing on this page cost points."
        : `${costly} finding${costly === 1 ? "" : "s"} cost points.`;

  const list = $("rp-areas");
  list.textContent = "";
  for (const area of report.summary?.areas ?? []) {
    const li = el("li");
    li.append(el("span", "", area.label));
    const status = el("span", "rp-area-status", area.status === "issues" ? `${area.score}` : AREA_STATUS_LABEL[area.status] ?? area.status);
    status.dataset.status = area.status;
    if (typeof area.score === "number") status.dataset.scoreBand = area.score >= 75 ? "high" : area.score >= 60 ? "mid" : "low";
    status.title = AREA_STATUS_LABEL[area.status] ?? "";
    li.append(status);
    list.append(li);
  }
}

// ---------------- Charts ----------------

const charts = [];

function applyChartDefaults(p) {
  Chart.defaults.font.family = cssVar("--font-sans") || "system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = p.muted;
  Chart.defaults.borderColor = p.line;
  Chart.defaults.animation = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 450 };
}

function ringChart(report, p) {
  const score = typeof report.score === "number" ? report.score : 0;
  const colors = (pp) => [report.score === null ? pp.neutral : bandColor(score, pp), pp.track];
  const chart = new Chart($("score-ring"), {
    type: "doughnut",
    data: { datasets: [{ data: [score, 100 - score], backgroundColor: colors(p), borderWidth: 0 }] },
    options: { cutout: "84%", responsive: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, events: [] },
  });
  return { chart, recolor: (pp) => (chart.data.datasets[0].backgroundColor = colors(pp)) };
}

function horizontalBarOptions(p, { max, suffix }) {
  return {
    indexAxis: "y",
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0e1013",
        titleColor: "#eef0ef",
        bodyColor: "#eef0ef",
        borderColor: p.line,
        borderWidth: 1,
        cornerRadius: 0,
        displayColors: false,
        callbacks: { label: (ctx) => `${ctx.parsed.x}${suffix}` },
      },
    },
    scales: {
      x: { min: 0, max, grid: { color: p.line, drawTicks: false }, border: { display: false }, ticks: { padding: 6 } },
      y: { grid: { display: false }, border: { color: p.line }, ticks: { color: p.ink, padding: 8 } },
    },
    elements: { bar: { borderRadius: 0, borderSkipped: false } },
  };
}

function areaChart(report, p) {
  const areas = (report.summary?.areas ?? []).filter((a) => typeof a.score === "number");
  if (areas.length === 0) return null;
  const colors = (pp) => areas.map((a) => bandColor(a.score, pp));
  const chart = new Chart($("area-chart"), {
    type: "bar",
    data: { labels: areas.map((a) => a.label), datasets: [{ data: areas.map((a) => a.score), backgroundColor: colors(p), barThickness: 14 }] },
    options: horizontalBarOptions(p, { max: 100, suffix: " / 100" }),
  });
  return { chart, recolor: (pp) => { chart.data.datasets[0].backgroundColor = colors(pp); restyleAxes(chart, pp); } };
}

function worstSeverity(findings, category) {
  return SEVERITIES.find((s) => findings.some((f) => f.category === category && f.severity === s)) ?? "info";
}

function categoryChart(report, p) {
  const categories = (report.summary?.categories ?? []).filter((c) => c.points > 0);
  $("category-empty").hidden = categories.length > 0;
  $("category-chart").parentElement.hidden = categories.length === 0;
  if (categories.length === 0) return null;
  const colors = (pp) => categories.map((c) => severityColor(worstSeverity(report.findings, c.category), pp));
  const max = Math.max(...categories.map((c) => c.points));
  const chart = new Chart($("category-chart"), {
    type: "bar",
    data: { labels: categories.map((c) => categoryLabel(c.category)), datasets: [{ data: categories.map((c) => c.points), backgroundColor: colors(p), barThickness: 14 }] },
    options: horizontalBarOptions(p, { max: Math.ceil(max / 10) * 10 + 5, suffix: " points" }),
  });
  return { chart, recolor: (pp) => { chart.data.datasets[0].backgroundColor = colors(pp); restyleAxes(chart, pp); } };
}

function restyleAxes(chart, p) {
  chart.options.scales.x.grid.color = p.line;
  chart.options.scales.x.ticks.color = p.muted;
  chart.options.scales.y.border.color = p.line;
  chart.options.scales.y.ticks.color = p.ink;
}

function renderCharts(report) {
  if (!Chart) return; // vendor script failed to load - the numbers are still in the KPI tiles and findings
  const p = palette();
  applyChartDefaults(p);
  for (const chart of [ringChart(report, p), areaChart(report, p), categoryChart(report, p)]) if (chart) charts.push(chart);
  if (!report.summary) {
    for (const id of ["area-chart", "category-chart"]) $(id).closest(".rp-chart").hidden = true;
  }
}

function recolorCharts(print) {
  const p = palette(print);
  for (const { chart, recolor } of charts) {
    recolor(p);
    chart.update("none");
  }
}

// ---------------- Findings ----------------

const filters = { severity: "all", query: "" };

function areaOrder(report) {
  const order = new Map((report.summary?.areas ?? []).map((a, i) => [a.id, i]));
  const areaOfCategory = new Map((report.summary?.categories ?? []).map((c) => [c.category, c.area]));
  const labels = new Map((report.summary?.areas ?? []).map((a) => [a.id, a.label]));
  return { order, areaOfCategory, labels };
}

function findingMatches(f) {
  if (filters.severity !== "all" && f.severity !== filters.severity) return false;
  if (!filters.query) return true;
  const hay = `${f.title} ${f.description} ${f.evidence ?? ""} ${categoryLabel(f.category)}`.toLowerCase();
  return hay.includes(filters.query);
}

function findingNode(f) {
  const details = el("details", "rp-finding");
  details.dataset.sev = f.severity;
  const summary = el("summary");
  summary.append(el("span", "rp-sev", f.severity), el("span", "rp-finding-title", f.title), el("span", "rp-finding-cat", categoryLabel(f.category)));
  details.append(summary);

  const body = el("div", "rp-finding-body");
  body.append(el("p", "", f.description));
  if (f.evidence) {
    const ev = el("div", "rp-evidence");
    ev.append(el("span", "rp-evidence-label", "Evidence"), document.createTextNode(f.evidence));
    body.append(ev);
  }
  const where = locationsNode(f.locations, f.evidence);
  if (where) body.append(where);
  if (f.recommendation) {
    const fix = el("p", "rp-fix");
    fix.append(el("span", "rp-fix-label", "How to fix"), document.createTextNode(f.recommendation));
    body.append(fix);
  }
  details.append(body);
  return details;
}

/**
 * "Where in the code": file (script URL, the page itself, or the part of the
 * server response), line, and that line of code. Page code is untrusted, so
 * every value goes in as a text node.
 */
function locationsNode(locations, evidence) {
  if (!Array.isArray(locations) || locations.length === 0) return null;
  const wrap = el("div", "rp-where");
  wrap.append(el("span", "rp-evidence-label", locations.length === 1 ? "Where in the code" : `Where in the code (first ${locations.length})`));
  for (const loc of locations) {
    const item = el("div", "rp-where-item");
    const file = typeof loc.file === "string" ? loc.file : "";
    item.append(el("span", "rp-where-file mono", Number.isInteger(loc.line) ? `${file}:${loc.line}` : file));
    // Server findings: the "code" is the header already shown as Evidence.
    if (loc.code && loc.code !== evidence) {
      const code = el("pre", "rp-where-code");
      if (Number.isInteger(loc.line)) code.append(el("span", "rp-where-line", String(loc.line)));
      code.append(document.createTextNode(loc.code));
      item.append(code);
    }
    wrap.append(item);
  }
  return wrap;
}

// ---------------- Icons ----------------
// One drawn set, 1.5px stroke on a 16px grid, coloured by currentColor.

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATHS = {
  pass: ["M3.5 8.5l3 3 6-7"],
  fail: ["M4.5 4.5l7 7", "M11.5 4.5l-7 7"],
  warn: ["M8 2.5l6 11H2z", "M8 7v3", "M8 11.8v.2"],
  neutral: ["M8 4.5v.2", "M8 7v4.5"],
  unknown: ["M4.5 8h7"],
  shield: ["M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z"],
};

function icon(name, className = "rp-icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICON_PATHS[name] ?? ICON_PATHS.unknown) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

// ---------------- Badly built vs hostile ----------------

const INTENT_ICON = { malicious: "fail", suspicious: "warn", weak_security: "shield", ok: "pass" };

function renderIntent(report) {
  const intent = report.intent;
  const box = $("rp-intent");
  if (!intent?.headline) {
    box.hidden = true; // report from an older backend
    return;
  }
  box.hidden = false;
  box.dataset.kind = intent.kind;
  document.body.dataset.verdict = intent.kind; // tints the backdrop
  const badge = $("rp-intent-icon");
  badge.textContent = "";
  badge.append(icon(INTENT_ICON[intent.kind] ?? "unknown", "rp-intent-svg"));
  $("rp-intent-headline").textContent = intent.headline;
  $("rp-intent-explanation").textContent = intent.explanation ?? "";
  const list = $("rp-intent-reasons");
  list.textContent = "";
  const reasons = Array.isArray(intent.reasons) ? intent.reasons : [];
  const facts = Array.isArray(intent.trustFacts) ? intent.trustFacts : [];
  for (const r of reasons) {
    const li = el("li", "rp-intent-item");
    li.dataset.tone = "bad";
    li.append(icon("fail"), el("span", "", r));
    list.append(li);
  }
  for (const f of facts) {
    const li = el("li", "rp-intent-item");
    li.dataset.tone = "good";
    li.append(icon("pass"), el("span", "", f));
    list.append(li);
  }
  list.hidden = reasons.length + facts.length === 0;
}

// ---------------- What gives a scam away ----------------

const KEY_STATUS_LABEL = { pass: "Pass", fail: "Fail", warn: "Caution", neutral: "Note", unknown: "Not checked" };

function renderKeyChecks(report) {
  const checks = Array.isArray(report.keyChecks) ? report.keyChecks : [];
  const section = $("rp-key");
  section.hidden = checks.length === 0;
  const list = $("rp-key-list");
  list.textContent = "";
  for (const check of checks) {
    const li = el("li", "rp-key-item");
    li.dataset.status = check.status;
    const status = el("span", "rp-key-status");
    status.append(icon(check.status), el("span", "visually-hidden", KEY_STATUS_LABEL[check.status] ?? check.status));
    const text = el("div", "rp-key-text");
    text.append(el("span", "rp-key-label", check.label), el("span", "rp-key-value", check.value ?? ""));
    li.append(status, text, el("p", "rp-key-detail", check.detail ?? ""));
    list.append(li);
  }
}

function renderFindings(report) {
  const { order, areaOfCategory, labels } = areaOrder(report);
  const visible = report.findings.filter(findingMatches);
  $("rp-count").textContent = visible.length === report.findings.length ? `${report.findings.length}` : `${visible.length} of ${report.findings.length}`;
  $("rp-findings-empty").hidden = visible.length > 0;

  const groups = new Map();
  for (const f of visible) {
    const area = areaOfCategory.get(f.category) ?? "other";
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(f);
  }
  const sortedAreas = [...groups.keys()].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));

  const list = $("rp-findings-list");
  list.textContent = "";
  for (const area of sortedAreas) {
    list.append(el("p", "rp-group-label", labels.get(area) ?? "Report notes"));
    const items = groups.get(area).sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
    for (const f of items) {
      const node = findingNode(f);
      // High findings start open - they're the ones worth reading first.
      if (f.severity === "high") node.open = true;
      list.append(node);
    }
  }
}

function wireFilters(report) {
  for (const chip of document.querySelectorAll(".rp-chip")) {
    chip.addEventListener("click", () => {
      filters.severity = chip.dataset.sev;
      for (const c of document.querySelectorAll(".rp-chip")) c.setAttribute("aria-pressed", String(c === chip));
      renderFindings(report);
    });
  }
  $("rp-search").addEventListener("input", (e) => {
    filters.query = e.target.value.trim().toLowerCase();
    renderFindings(report);
  });
}

// ---------------- Every check ----------------

const CHECK_STATUS_LABEL = { fail: "Failed", warn: "Warning", pass: "Passed", info: "Info", not_run: "Not checked" };

function renderChecks(report) {
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const section = $("rp-checks-list").closest("section");
  if (checks.length === 0) {
    section.hidden = true; // report from an older backend without a checklist
    return;
  }
  const areaLabels = new Map([["identity", "Identity"], ...(report.summary?.areas ?? []).map((a) => [a.id, a.label])]);
  const tally = { fail: 0, warn: 0, pass: 0, info: 0, not_run: 0 };
  for (const c of checks) tally[c.status] = (tally[c.status] ?? 0) + 1;

  $("rp-checks-count").textContent = String(checks.length);
  const tallyEl = $("rp-checks-tally");
  tallyEl.textContent = "";
  for (const status of ["fail", "warn", "pass", "info", "not_run"]) {
    const span = el("span");
    span.append(el("strong", "", String(tally[status])), document.createTextNode(CHECK_STATUS_LABEL[status].toLowerCase()));
    tallyEl.append(span);
  }

  const list = $("rp-checks-list");
  list.textContent = "";
  for (const check of checks) {
    const li = el("li", "rp-check");
    li.dataset.status = check.status;
    if (check.severity) li.dataset.sev = check.severity;
    const statusText = check.status === "fail" && check.severity ? `${CHECK_STATUS_LABEL.fail} · ${check.severity}` : CHECK_STATUS_LABEL[check.status] ?? check.status;
    li.append(el("span", "rp-check-status", statusText), el("span", "rp-check-label", check.label), el("span", "rp-check-area", areaLabels.get(check.area) ?? check.area));
    const detail = check.findings?.join("; ") || check.reason;
    if (detail) li.append(el("p", "rp-check-detail", detail));
    const where = locationsNode(check.locations);
    if (where) li.append(where);
    list.append(li);
  }
}

// ---------------- Actions ----------------

function wireActions(entry) {
  $("print-btn").addEventListener("click", () => window.print());
  $("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(entry.report, null, 2)], { type: "application/json" });
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    const date = (entry.report.scannedAt || "").slice(0, 10);
    a.download = `fraudlens-security-report-${entry.hostname}-${date}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  // Charts are canvas: swap to the light print palette around printing,
  // and expand every finding so the PDF is complete.
  let reopen = [];
  window.addEventListener("beforeprint", () => {
    reopen = [...document.querySelectorAll(".rp-finding:not([open])")];
    for (const d of reopen) d.open = true;
    recolorCharts(true);
  });
  window.addEventListener("afterprint", () => {
    for (const d of reopen) d.open = false;
    recolorCharts(false);
  });
}

function renderDatasets(report) {
  const fetched = report.coverage?.libraryDataFetchedAt;
  const parts = [];
  parts.push(report.coverage?.clientSignals === false ? "Page-content checks did not run for this report." : "Page-content checks ran in your browser.");
  if (fetched) parts.push(`Vulnerable-library signatures: Retire.js data fetched ${fetched}.`);
  $("rp-datasets").textContent = parts.join(" ");
}

// ---------------- Boot ----------------

async function main() {
  const id = new URLSearchParams(location.search).get("id");
  let entry = null;
  try {
    entry = await loadReport(chrome, id);
  } catch {
    entry = null;
  }
  if (!entry?.report) {
    $("report-missing").hidden = false;
    $("export-btn").disabled = true;
    $("print-btn").disabled = true;
    return;
  }

  $("report-root").hidden = false;
  const { report } = entry;
  report.findings = Array.isArray(report.findings) ? report.findings : [];
  renderHeader(entry);
  renderIntent(report);
  renderKeyChecks(report);
  renderOverview(report);
  renderCharts(report);
  renderFindings(report);
  renderChecks(report);
  renderDatasets(report);
  wireFilters(report);
  wireActions(entry);
}

main();
