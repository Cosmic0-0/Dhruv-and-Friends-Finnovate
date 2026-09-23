import { MAX_ANALYZE_CHARS } from "./config.js";
import { checkUrl, analyzeText, reportSender, analyzeSite } from "./api.js";
import { addRecentCheck } from "./history.js";
import { stateFromCheckUrl, stateFromAnalyze, BADGE_STYLE, failureOf } from "./state.js";
import { detectVulnerableLibraries } from "./vendor/retire-js-scan.js";
import { RETIRE_JS_DATASET_META } from "./vendor/retire-js-dataset.js";
import { runSecurityReport as runSecurityReportWith } from "./security-report.js";
import { createTabState, isWebUrl } from "./tab-state.js";
import { strongDeterministicSignal, isReportableHost } from "./policy.js";

// Per-tab results + per-URL cache live in chrome.storage.session (see
// tab-state.js): they survive this worker being stopped (#22), and a URL
// already checked in the last 10 minutes is never re-checked (#23).
const tabs = createTabState({ storage: chrome.storage.session, checkUrl });

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function setBadge(tabId, state) {
  const style = BADGE_STYLE[state] ?? BADGE_STYLE.neutral;
  chrome.action.setBadgeText({ tabId, text: style.text }).catch(() => {});
  if (style.text) chrome.action.setBadgeBackgroundColor({ tabId, color: style.color }).catch(() => {});
}

async function checkTab(tabId, url) {
  if (!isWebUrl(url)) {
    await tabs.removeTab(tabId);
    setBadge(tabId, "neutral");
    return null;
  }
  const { entry } = await tabs.ensureChecked(tabId, url);
  setBadge(tabId, stateFromCheckUrl(entry));
  return entry;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) checkTab(tabId, tab.url).catch(() => {});
});

// Switching back to a tab re-uses its stored result (no network call unless
// the result has expired) - this was one link check per switch before (#23).
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab?.url) checkTab(tabId, tab.url).catch(() => {});
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.removeTab(tabId).catch(() => {});
});

// ---------- 14D: "Scan This Page" (explicit user action only) ----------
//
// content.js is injected here (not registered in manifest.json), so nothing
// runs on a page until the user clicks the button. Every failure carries an
// errorKind so the popup can say what actually went wrong.
async function scanActiveTab(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!isWebUrl(tab?.url)) return { ok: false, errorKind: "not_web_page", error: "not a web page" };

  let injectionResults;
  try {
    injectionResults = await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (err) {
    return { ok: false, errorKind: "page_unreadable", error: err.message };
  }

  const extracted = injectionResults?.[0]?.result;
  if (!extracted?.text) return { ok: false, errorKind: "no_text", error: "no readable text" };

  let analysis;
  try {
    analysis = await analyzeText(extracted.text, undefined, extracted.pageUrl, extracted.pageForms);
  } catch (err) {
    return { ok: false, ...failureOf(err), extracted };
  }

  const state = stateFromAnalyze(analysis);
  const hostname = safeHostname(tab.url) || "this page";
  addRecentCheck({ domain: hostname, at: Date.now(), state, kind: "scan-page", summary: analysis.verdict });

  // 14G: inline banner only for a strong DETERMINISTIC finding on a page
  // that isn't safe (#21) - see policy.js.
  const strong = strongDeterministicSignal(analysis, state);
  if (strong) {
    chrome.tabs
      .sendMessage(tabId, {
        type: "FRAUDLENS_SHOW_BANNER",
        payload: { headline: strong.description, detail: strong.domain ? `Detected domain: ${strong.domain}` : undefined, severity: state },
      })
      .catch(() => {
        /* content script may have been unloaded by navigation; banner is best-effort */
      });
  }

  return { ok: true, data: { analysis, extracted, state, hostname } };
}

// ---------- Security Report (passive site-security scan) ----------
// Orchestration lives in security-report.js (unit-tested there); this just
// supplies the real dependencies.

