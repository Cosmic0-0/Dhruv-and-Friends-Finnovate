import { MAX_ANALYZE_CHARS } from "./config.js";
import { checkUrl, analyzeText, reportSender } from "./api.js";
import { addRecentCheck } from "./history.js";
import { stateFromCheckUrl, stateFromAnalyze, BADGE_STYLE } from "./state.js";

// Per-tab cache of the last check-url result, keyed by tabId. Cleared when
// the tab navigates again or closes. The popup reads from this instead of
// re-checking on open, so opening the popup never triggers a second call.
// Preserved unchanged from the original implementation (14B).
const tabResults = new Map();

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function setBadge(tabId, state) {
  const style = BADGE_STYLE[state] ?? BADGE_STYLE.neutral;
  chrome.action.setBadgeText({ tabId, text: style.text });
  if (style.text) chrome.action.setBadgeBackgroundColor({ tabId, color: style.color });
}

async function checkTab(tabId, url) {
  tabResults.delete(tabId);
  setBadge(tabId, "neutral");

  if (!url || !/^https?:\/\//i.test(url)) return;

  const hostname = safeHostname(url);
  if (!hostname) return;

  try {
    const data = await checkUrl(url);
    tabResults.set(tabId, { hostname, ...data });
    setBadge(tabId, stateFromCheckUrl(data));
  } catch (err) {
    // Fail open: an unreachable backend never blocks browsing or implies a
    // verdict it didn't produce. The popup surfaces the error instead of a
    // false "safe" or "flagged" state (14B/14C).
    tabResults.set(tabId, { hostname, error: err.message });
    setBadge(tabId, "unreachable");
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) checkTab(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab?.url) checkTab(tabId, tab.url);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => tabResults.delete(tabId));

// ---------- 14D: "Scan This Page" (explicit user action only) ----------
//
// Triggered by a runtime message from popup.js after the user clicks the
// button. content.js is injected here (not registered in manifest.json), so
// nothing runs on a page until this exact moment — see content.js's header
// comment for why that satisfies "must not run automatically on every page
// load" while still being a real content script rather than an inline
// executeScript function.
async function scanActiveTab(tabId) {
  let injectionResults;
  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (err) {
    return { ok: false, error: `Could not read this page: ${err.message}` };
  }

  const extracted = injectionResults?.[0]?.result;
  if (!extracted || !extracted.text) {
    return { ok: false, error: "No readable text found on this page." };
  }

  let analysis;
  try {
    analysis = await analyzeText(extracted.text);
  } catch (err) {
    return { ok: false, error: err.message, extracted };
  }

  const state = stateFromAnalyze(analysis);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const hostname = (tab?.url && safeHostname(tab.url)) || "this page";

  addRecentCheck({
    domain: hostname,
    at: Date.now(),
    state,
    kind: "scan-page",
    summary: analysis.verdict,
  });

  // 14G: inline banner, ONLY for a strong DETERMINISTIC signal — identified
  // by signals[].source being one of the non-LLM checks ("identity_check",
  // "url_parser"), never for an LLM-only inference. Lower priority than
  // 14D/14E/14F; kept intentionally small and dismissible, never blocking.
  const strongSignal = (analysis.signals ?? []).find(
    (s) =>
      (s.source === "identity_check" || s.source === "url_parser") &&
      (s.severity === "high" || s.severity === "medium"),
  );
  if (strongSignal) {
    chrome.tabs
      .sendMessage(tabId, {
        type: "FRAUDLENS_SHOW_BANNER",
        payload: {
          headline: strongSignal.description,
          detail: strongSignal.domain ? `Detected domain: ${strongSignal.domain}` : undefined,
          severity: state,
        },
      })
      .catch(() => {
        /* content script may have been unloaded by navigation; banner is best-effort */
      });
  }

  return { ok: true, data: { analysis, extracted, state, hostname } };
}

// ---------- 14E / 14F: context menu items ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "fraudlens-check-selection",
    title: "Check selected text with FraudLens",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "fraudlens-check-link",
    title: "Check link with FraudLens",
    contexts: ["link"],
  });
});

function openResultWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL("result.html"),
    type: "popup",
    width: 400,
    height: 580,
  });
}

async function storeContextResult(entry) {
  await chrome.storage.local.set({ "fraudlens.contextResult": entry });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "fraudlens-check-selection") {
    const text = (info.selectionText || "").trim().slice(0, MAX_ANALYZE_CHARS);
    let result = null;
    let error = null;
    if (!text) {
      error = "No text was selected.";
    } else {
      try {
        result = await analyzeText(text);
      } catch (err) {
        error = err.message;
      }
    }
    const state = result ? stateFromAnalyze(result) : "unreachable";
    addRecentCheck({
      domain: (tab?.url && safeHostname(tab.url)) || "selected text",
      at: Date.now(),
      state,
      kind: "selection",
      summary: result?.verdict ?? "error",
    });
    // handoffText is a capped copy of the same text just sent to /api/analyze,
    // kept only so the "Open in FraudLens" link on result.html can prefill
    // something — it is NOT part of the rolling history (history.js never
    // stores text) and is overwritten by the next context-menu check.
    await storeContextResult({
      type: "analyze",
      inputLabel: "Selected text",
      handoffText: text,
      result,
      error,
      at: Date.now(),
    });
    openResultWindow();
    return;
  }

  if (info.menuItemId === "fraudlens-check-link") {
    const url = info.linkUrl;
    let result = null;
    let error = null;
    try {
      result = await checkUrl(url);
    } catch (err) {
      error = err.message;
    }
    const state = result ? stateFromCheckUrl(result) : "unreachable";
    addRecentCheck({
      domain: safeHostname(url) || url || "link",
      at: Date.now(),
      state,
      kind: "link",
      summary: result?.flagged ? "flagged" : result ? "no match" : "error",
    });
    await storeContextResult({ type: "check-url", inputLabel: url, result, error, at: Date.now() });
    openResultWindow();
  }
});

// ---------- messages from popup.js / result.js ----------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_TAB_STATUS") {
    sendResponse(tabResults.get(message.tabId) ?? null);
    return false;
  }

  if (message?.type === "SCAN_ACTIVE_TAB") {
    scanActiveTab(message.tabId).then(sendResponse);
    return true; // async response
  }

  if (message?.type === "REPORT_SENDER") {
    reportSender(message.sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  return false;
});
