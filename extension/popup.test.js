// UI-state regression test for the popup's "Strongest evidence" /
// "Page scan result" contradiction (see docs bug report): the automatic
// per-tab domain check and the explicit "Scan This Page" content scan are
// two different, differently-scoped backend calls, and the popup must never
// let one go stale under a label that reads as a verdict on the other.
//
// No DOM/testing dependency exists for the extension yet (see README's
// "Manual verification checklist"), so this is a small hand-rolled fake DOM
// covering exactly the element/API surface popup.js touches (getElementById,
// createElement, textContent/className/dataset/style/hidden/disabled,
// appendChild/append, innerHTML = "" to clear) - enough to run the real
// popup.js unmodified and inspect what it rendered, without pulling in a
// full jsdom dependency for a handful of elements and no event bubbling.

import { test } from "node:test";
import assert from "node:assert/strict";

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this._text = "";
    this._hidden = false;
    this.disabled = false;
    this.href = "";
    this.className = "";
    this._listeners = {};
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent).join("");
  }
  set innerHTML(v) {
    // Only ever set to "" by popup.js, to clear a list before re-rendering.
    if (v === "") this.children = [];
  }
  get hidden() {
    return this._hidden;
  }
  set hidden(v) {
    this._hidden = Boolean(v);
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  append(...kids) {
    for (const k of kids) this.appendChild(k);
  }
  addEventListener(type, handler) {
    (this._listeners[type] ??= []).push(handler);
  }
  async click() {
    for (const h of this._listeners.click ?? []) await h();
  }
}

const ELEMENT_IDS = [
  "hostname", "state-pill", "state-pill-text", "state-text",
  "signals-list", "signals-empty",
  "scan-page-btn", "report-btn", "security-report-btn", "open-fraudlens-link", "action-status",
  "scan-result-section", "scan-result",
  "recent-list", "recent-empty",
  "security-report-section", "security-grade", "security-grade-text", "security-summary",
  "security-findings-list", "security-findings-empty",
];

// popup.js only ever toggles `.hidden` on these two - the text itself is
// static markup in popup.html (see that file), so the fake DOM has to start
// with the same copy or a passing assertion here wouldn't mean anything
// about what a real popup shows.
const STATIC_TEXT = {
  "signals-empty": "No flagged signals from the automatic domain check.",
  "security-findings-empty": "No findings — nothing to flag passively.",
};

// Sections/notes popup.html marks `hidden` by default (before any JS runs).
const HIDDEN_BY_DEFAULT = ["signals-empty", "scan-result-section", "security-report-section", "security-findings-empty", "recent-empty"];

function installFakeDom() {
  const byId = new Map(ELEMENT_IDS.map((id) => [id, new FakeElement("div")]));
  for (const [id, text] of Object.entries(STATIC_TEXT)) byId.get(id)._text = text;
  for (const id of HIDDEN_BY_DEFAULT) byId.get(id)._hidden = true;
  global.document = {
    getElementById: (id) => byId.get(id) ?? null,
    createElement: (tag) => new FakeElement(tag),
  };
  return byId;
}

function installChromeMock({ tabStatus = null, tabUrl = "https://example.com/", onMessage } = {}) {
  const calls = [];
  global.chrome = {
    tabs: {
      query: async () => [{ id: 1, url: tabUrl }],
    },
    runtime: {
      sendMessage: async (message) => {
        calls.push(message);
        if (message.type === "GET_TAB_STATUS") return tabStatus;
        return onMessage ? onMessage(message) : null;
      },
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
    },
  };
  return calls;
}