function runSecurityReport(tabId) {
  return runSecurityReportWith(tabId, {
    analyzeSite,
    detectVulnerableLibraries,
    addRecentCheck,
    libraryDataFetchedAt: RETIRE_JS_DATASET_META.fetchedAt,
  });
}

// ---------- 14E / 14F: context menu items ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "fraudlens-check-selection", title: "Check selected text with FraudLens", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "fraudlens-check-link", title: "Check link with FraudLens", contexts: ["link"] });
});

const CONTEXT_RESULT_KEY = "fraudlens.contextResult";

function openResultWindow() {
  chrome.windows.create({ url: chrome.runtime.getURL("result.html"), type: "popup", width: 400, height: 580 });
}

// #27: the result window opens immediately in a "Checking…" state, and
// result.js re-renders when this entry is replaced with the answer.
async function runContextCheck({ type, inputLabel, handoffText, run, recent }) {
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [CONTEXT_RESULT_KEY]: { id, type, inputLabel, pending: true, at: Date.now() } });
  openResultWindow();

  let result = null;
  let failure = null;
  try {
    result = await run();
  } catch (err) {
    failure = failureOf(err, "unreachable");
  }
  addRecentCheck(recent(result));
  // handoffText is a capped copy of the text just sent to /api/analyze, kept
  // only for result.html's "Open in FraudLens" link - never part of history.
  await chrome.storage.local.set({ [CONTEXT_RESULT_KEY]: { id, type, inputLabel, handoffText, result, ...(failure ?? {}), at: Date.now() } });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "fraudlens-check-selection") {
    const text = (info.selectionText || "").trim().slice(0, MAX_ANALYZE_CHARS);
    runContextCheck({
      type: "analyze",
      inputLabel: "Selected text",
      handoffText: text,
      run: async () => {
        if (!text) throw Object.assign(new Error("No text was selected."), { kind: "no_text" });
        return analyzeText(text);
      },
      recent: (result) => ({
        domain: (tab?.url && safeHostname(tab.url)) || "selected text",
        at: Date.now(),
        state: result ? stateFromAnalyze(result) : "unreachable",
        kind: "selection",
        summary: result?.verdict ?? "error",
      }),
    }).catch(() => {});
    return;
  }

  if (info.menuItemId === "fraudlens-check-link") {
    const url = info.linkUrl;
    runContextCheck({
      type: "check-url",
      inputLabel: url,
      run: () => checkUrl(url),
      recent: (result) => ({
        domain: safeHostname(url) || url || "link",
        at: Date.now(),
        state: result ? stateFromCheckUrl(result) : "unreachable",
        kind: "link",
        summary: result?.flagged ? "flagged" : result ? "no match" : "error",
      }),
    }).catch(() => {});
  }
});

// ---------- messages from popup.js / result.js ----------

// Only this extension's own pages (popup, result, report) may drive the
// background. Content scripts run inside web pages - a hostile page must
// never be able to trigger a report, a scan or a lookup through us.
function fromExtensionPage(sender) {
  return sender?.id === chrome.runtime.id && typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
}

async function tabStatus(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!isWebUrl(tab?.url)) return { notWebPage: true };
  // Checks on demand when nothing is stored yet (fresh install, a tab opened
  // before the extension loaded) - never "reload the page" (#26).
  return checkTab(tabId, tab.url);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!fromExtensionPage(sender)) return false;

  if (message?.type === "GET_TAB_STATUS") {
    tabStatus(message.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse(failureOf(err)));
    return true;
  }

  if (message?.type === "SCAN_ACTIVE_TAB") {
    scanActiveTab(message.tabId).then(sendResponse);
    return true;
  }

  if (message?.type === "REPORT_SENDER") {
    if (!isReportableHost(message.sender)) {
      sendResponse({ ok: false, errorKind: "not_web_page", error: "not a website" });
      return false;
    }
    reportSender(message.sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, ...failureOf(err) }));
    return true;
  }

  if (message?.type === "RUN_SECURITY_REPORT") {
    runSecurityReport(message.tabId).then(sendResponse);
    return true;
  }

  return false;
});
