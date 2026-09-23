// Rendered by chrome.windows.create when a context-menu action
// (fraudlens-check-selection / fraudlens-check-link, background.js) has a
// result ready. Reads the one-shot result background.js wrote to
// chrome.storage.local under "fraudlens.contextResult" — never receives raw
// page content itself, only the already-computed backend response.

import { FRONTEND_ORIGIN, MAX_HANDOFF_CHARS } from "./config.js";
import { stateFromAnalyze, stateFromCheckUrl, STATE_LABEL, describeFailure } from "./state.js";
import { claimedIdentityLine } from "./policy.js";

const els = {
  inputLabel: document.getElementById("input-label"),
  statePill: document.getElementById("state-pill"),
  statePillText: document.getElementById("state-pill-text"),
  stateText: document.getElementById("state-text"),
  signalsList: document.getElementById("signals-list"),
  signalsEmpty: document.getElementById("signals-empty"),
  openLink: document.getElementById("open-fraudlens-link"),
};

function setStatePill(state) {
  els.statePill.dataset.state = state;
  els.statePillText.textContent = state === "high-risk" ? "High risk" : state.charAt(0).toUpperCase() + state.slice(1);
}

function renderSignals(signals) {
  els.signalsList.innerHTML = "";
  const list = Array.isArray(signals) ? signals : [];
  if (list.length === 0) {
    els.signalsEmpty.hidden = false;
    return;
  }
  els.signalsEmpty.hidden = true;
  const rank = { high: 3, medium: 2, low: 1 };
  const sorted = [...list].sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0));
  for (const signal of sorted) {
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

// The web app pre-fills its check screen from ?scan= (see popup.js).
function updateOpenLink(scanText) {
  const url = new URL(FRONTEND_ORIGIN + "/app");
  if (scanText) url.searchParams.set("scan", scanText.slice(0, MAX_HANDOFF_CHARS));
  els.openLink.href = url.toString();
}

async function render() {
  const { "fraudlens.contextResult": entry } = await chrome.storage.local.get("fraudlens.contextResult");

  if (!entry) {
    els.inputLabel.textContent = "No result available.";
    setStatePill("neutral");
    els.stateText.textContent = "Right-click selected text or a link, then choose a FraudLens option.";
    renderSignals([]);
    updateOpenLink("");
    return;
  }

  els.inputLabel.textContent = entry.inputLabel || "—";

  // #27: background.js opens this window before the answer arrives, so
  // there is always something on screen straight away.
  if (entry.pending) {
    setStatePill("neutral");
    els.statePillText.textContent = "Checking…";
    els.stateText.textContent = entry.type === "check-url" ? "Checking this link with FraudLens…" : "Analysing the selected text with FraudLens…";
    els.signalsList.innerHTML = "";
    els.signalsEmpty.hidden = true;
    updateOpenLink("");
    return;
  }

  // #27: say what actually happened - a rate limit is not an outage.
  if (entry.error) {
    const { state, message } = describeFailure(entry);
    setStatePill(state);
    els.stateText.textContent = message;
    renderSignals([]);
    updateOpenLink("");
    return;
  }

  if (entry.type === "analyze") {
    const state = stateFromAnalyze(entry.result);
    setStatePill(state);
    const parts = [STATE_LABEL[state]];
    if (entry.result?.verdict) parts.unshift(`Verdict: ${entry.result.verdict.toUpperCase()}.`);
    const identity = claimedIdentityLine(entry.result);
    if (identity) parts.push(identity);
    els.stateText.textContent = parts.join(" ");
    renderSignals(entry.result?.signals);
    updateOpenLink(entry.handoffText || "");
    return;
  }

  if (entry.type === "check-url") {
    const state = stateFromCheckUrl(entry.result);
    setStatePill(state);
    els.stateText.textContent = STATE_LABEL[state];
    renderSignals(entry.result?.signals);
    updateOpenLink("");
  }
}

render();

// Re-render when background.js replaces the pending entry with the answer.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes["fraudlens.contextResult"]) render();
});
