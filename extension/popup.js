import { FRONTEND_ORIGIN, MAX_HANDOFF_CHARS } from "./config.js";
import { getRecentChecks } from "./history.js";
import { stateFromCheckUrl, STATE_LABEL, describeFailure } from "./state.js";
import { isWebUrl } from "./tab-state.js";
import { claimedIdentityLine, isReportableHost } from "./policy.js";

const els = {
  hostname: document.getElementById("hostname"),
  statePill: document.getElementById("state-pill"),
  statePillText: document.getElementById("state-pill-text"),
  stateText: document.getElementById("state-text"),
  signalsList: document.getElementById("signals-list"),
  signalsEmpty: document.getElementById("signals-empty"),
  scanBtn: document.getElementById("scan-page-btn"),
  reportBtn: document.getElementById("report-btn"),
  securityReportBtn: document.getElementById("security-report-btn"),
  openLink: document.getElementById("open-fraudlens-link"),
  actionStatus: document.getElementById("action-status"),
  scanSection: document.getElementById("scan-result-section"),
  scanResult: document.getElementById("scan-result"),
  recentList: document.getElementById("recent-list"),
  recentEmpty: document.getElementById("recent-empty"),
  securitySection: document.getElementById("security-report-section"),
  securityGrade: document.getElementById("security-grade"),
  securityGradeText: document.getElementById("security-grade-text"),
  securitySummary: document.getElementById("security-summary"),
  securityFindingsList: document.getElementById("security-findings-list"),
  securityFindingsEmpty: document.getElementById("security-findings-empty"),
  openReportBtn: document.getElementById("open-report-btn"),
};

// The popup shows only the strongest few findings; the rest (plus charts,
// evidence and fixes) are in the full-screen report.html.
const POPUP_MAX_SECURITY_FINDINGS = 5;
let lastReportId = null;

let currentHostname = null;
let domainState = "neutral"; // what the automatic domain check said for this tab
let lastScanText = ""; // capped scan text, used only for the FraudLens handoff link

// When two checks disagree, the pill shows the more serious one - a clean
// page scan must never turn a red lookalike-domain warning into "Safe", and
// a failed scan must never turn it grey (#1).
const SEVERITY_ORDER = ["neutral", "inconclusive", "unreachable", "limited", "safe", "suspicious", "high-risk"];
const worseState = (a, b) => (SEVERITY_ORDER.indexOf(b) > SEVERITY_ORDER.indexOf(a) ? b : a);

function setStatePill(state) {
  els.statePill.dataset.state = state;
  els.statePillText.textContent = state === "high-risk" ? "High risk" : capitalize(state);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function setStatus(text, kind = "") {
  els.actionStatus.className = kind ? `status-msg ${kind}` : "status-msg";
  els.actionStatus.textContent = text;
}

function renderSignals(signals) {
  els.signalsList.innerHTML = "";
  const list = Array.isArray(signals) ? signals : [];
  if (list.length === 0) {
    els.signalsEmpty.hidden = false;
    return;
  }
  els.signalsEmpty.hidden = true;
  // Strongest first: high > medium > low, top 4 so the popup stays compact.
  const rank = { high: 3, medium: 2, low: 1 };
  const sorted = [...list].sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0));
  for (const signal of sorted.slice(0, 4)) {
    const li = document.createElement("li");
    li.className = "signal-item";
    li.dataset.severity = signal.severity || "low";

    const type = document.createElement("div");
    type.className = "signal-type";
    type.textContent = (signal.type || "signal").replace(/_/g, " ");

    const desc = document.createElement("div");
    desc.className = "signal-desc";
    desc.textContent = signal.description || "";

    li.append(type, desc);
    els.signalsList.appendChild(li);
  }
}

// The web app's check screen reads ?scan= and pre-fills the message box
// with it (frontend/components/CheckForm.tsx), so this opens FraudLens with
// a short, capped excerpt of the scanned text ready to analyse in full.
function updateOpenLink(scanText) {
  const url = new URL(FRONTEND_ORIGIN + "/");
  if (scanText) url.searchParams.set("scan", scanText.slice(0, MAX_HANDOFF_CHARS));
  els.openLink.href = url.toString();
}

/** Browser pages (chrome://, new tab, file://): nothing to check or report (#26). */
function setWebActionsEnabled(enabled) {
  els.scanBtn.disabled = !enabled;
  els.reportBtn.disabled = !enabled;
  els.securityReportBtn.disabled = !enabled;
}

/** The facts behind the automatic check, in plain words - not just a label. */
function domainCheckText(result, state) {
  const parts = [];
  if (result.officialInstitution) parts.push(`Official ${result.officialInstitution} website — this address belongs to ${result.officialInstitution}.`);
  else parts.push(STATE_LABEL[state]);
  if (result.reportCount > 0) parts.push(`Reported by FraudLens users ${result.reportCount} time${result.reportCount === 1 ? "" : "s"}.`);
  if (typeof result.domainAgeDays === "number" && result.domainAgeDays < 365) {
    parts.push(`Domain registered ${result.domainAgeDays} day${result.domainAgeDays === 1 ? "" : "s"} ago.`);
  }
  return parts.join(" ");
}

