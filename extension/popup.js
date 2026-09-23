import { FRONTEND_ORIGIN, MAX_HANDOFF_CHARS } from "./config.js";
import { getRecentChecks } from "./history.js";
import { stateFromCheckUrl, STATE_LABEL } from "./state.js";

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
};

let currentHostname = null;
let lastScanText = ""; // capped scan text, used only for the FraudLens handoff link

function setStatePill(state) {
  els.statePill.dataset.state = state;
  els.statePillText.textContent = state === "high-risk" ? "High risk" : capitalize(state);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

function updateOpenLink(scanText) {
  const url = new URL(FRONTEND_ORIGIN + "/");
  if (scanText) {
    // Known limitation (see README "Web app handoff"): the frontend's
    // /result page only reads its own sessionStorage
    // (frontend/lib/storage.ts loadResult()), which an external extension
    // origin cannot write into. Absent a shared handoff mechanism, this
    // passes a short, capped excerpt of the scanned text as a query param
    // instead — the frontend does not currently read this param, so today
    // this link just opens the FraudLens home page; a person can paste the
    // text themselves. Flagged to the frontend owner as a follow-up rather
    // than inventing new backend/frontend state from the extension side.
    url.searchParams.set("scan", scanText.slice(0, MAX_HANDOFF_CHARS));
  }
  els.openLink.href = url.toString();
}

async function renderTabStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    els.hostname.textContent = "No active tab";
    setStatePill("neutral");
    els.stateText.textContent = STATE_LABEL.neutral;
    renderSignals([]);
    updateOpenLink("");
    return;
  }

  const result = await chrome.runtime.sendMessage({ type: "GET_TAB_STATUS", tabId: tab.id });

  if (!result) {
    currentHostname = safeHostnameFromUrl(tab.url);
    els.hostname.textContent = currentHostname || "Not checked yet";
    setStatePill("neutral");
    els.stateText.textContent = "Not checked yet — reload the page.";
    renderSignals([]);
    updateOpenLink("");
    return;
  }

  currentHostname = result.hostname;
  els.hostname.textContent = result.hostname || "—";

  if (result.error) {
    setStatePill("unreachable");
    els.stateText.textContent = `Backend unreachable: ${result.error}. Browsing was not blocked.`;
    renderSignals([]);
    updateOpenLink("");
    return;
  }

  const state = stateFromCheckUrl(result);
  setStatePill(state);
  els.stateText.textContent = STATE_LABEL[state];
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

function renderScanResult(data) {
  const { analysis, extracted, state, hostname } = data;
  els.scanSection.hidden = false;
  els.scanResult.innerHTML = "";

  const verdictLine = document.createElement("p");
  verdictLine.className = "state-text";
  verdictLine.textContent = `Verdict: ${analysis.verdict.toUpperCase()}${
    typeof analysis.riskScore === "number" ? ` (risk score ${analysis.riskScore}/100)` : ""
  }`;
  els.scanResult.appendChild(verdictLine);

  if (analysis.sender) {
    const senderLine = document.createElement("p");
    senderLine.className = "state-text";
    senderLine.textContent = `Claimed identity: ${analysis.sender}${
      typeof analysis.senderReports === "number" ? ` (reported ${analysis.senderReports}x)` : ""
    }`;
    els.scanResult.appendChild(senderLine);
  }

  if (analysis.explanation) {
    const expl = document.createElement("p");
    expl.className = "state-text";
    expl.textContent = analysis.explanation;
    els.scanResult.appendChild(expl);
  }

  const signalsUl = document.createElement("ul");
  signalsUl.className = "signals-list";
  const rank = { high: 3, medium: 2, low: 1 };
  const sorted = [...(analysis.signals ?? [])].sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0));
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
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = `Page text was truncated to ${extracted.text.length} characters before analysis.`;
    els.scanResult.appendChild(note);
  }

  setStatePill(state);
  els.stateText.textContent = `${STATE_LABEL[state]} (from full-page scan)`;
  els.hostname.textContent = hostname;
  lastScanText = extracted?.text ?? "";
  updateOpenLink(lastScanText);
  renderRecent();
}

// A/B read as "no major passive findings", C as "worth a look", D/F as
// "several notable findings" — reuses the existing safe/suspicious/high-risk
// state-pill styling (styles.css) rather than inventing a parallel palette
// just for grades.
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
  for (const finding of sorted) {
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

async function onSecurityReportClick() {
  els.securityReportBtn.disabled = true;
  els.actionStatus.className = "status-msg";
  els.actionStatus.textContent = "Running passive security report — checking headers, TLS, cookies, exposed paths…";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    els.actionStatus.className = "status-msg error";
    els.actionStatus.textContent = "No active tab to scan.";
    els.securityReportBtn.disabled = false;
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: "RUN_SECURITY_REPORT", tabId: tab.id });
  els.securityReportBtn.disabled = false;

  if (!response?.ok) {
    els.actionStatus.className = "status-msg error";
    els.actionStatus.textContent = response?.error || "Security report failed.";
    return;
  }

  els.actionStatus.textContent = "";
  renderSecurityReport(response.data.report);
  renderRecent();
}

// A failed or empty extraction (see content.js) is a DIFFERENT fact from a
// scan that ran and found nothing - it must never render as "Safe". This is
// the only path that shows the scan-result section on a !response.ok scan;
// renderScanResult() (the "Safe" / findings path) is never reachable from a
// failure, by construction, not by a check someone could forget to add.
function renderScanInconclusive(reasonText) {
  els.scanSection.hidden = false;
  els.scanResult.innerHTML = "";
  const p = document.createElement("p");
  p.className = "state-text";
  p.textContent = reasonText || STATE_LABEL.inconclusive;
  els.scanResult.appendChild(p);

  setStatePill("inconclusive");
  els.stateText.textContent = `${STATE_LABEL.inconclusive} (from full-page scan)`;
}

async function onScanClick() {
  els.scanBtn.disabled = true;
  els.actionStatus.className = "status-msg";
  els.actionStatus.textContent = "Scanning visible page text…";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    els.actionStatus.className = "status-msg error";
    els.actionStatus.textContent = "No active tab to scan.";
    els.scanBtn.disabled = false;
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: "SCAN_ACTIVE_TAB", tabId: tab.id });
  els.scanBtn.disabled = false;

  if (!response?.ok) {
    els.actionStatus.className = "status-msg error";
    els.actionStatus.textContent = response?.error || "Scan failed.";
    renderScanInconclusive(response?.error);
    return;
  }

  els.actionStatus.textContent = "";
  renderScanResult(response.data);
}

async function onReportClick() {
  if (!currentHostname) return;
  els.reportBtn.disabled = true;
  els.actionStatus.className = "status-msg";
  els.actionStatus.textContent = `Reporting ${currentHostname}…`;

  const response = await chrome.runtime.sendMessage({ type: "REPORT_SENDER", sender: currentHostname });
  els.reportBtn.disabled = false;

  if (!response?.ok) {
    els.actionStatus.className = "status-msg error";
    els.actionStatus.textContent = response?.error || "Report failed.";
    return;
  }

  els.actionStatus.className = "status-msg success";
  els.actionStatus.textContent = `Reported. ${currentHostname} has been reported ${response.data.reportCount} time(s).`;
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

renderTabStatus();
renderRecent();