async function flush() {
  // renderTabStatus/onScanClick chain several awaits (tabs.query ->
  // sendMessage -> render); a few microtask turns is enough to settle them
  // without a brittle real timer.
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

const SIGNAL = { code: "URL-08", type: "suspicious_link", severity: "high", description: "Asks you to log in through an unofficial link" };

test("popup: initial load shows the automatic domain check, correctly scoped, no findings", async () => {
  const els = installFakeDom();
  installChromeMock({ tabStatus: { hostname: "example.com", flagged: false, signals: [] } });
  await import(`./popup.js?t=${Date.now()}-a`);
  await flush();

  assert.equal(els.get("hostname").textContent, "example.com");
  assert.equal(els.get("signals-empty").hidden, false);
  assert.match(els.get("signals-empty").textContent, /automatic domain check/i);
  assert.equal(els.get("scan-result-section").hidden, true);
});

test("popup: Scan This Page finding a signal never contradicts the automatic domain check section", async () => {
  const els = installFakeDom();
  installChromeMock({
    tabStatus: { hostname: "example.com", flagged: false, signals: [] },
    onMessage: (m) =>
      m.type === "SCAN_ACTIVE_TAB"
        ? {
            ok: true,
            data: {
              analysis: { verdict: "scam", signals: [SIGNAL] },
              extracted: { text: "page text", truncated: false },
              state: "high-risk",
              hostname: "example.com",
            },
          }
        : null,
  });
  await import(`./popup.js?t=${Date.now()}-b`);
  await flush();

  // Before the scan: automatic check found nothing.
  assert.equal(els.get("signals-empty").hidden, false);

  await els.get("scan-page-btn").click();
  await flush();

  // Page scan result shows the finding.
  assert.equal(els.get("scan-result-section").hidden, false);
  assert.match(els.get("scan-result").textContent, /Asks you to log in/);
  assert.match(els.get("state-text").textContent, /full-page scan/);

  // The automatic domain check section is untouched by the scan - it still
  // accurately describes ONLY the automatic check (still empty, still
  // labelled as such), so it can never be read as "no risk on this page"
  // contradicting the scan result right below it.
  assert.equal(els.get("signals-empty").hidden, false);
  assert.match(els.get("signals-empty").textContent, /automatic domain check/i);
  assert.equal(els.get("signals-list").children.length, 0);
});

test("popup: a failed/empty extraction is reported as incomplete in the scan section, never as a verdict", async () => {
  const els = installFakeDom();
  installChromeMock({
    tabStatus: { hostname: "example.com", flagged: false, signals: [] },
    onMessage: (m) => (m.type === "SCAN_ACTIVE_TAB" ? { ok: false, errorKind: "no_text", error: "no readable text" } : null),
  });
  await import(`./popup.js?t=${Date.now()}-d`);
  await flush();

  await els.get("scan-page-btn").click();
  await flush();

  assert.equal(els.get("scan-result-section").hidden, false);
  assert.match(els.get("scan-result").textContent, /Scan incomplete/);
  assert.match(els.get("scan-result").textContent, /no readable text/i);
  // Never the "Verdict: SAFE" copy a completed clean scan renders.
  assert.doesNotMatch(els.get("scan-result").textContent, /Verdict:/);
  // The headline still describes the automatic domain check, labelled as such.
  assert.doesNotMatch(els.get("state-text").textContent, /full-page scan/);
});

test("popup #1: a failed scan leaves a red domain warning red (pill and headline untouched)", async () => {
  const els = installFakeDom();
  installChromeMock({
    tabUrl: "https://mcb-secure-verify.top/login",
    tabStatus: { hostname: "mcb-secure-verify.top", flagged: true, signals: [{ code: "URL-02", type: "lookalike_url", severity: "high", description: "brand token" }] },
    onMessage: (m) => (m.type === "SCAN_ACTIVE_TAB" ? { ok: false, errorKind: "rate_limited", error: "too many analyze requests" } : null),
  });
  await import(`./popup.js?t=${Date.now()}-e`);
  await flush();
  const headline = els.get("state-text").textContent;
  assert.equal(els.get("state-pill").dataset.state, "high-risk");

  await els.get("scan-page-btn").click();
  await flush();

  assert.equal(els.get("state-pill").dataset.state, "high-risk");
  assert.equal(els.get("state-text").textContent, headline);
  // The failure says what actually happened - not "could not read this page".
  assert.match(els.get("action-status").textContent, /too many checks/i);
  assert.doesNotMatch(els.get("action-status").textContent, /could not read/i);
});

test("popup: a clean page scan never downgrades a red domain warning to Safe", async () => {
  const els = installFakeDom();
  installChromeMock({
    tabUrl: "https://mcb-secure-verify.top/login",
    tabStatus: { hostname: "mcb-secure-verify.top", flagged: true, signals: [{ code: "URL-02", type: "lookalike_url", severity: "high", description: "brand token" }] },
    onMessage: (m) =>
      m.type === "SCAN_ACTIVE_TAB"
        ? { ok: true, data: { analysis: { verdict: "safe", signals: [] }, extracted: { text: "hi", truncated: false }, state: "safe", hostname: "mcb-secure-verify.top" } }
        : null,
  });
  await import(`./popup.js?t=${Date.now()}-f`);
  await flush();
  await els.get("scan-page-btn").click();
  await flush();
  assert.equal(els.get("state-pill").dataset.state, "high-risk");
  assert.match(els.get("state-text").textContent, /automatic domain check/);
});

test("popup #26: on a browser page the actions are disabled and it never says \"reload the page\"", async () => {
  const els = installFakeDom();
  installChromeMock({ tabUrl: "chrome://newtab/", tabStatus: { notWebPage: true } });
  await import(`./popup.js?t=${Date.now()}-g`);
  await flush();
  assert.equal(els.get("report-btn").disabled, true);
  assert.equal(els.get("scan-page-btn").disabled, true);
  assert.equal(els.get("security-report-btn").disabled, true);
  assert.doesNotMatch(els.get("state-text").textContent, /reload/i);
});

test("popup #30: the claimed identity comes from the registry and never shows \"(reported 0x)\"", async () => {
  const els = installFakeDom();
  installChromeMock({
    tabStatus: { hostname: "example.com", flagged: false, signals: [] },
    onMessage: (m) =>
      m.type === "SCAN_ACTIVE_TAB"
        ? { ok: true, data: { analysis: { verdict: "scam", sender: "Messages I received", senderReports: 0, signals: [{ ...SIGNAL, claimedIdentity: "MCB" }] }, extracted: { text: "x", truncated: false }, state: "high-risk", hostname: "example.com" } }
        : null,
  });
  await import(`./popup.js?t=${Date.now()}-h`);
  await flush();
  await els.get("scan-page-btn").click();
  await flush();
  const text = els.get("scan-result").textContent;
  assert.match(text, /Claims to be: MCB/);
  assert.doesNotMatch(text, /Messages I received|reported 0/);
});

test("popup: the domain check explains itself - official site, reports, new domain", async () => {
  const els = installFakeDom();
  installChromeMock({ tabUrl: "https://internet.mcb.mu/", tabStatus: { hostname: "internet.mcb.mu", flagged: false, signals: [], officialInstitution: "MCB" } });
  await import(`./popup.js?t=${Date.now()}-i`);
  await flush();
  assert.match(els.get("state-text").textContent, /Official MCB website/);

  const els2 = installFakeDom();
  installChromeMock({ tabUrl: "https://new-shop.top/", tabStatus: { hostname: "new-shop.top", flagged: true, signals: [{ code: "URL-09", severity: "medium", description: "new" }], reportCount: 4, domainAgeDays: 3 } });
  await import(`./popup.js?t=${Date.now()}-j`);
  await flush();
  assert.match(els2.get("state-text").textContent, /Reported by FraudLens users 4 times/);
  assert.match(els2.get("state-text").textContent, /registered 3 days ago/);
});

test("popup: Scan This Page running clean does not fabricate a finding in the domain-check section", async () => {
  const els = installFakeDom();
  installChromeMock({
    tabStatus: { hostname: "example.com", flagged: false, signals: [] },
    onMessage: (m) =>
      m.type === "SCAN_ACTIVE_TAB"
        ? {
            ok: true,
            data: {
              analysis: { verdict: "safe", signals: [] },
              extracted: { text: "page text", truncated: false },
              state: "safe",
              hostname: "example.com",
            },
          }
        : null,
  });
  await import(`./popup.js?t=${Date.now()}-c`);
  await flush();

  await els.get("scan-page-btn").click();
  await flush();

  assert.equal(els.get("scan-result-section").hidden, false);
  assert.match(els.get("scan-result").textContent, /Verdict: SAFE/);
  assert.equal(els.get("signals-empty").hidden, false);
  assert.equal(els.get("signals-list").children.length, 0);
});
