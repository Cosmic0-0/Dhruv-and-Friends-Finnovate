import { API_BASE_URL } from "./config.js";

// Per-tab cache of the last check-url result, keyed by tabId. Cleared when
// the tab navigates again or closes. The popup reads from this instead of
// re-checking on open, so opening the popup never triggers a second call.
const tabResults = new Map();

async function checkTab(tabId, url) {
  tabResults.delete(tabId);
  chrome.action.setBadgeText({ tabId, text: "" });

  if (!url || !/^https?:\/\//i.test(url)) return;

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/check-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`backend returned ${res.status}`);
    const data = await res.json();
    tabResults.set(tabId, { hostname, ...data });

    if (data.flagged) {
      chrome.action.setBadgeText({ tabId, text: "!" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#b3261e" });
    }
  } catch (err) {
    // Fail open: an unreachable backend never blocks browsing or implies a
    // verdict it didn't produce. The popup surfaces the error instead of a
    // false "safe" or "flagged" state.
    tabResults.set(tabId, { hostname, error: err.message });
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_TAB_STATUS") {
    sendResponse(tabResults.get(message.tabId) ?? null);
  }
});
