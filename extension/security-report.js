// Security Report orchestration (passive site-security scan), extracted from
// background.js so it can be unit-tested with injected fakes
// (security-report.test.js) instead of only by hand in a real browser.
//
// Flow, for one "Security Report" click:
//   1. collect-signals.js (isolated world, default) - DOM/text extraction,
//      same-origin script fetches, all passive (see that file's header).
//   2. fraudlensObserveApiSurface (MAIN world, func injection) - the one
//      signal that needs the page's real fetch/XMLHttpRequest, so it can't
//      run in the isolated world collect-signals.js uses.
//   3. Retire.js matching over the collected scripts (pure computation, so
//      it runs here rather than being inlined into a page-injected script).
//   4. POST /api/analyze-site - the backend runs every server-side check and
//      scores the whole report. Detection and scoring live there, never here.
//   5. The report is saved to chrome.storage.session so report.html (the
//      full-screen view) can open it by id.
//
// A failure in step 1 or 2 is never fatal: every server-side check runs from
// the URL alone, so the report degrades to "server checks only" and the
// backend adds a coverage note saying what was skipped and why.

export const API_SURFACE_WINDOW_MS = 1500;
const REPORTS_KEY = "fraudlens.securityReports.v1";
const MAX_STORED_REPORTS = 5;

// MUST be self-contained: chrome.scripting.executeScript serializes `func`
// via toString() and re-evaluates it in the page, so it cannot close over
// anything in this module. Records fetch()/XHR calls the page itself makes
// during the observation window only (calls from the initial page load are
// not visible). Never replays or modifies any call; the original fetch/XHR
// still runs unchanged.
export function fraudlensObserveApiSurface(windowMs) {
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

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Session storage: reports disappear when the browser closes, and aren't
// written to disk the way storage.local is. Falls back to local only on a
// browser too old to have storage.session.
function reportStore(chromeApi) {
  return chromeApi.storage.session ?? chromeApi.storage.local;
}

export async function saveReport(chromeApi, entry) {
  const store = reportStore(chromeApi);
  const { [REPORTS_KEY]: existing } = await store.get(REPORTS_KEY);
  const list = Array.isArray(existing) ? existing : [];
  const next = [entry, ...list.filter((r) => r.id !== entry.id)].slice(0, MAX_STORED_REPORTS);
  await store.set({ [REPORTS_KEY]: next });
}

/** @returns {Promise<object|null>} the stored report entry with this id, or the latest one when id is omitted */
export async function loadReport(chromeApi, id) {
  const { [REPORTS_KEY]: list } = await reportStore(chromeApi).get(REPORTS_KEY);
  if (!Array.isArray(list) || list.length === 0) return null;
  return id ? list.find((r) => r.id === id) ?? null : list[0];
}

function stateForGrade(grade) {
  if (grade === "A" || grade === "B") return "safe";
  if (grade === "D" || grade === "F") return "high-risk";
  if (grade === "C") return "suspicious";
  return "unreachable";
}

async function collectPageSignals(chromeApi, tabId) {
  try {
    const results = await chromeApi.scripting.executeScript({ target: { tabId }, files: ["collect-signals.js"] });
    const value = results?.[0]?.result;
    if (value?.error) return { rawSignals: null, error: value.error };
    if (value) return { rawSignals: value, error: null };
    return { rawSignals: null, error: "collector returned no result" };
  } catch (err) {
    return { rawSignals: null, error: err?.message || String(err) };
  }
}

async function observeApiSurface(chromeApi, tabId) {
  try {
    const results = await chromeApi.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fraudlensObserveApiSurface,
      args: [API_SURFACE_WINDOW_MS],
    });
    return Array.isArray(results?.[0]?.result) ? results[0].result : [];
  } catch {
    // MAIN-world injection fails on a few restricted pages - the report stands without it.
    return [];
  }
}

/**
 * @param {number} tabId
 * @param {{ chromeApi?: object, analyzeSite: Function, detectVulnerableLibraries: Function, addRecentCheck?: Function,
 *   libraryDataFetchedAt?: string, now?: () => number, makeId?: () => string }} deps
 * @returns {Promise<{ ok: true, data: { report: object, hostname: string, reportId: string } } | { ok: false, error: string }>}
 */
export async function runSecurityReport(tabId, deps) {
  const {
    chromeApi = globalThis.chrome,
    analyzeSite,
    detectVulnerableLibraries,
    addRecentCheck = async () => {},
    libraryDataFetchedAt,
    now = Date.now,
    makeId = () => crypto.randomUUID(),
  } = deps;

  const tab = await chromeApi.tabs.get(tabId).catch(() => null);
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    return { ok: false, error: "This page can't be scanned (not an http(s) page)." };
  }

  const { rawSignals, error: collectionError } = await collectPageSignals(chromeApi, tabId);
  const apiSurface = await observeApiSurface(chromeApi, tabId);

  // Only what was actually collected is sent - never properties read off a
  // failed (null) collection.
  const clientSignals = rawSignals
    ? {
        domSinks: rawSignals.domSinks,
        reflectedParams: rawSignals.reflectedParams,
        mixedContent: rawSignals.mixedContent,
        insecureForms: rawSignals.insecureForms,
        vulnerableLibraries: detectVulnerableLibraries(rawSignals.scriptsForRetire ?? []),
        thirdPartyScripts: rawSignals.thirdPartyScripts,
        scriptsWithoutIntegrity: rawSignals.scriptsWithoutIntegrity,
        passwordFields: rawSignals.passwordFields,
        pageProtocol: rawSignals.pageProtocol,
        apiSurface,
        libraryDataFetchedAt,
      }
    : null;

  let report;
  try {
    report = await analyzeSite(tab.url, clientSignals, collectionError ?? undefined);
  } catch (err) {
    // errorKind lets the popup say "can't reach FraudLens" / "too many checks" precisely.
    return { ok: false, error: err?.message || String(err), errorKind: err?.kind ?? "unreachable" };
  }

  const hostname = safeHostname(tab.url) || tab.url;
  const reportId = makeId();
  try {
    await saveReport(chromeApi, { id: reportId, savedAt: now(), hostname, report });
  } catch {
    // Not being able to store it only disables "Open full report"; the popup still shows it.
  }

  await addRecentCheck({ domain: hostname, at: now(), state: stateForGrade(report.grade), kind: "security-report", summary: `grade ${report.grade}` });

  return { ok: true, data: { report, hostname, reportId } };
}