async function renderTabStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isWebUrl(tab.url)) {
    els.hostname.textContent = tab ? "Browser page" : "No active tab";
    domainState = "neutral";
    setStatePill("neutral");
    els.stateText.textContent = describeFailure({ errorKind: "not_web_page" }).message;
    renderSignals([]);
    setWebActionsEnabled(false);
    updateOpenLink("");
    return;
  }

  currentHostname = safeHostnameFromUrl(tab.url);
  els.hostname.textContent = currentHostname || "—";
  setWebActionsEnabled(true);
  // e.g. localhost or a bare IP: scannable, but not something to report.
  els.reportBtn.disabled = !isReportableHost(currentHostname);

  // The background checks on demand if nothing is stored yet, so this never
  // ends at "reload the page".
  const result = await chrome.runtime.sendMessage({ type: "GET_TAB_STATUS", tabId: tab.id });

  if (!result || result.notWebPage) {
    domainState = "neutral";
    setStatePill("neutral");
    els.stateText.textContent = STATE_LABEL.neutral;
    renderSignals([]);
    updateOpenLink("");
    return;
  }

  if (result.hostname) {
    currentHostname = result.hostname;
    els.hostname.textContent = result.hostname;
  }

  if (result.error) {
    const { state, message } = describeFailure(result);
    domainState = state;
    setStatePill(state);
    els.stateText.textContent = message;
    renderSignals([]);
    updateOpenLink("");
    return;
  }

  domainState = stateFromCheckUrl(result);
  setStatePill(domainState);
  els.stateText.textContent = domainCheckText(result, domainState);
  renderSignals(result.signals);
  updateOpenLink("");
}

function safeHostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function paragraph(text, className = "state-text") {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function renderScanResult(data) {
  const { analysis, extracted, state, hostname } = data;
  els.scanSection.hidden = false;
  els.scanResult.innerHTML = "";

  els.scanResult.appendChild(
    paragraph(`Verdict: ${analysis.verdict.toUpperCase()}${typeof analysis.riskScore === "number" ? ` (risk score ${analysis.riskScore}/100)` : ""}`)
  );

  // Only a registry institution, never a free-text guess such as a page
  // heading, and never "(reported 0x)" (#30).
  const identity = claimedIdentityLine(analysis);
  if (identity) els.scanResult.appendChild(paragraph(identity));

  if (analysis.explanation) els.scanResult.appendChild(paragraph(analysis.explanation));

  const signalsUl = document.createElement("ul");
  signalsUl.className = "signals-list";
  const rank = { high: 3, medium: 2, low: 1 };
  const sorted = [...(analysis.signals ?? [])].filter((s) => s.scored !== false).sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0));
  for (const signal of sorted.slice(0, 5)) {
    const li = document.createElement("li");
    li.className = "signal-item";
    li.dataset.severity = signal.severity || "low";
    const type = document.createElement("div");
    type.className = "signal-type";
    type.textContent = (signal.type || "signal").replace(/_/g, " ");
    const desc = document.createElement("div");
    desc.className = "signal-desc";
    desc.textContent = signal.description || "";
    li.append(type, desc);
    signalsUl.appendChild(li);
  }
  els.scanResult.appendChild(signalsUl);

  if (extracted?.truncated) {
    els.scanResult.appendChild(paragraph(`Page text was truncated to ${extracted.text.length} characters before analysis.`, "empty-note"));
  }

  const shown = worseState(domainState, state);
  setStatePill(shown);
  els.stateText.textContent =
    shown === state ? `${STATE_LABEL[state]} (from full-page scan)` : `${STATE_LABEL[shown]} (from the automatic domain check — the page text itself looked ${state === "safe" ? "clean" : state})`;
  els.hostname.textContent = hostname;
  lastScanText = extracted?.text ?? "";
  updateOpenLink(lastScanText);
  renderRecent();
}

// A/B read as "no major passive findings", C as "worth a look", D/F as
// "several notable findings" — reuses the existing safe/suspicious/high-risk
// state-pill styling (styles.css) rather than inventing a parallel palette.
const GRADE_STATE = { A: "safe", B: "safe", C: "suspicious", D: "high-risk", F: "high-risk" };
const SEVERITY_RANK = { high: 4, medium: 3, low: 2, info: 1 };

