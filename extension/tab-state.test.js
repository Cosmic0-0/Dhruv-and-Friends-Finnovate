// tab-state.js (QA findings #22 and #23) and policy.js (#21, #26, #30).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTabState, cacheKeyFor, URL_CACHE_TTL_MS, LIMITED_TTL_MS } from "./tab-state.js";
import { strongDeterministicSignal, isReportableHost, claimedIdentityLine } from "./policy.js";

function fakeStorage() {
  const data = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
    set: async (obj) => Object.assign(data, structuredClone(obj)),
    remove: async (key) => void delete data[key],
  };
}

function setup({ result = { flagged: false, signals: [] }, fail = null } = {}) {
  let clock = 1_000_000;
  const calls = [];
  const storage = fakeStorage();
  const checkUrl = async (url) => {
    calls.push(url);
    if (fail) throw fail;
    return { url, ...result };
  };
  const tabs = createTabState({ storage, checkUrl, now: () => clock });
  return { tabs, calls, storage, advance: (ms) => (clock += ms) };
}

test("#23: switching between already-checked tabs makes no new backend calls", async () => {
  const { tabs, calls } = setup();
  const sites = ["https://a.example/", "https://b.example/x", "https://c.example/"];
  for (const [i, url] of sites.entries()) await tabs.ensureChecked(i + 1, url);
  assert.equal(calls.length, 3);
  for (let n = 0; n < 60; n++) await tabs.ensureChecked((n % 3) + 1, sites[n % 3]);
  assert.equal(calls.length, 3, "60 tab switches must not re-check");
});

test("#23: the same URL in another tab, or after a #fragment change, reuses the result", async () => {
  const { tabs, calls } = setup();
  await tabs.ensureChecked(1, "https://a.example/page#top");
  await tabs.ensureChecked(2, "https://a.example/page#bottom");
  assert.equal(calls.length, 1);
  assert.equal(cacheKeyFor("https://a.example/page#x"), "https://a.example/page");
});

test("#23: concurrent checks of one URL share a single request", async () => {
  const { tabs, calls } = setup();
  await Promise.all([tabs.ensureChecked(1, "https://a.example/"), tabs.ensureChecked(2, "https://a.example/")]);
  assert.equal(calls.length, 1);
});

test("results expire and are re-checked after the cache TTL", async () => {
  const { tabs, calls, advance } = setup();
  await tabs.ensureChecked(1, "https://a.example/");
  advance(URL_CACHE_TTL_MS + 1);
  await tabs.ensureChecked(1, "https://a.example/");
  assert.equal(calls.length, 2);
});

test("#22: results live in session storage, so a restarted worker still has them", async () => {
  const { storage, calls } = setup();
  const first = createTabState({ storage, checkUrl: async (url) => (calls.push(url), { url, flagged: true, signals: [{ severity: "high" }] }) });
  await first.ensureChecked(7, "https://mcb-secure-verify.top/login");
  // A brand-new instance = the service worker woke up again with empty memory.
  const second = createTabState({ storage, checkUrl: async () => assert.fail("must not re-check") });
  const entry = await second.getTab(7);
  assert.equal(entry.flagged, true);
  assert.equal(entry.hostname, "mcb-secure-verify.top");
  assert.equal(entry.url, "https://mcb-secure-verify.top/login", "the cache key, not overwritten by the response");
});

test("#23: a rate-limit failure is remembered briefly and reported as rate_limited, not unreachable", async () => {
  const err = Object.assign(new Error("too many check-url requests"), { kind: "rate_limited" });
  const { tabs, calls, advance } = setup({ fail: err });
  const { entry } = await tabs.ensureChecked(1, "https://a.example/");
  assert.equal(entry.errorKind, "rate_limited");
  await tabs.ensureChecked(2, "https://a.example/");
  assert.equal(calls.length, 1, "no retry storm while limited");
  advance(LIMITED_TTL_MS + 1);
  await tabs.ensureChecked(1, "https://a.example/");
  assert.equal(calls.length, 2, "retries once the pause is over");
});

test("non-web URLs are never checked and clear the tab's stored result", async () => {
  const { tabs, calls } = setup();
  await tabs.ensureChecked(1, "https://a.example/");
  const { entry } = await tabs.ensureChecked(1, "chrome://newtab/");
  assert.equal(entry, null);
  assert.equal(await tabs.getTab(1), null);
  assert.equal(calls.length, 1);
});

// ---- policy.js ----

const sig = (sourceType, severity, extra = {}) => ({ code: "X", sourceType, severity, description: "d", ...extra });

test("#21: no banner on a page the analysis called safe, whatever the signals", () => {
  assert.equal(strongDeterministicSignal({ signals: [sig("rule", "high")] }, "safe"), null);
});

test("#21: word-list and AI signals never raise the banner; rule and threat-list signals do", () => {
  assert.equal(strongDeterministicSignal({ signals: [sig("lexicon", "high"), sig("semantic_model", "high")] }, "high-risk"), null);
  assert.equal(strongDeterministicSignal({ signals: [sig("rule", "high")] }, "high-risk").sourceType, "rule");
  assert.equal(strongDeterministicSignal({ signals: [sig("intel", "high")] }, "suspicious").sourceType, "intel");
  assert.equal(strongDeterministicSignal({ signals: [sig("rule", "low")] }, "high-risk"), null);
  // A merged, unscored duplicate doesn't count.
  assert.equal(strongDeterministicSignal({ signals: [sig("rule", "high", { scored: false })] }, "high-risk"), null);
});

test("#26: only real website hostnames can be reported", () => {
  for (const h of ["newtab", "extensions", "", null, "localhost", "file", "has space.com"]) assert.equal(isReportableHost(h), false, String(h));
  for (const h of ["mcb-secure-verify.top", "www.example.co.uk", "xn--mb-hmc.mu"]) assert.equal(isReportableHost(h), true, h);
});

test("#30: claimed identity only from the registry, report count only when positive", () => {
  assert.equal(claimedIdentityLine({ sender: "Messages I received", senderReports: 0, signals: [] }), null);
  assert.equal(claimedIdentityLine({ scamProfile: { claimedIdentity: "MCB" }, senderReports: 0 }), "Claims to be: MCB");
  assert.equal(claimedIdentityLine({ signals: [{ claimedIdentity: "SBM" }], senderReports: 2 }), "Claims to be: SBM (sender reported 2 times)");
});
