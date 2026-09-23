import { MAX_ANALYZE_CHARS } from "./config.js";
import { checkUrl, analyzeText, reportSender, analyzeSite } from "./api.js";
import { addRecentCheck } from "./history.js";
import { stateFromCheckUrl, stateFromAnalyze, BADGE_STYLE } from "./state.js";
import { detectVulnerableLibraries } from "./vendor/retire-js-scan.js";

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
    analysis = await analyzeText(extracted.text, undefined, extracted.pageUrl);
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

// ---------- Security Report (passive site-security scan) ----------
//
// Orchestrates two page-context injections plus the backend call, mirroring
// scanActiveTab()'s shape above:
//   1. collect-signals.js (isolated world, default) — DOM/text extraction,
//      same-origin script fetches, all passive (see that file's header).
//   2. fraudlensObserveApiSurface (MAIN world, func injection) — the one
//      signal that needs the page's real fetch/XMLHttpRequest, so it can't
//      run in the isolated world collect-signals.js uses. Self-contained on
//      purpose: chrome.scripting.executeScript serializes `func` via
//      toString() and re-evaluates it in the target context, so it cannot
//      close over anything from this file.
// Retire.js matching itself happens here, not in either injected script —
// it's pure computation over already-collected data, no page access
// needed, so it runs in this file's normal ES-module context instead of
// being duplicated/inlined into a page-injected script.

const API_SURFACE_WINDOW_MS = 1500;

// MUST be self-contained — see comment above. Records fetch()/XHR calls the
// page itself makes during the observation window only (calls already made
// before the scan started, e.g. the page's initial load, are not visible —
// see extension/README.md's Security Report limitations). Never replays or
// modifies any call; the original fetch/XHR still runs unchanged.
function fraudlensObserveApiSurface(windowMs) {
  return new Promise((resolve) => {
    const entries = [];
    const isSameOrigin = (url) => {
      try {
        return new URL(url, location.href).origin === location.origin;
      } catch {
        return true;
      }
    };

    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : input?.url;
        const method = (init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
        if (url && entries.length < 50) entries.push({ url, method, sameOrigin: isSameOrigin(url) });
      } catch {
        /* best-effort observation only, never block the real call */
      }
      return originalFetch.apply(this, arguments);
    };

    const originalOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        if (url && entries.length < 50) entries.push({ url: String(url), method: String(method || "GET").toUpperCase(), sameOrigin: isSameOrigin(url) });
      } catch {
        /* best-effort observation only, never block the real call */
      }
      return originalOpen.call(this, method, url, ...rest);
    };

    setTimeout(() => {
      window.fetch = originalFetch;
      window.XMLHttpRequest.prototype.open = originalOpen;
      resolve(entries);
    }, windowMs);
  });
}

async function runSecurityReport(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    return { ok: false, error: "This page can't be scanned (not an http(s) page)." };
  }

  let rawSignals;
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId }, files: ["collect-signals.js"] });
    rawSignals = results?.[0]?.result;
  } catch (err) {
    return { ok: false, error: `Could not read this page: ${err.message}` };
  }
  if (!rawSignals) return { ok: false, error: "No signals could be collected from this page." };

  let apiSurface = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fraudlensObserveApiSurface,
      args: [API_SURFACE_WINDOW_MS],
    });
    apiSurface = results?.[0]?.result ?? [];
  } catch {
    // MAIN-world injection can fail on a handful of restricted pages (chrome://, the Web Store, etc.) - the rest of the report still stands without it.
  }

  const vulnerableLibraries = detectVulnerableLibraries(rawSignals.scriptsForRetire ?? []);
  const clientSignals = {
    domSinks: rawSignals.domSinks,
    reflectedParams: rawSignals.reflectedParams,
    mixedContent: rawSignals.mixedContent,
    insecureForms: rawSignals.insecureForms,
    vulnerableLibraries,
    thirdPartyScripts: rawSignals.thirdPartyScripts,
    apiSurface,
  };

  let report;
  try {
    report = await analyzeSite(tab.url, clientSignals);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  addRecentCheck({
    domain: safeHostname(tab.url) || tab.url,
    at: Date.now(),
    state: report.grade === "A" || report.grade === "B" ? "safe" : report.grade === "F" || report.grade === "D" ? "high-risk" : "suspicious",
    kind: "security-report",
    summary: `grade ${report.grade}`,
  });

  return { ok: true, data: { report, hostname: safeHostname(tab.url) || tab.url } };
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

  if (message?.type === "RUN_SECURITY_REPORT") {
    runSecurityReport(message.tabId).then(sendResponse);
    return true; // async response
  }

  return false;
});