function renderSecurityReport(report) {
  els.securitySection.hidden = false;
  const state = GRADE_STATE[report.grade] ?? "unreachable";
  els.securityGrade.dataset.state = state;
  els.securityGradeText.textContent = `Grade ${report.grade}`;
  els.securitySummary.textContent =
    report.grade === "N/A"
      ? "Site could not be reached for a security check."
      : `${report.findings.length} finding(s)${typeof report.score === "number" ? ` · score ${report.score}/100` : ""}`;

  els.securityFindingsList.innerHTML = "";
  if (report.findings.length === 0) {
    els.securityFindingsEmpty.hidden = false;
    return;
  }
  els.securityFindingsEmpty.hidden = true;

  const sorted = [...report.findings].sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));
  for (const finding of sorted.slice(0, POPUP_MAX_SECURITY_FINDINGS)) {
    const li = document.createElement("li");
    li.className = "signal-item";
    li.dataset.severity = finding.severity || "info";

    const type = document.createElement("div");
    type.className = "signal-type";
    type.textContent = `${finding.category || "finding"} · ${finding.severity || "info"}`;

    const title = document.createElement("div");
    title.className = "signal-desc";
    title.style.fontWeight = "600";
    title.textContent = finding.title || "";

    const desc = document.createElement("div");
    desc.className = "signal-desc";
    desc.textContent = finding.description || "";

    li.append(type, title, desc);
    els.securityFindingsList.appendChild(li);
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function onSecurityReportClick() {
  els.securityReportBtn.disabled = true;
  setStatus("Running passive security report — checking headers, TLS, cookies, exposed paths…");

  const tab = await activeTab();
  if (!tab) {
    setStatus("No active tab to scan.", "error");
    els.securityReportBtn.disabled = false;
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: "RUN_SECURITY_REPORT", tabId: tab.id });
  els.securityReportBtn.disabled = false;

  if (!response?.ok) {
    setStatus(describeFailure(response).message, "error");
    return;
  }

  setStatus("");
  renderSecurityReport(response.data.report);
  lastReportId = response.data.reportId ?? null;
  if (els.openReportBtn) {
    els.openReportBtn.hidden = !lastReportId;
    const extra = response.data.report.findings.length - POPUP_MAX_SECURITY_FINDINGS;
    const label = els.openReportBtn.firstElementChild;
    if (label) label.textContent = extra > 0 ? `Open full report (+${extra} more)` : "Open full report";
  }
  renderRecent();
}

// A failed scan is a different fact from a scan that ran and found nothing,
// so it must never read as "Safe" - but it also must not overwrite what the
// automatic domain check already established (#1: a red "High risk" turned
// grey). So a failure only ever touches the scan section and the status
// line; the pill and headline keep describing the domain check.
function renderScanFailure(response) {
  const { message } = describeFailure(response);
  els.scanSection.hidden = false;
  els.scanResult.innerHTML = "";
  els.scanResult.appendChild(paragraph(`Scan incomplete. ${message}`));
  setStatus(message, "error");
}

async function onScanClick() {
  els.scanBtn.disabled = true;
  setStatus("Scanning visible page text…");

  const tab = await activeTab();
  if (!tab) {
    setStatus("No active tab to scan.", "error");
    els.scanBtn.disabled = false;
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: "SCAN_ACTIVE_TAB", tabId: tab.id });
  els.scanBtn.disabled = false;

  if (!response?.ok) {
    renderScanFailure(response);
    return;
  }

  setStatus("");
  renderScanResult(response.data);
}

async function onReportClick() {
  if (!isReportableHost(currentHostname)) return;
  els.reportBtn.disabled = true;
  setStatus(`Reporting ${currentHostname}…`);

  const response = await chrome.runtime.sendMessage({ type: "REPORT_SENDER", sender: currentHostname });
  els.reportBtn.disabled = false;

  if (!response?.ok) {
    setStatus(describeFailure(response).message, "error");
    return;
  }

  const n = response.data.reportCount;
  setStatus(`Reported. ${currentHostname} has now been reported ${n} time${n === 1 ? "" : "s"}. Thank you — reports help warn other people.`, "success");
}

async function renderRecent() {
  const list = await getRecentChecks();
  els.recentList.innerHTML = "";
  if (list.length === 0) {
    els.recentEmpty.hidden = false;
    return;
  }
  els.recentEmpty.hidden = true;
  for (const entry of list.slice(0, 10)) {
    const li = document.createElement("li");
    li.className = "recent-item";
    li.dataset.state = entry.state || "neutral";
    const dot = document.createElement("span");
    dot.className = "dot";
    const domain = document.createElement("span");
    domain.className = "domain";
    domain.textContent = entry.domain || "—";
    const when = document.createElement("span");
    when.textContent = timeAgo(entry.at);
    li.append(dot, domain, when);
    els.recentList.appendChild(li);
  }
}

function timeAgo(at) {
  if (typeof at !== "number") return "";
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

els.scanBtn.addEventListener("click", onScanClick);
els.reportBtn.addEventListener("click", onReportClick);
els.securityReportBtn.addEventListener("click", onSecurityReportClick);
els.openReportBtn?.addEventListener("click", () => {
  if (!lastReportId) return;
  chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?id=${encodeURIComponent(lastReportId)}`) });
});

renderTabStatus();
renderRecent();
