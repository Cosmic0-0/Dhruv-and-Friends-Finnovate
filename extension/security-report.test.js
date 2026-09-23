// Unit tests for security-report.js#runSecurityReport - the orchestration
// that used to live untested in background.js. The earlier "No signals could
// be collected" bug (one failed page-side injection failing the whole
// report) is the first regression case here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runSecurityReport, loadReport, fraudlensObserveApiSurface } from "./security-report.js";

function fakeStorageArea() {
  const data = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (obj) => Object.assign(data, obj),
  };
}

/**
 * @param {{ url?: string, collector?: (() => any), observer?: (() => any) }} opts
 *   collector/observer return the InjectionResult array, or throw
 */
function fakeChrome({ url = "https://shop.example/checkout", collector, observer } = {}) {
  const injections = [];
  return {
    injections,
    tabs: { get: async () => ({ id: 1, url }) },
    storage: { session: fakeStorageArea(), local: fakeStorageArea() },
    scripting: {
      executeScript: async (details) => {
        injections.push(details);
        const handler = details.files ? collector : observer;
        return handler ? handler() : [{ result: undefined }];
      },
    },
  };
}

const RAW_SIGNALS = {
  domSinks: [{ sink: "eval", count: 1 }],
  reflectedParams: [],
  mixedContent: [],
  insecureForms: [],
  thirdPartyScripts: [{ src: "https://cdn.example/a.js", host: "cdn.example" }],
  scriptsWithoutIntegrity: [{ src: "https://cdn.example/a.js", host: "cdn.example" }],
  passwordFields: 1,
  pageProtocol: "https:",
  scriptsForRetire: [{ src: "https://cdn.example/jquery-1.8.0.min.js", text: "" }],
};

const REPORT = { grade: "B", score: 80, findings: [], summary: {}, coverage: {} };

function deps(overrides = {}) {
  const calls = { analyzeSite: [], recent: [] };
  return {
    calls,
    deps: {
      analyzeSite: async (...args) => {
        calls.analyzeSite.push(args);
        return REPORT;
      },
      detectVulnerableLibraries: (scripts) => (scripts.length ? [{ name: "jquery", version: "1.8.0", vulnerabilities: [] }] : []),
      addRecentCheck: async (entry) => calls.recent.push(entry),
      libraryDataFetchedAt: "2026-09-23",
      now: () => 1000,
      makeId: () => "report-1",
      ...overrides,
    },
  };
}

test("non-http(s) tabs are refused before anything is injected", async () => {
  const chromeApi = fakeChrome({ url: "chrome://settings" });
  const { deps: d, calls } = deps();
  const res = await runSecurityReport(1, { ...d, chromeApi });
  assert.equal(res.ok, false);
  assert.equal(chromeApi.injections.length, 0);
  assert.equal(calls.analyzeSite.length, 0);
});

test("REGRESSION: a collector that returns nothing still produces a server-side report, with the reason passed on", async () => {
  const chromeApi = fakeChrome({ collector: () => [{ result: undefined }] });
  const { deps: d, calls } = deps();
  const res = await runSecurityReport(1, { ...d, chromeApi });

  assert.equal(res.ok, true);
  const [url, clientSignals, collectionError] = calls.analyzeSite[0];
  assert.equal(url, "https://shop.example/checkout");
  assert.equal(clientSignals, null);
  assert.equal(collectionError, "collector returned no result");
});

test("a collector that reports its own error, or an injection that throws, degrades the same way", async () => {
  for (const collector of [() => [{ result: { error: "boom" } }], () => { throw new Error("Cannot access contents of the page"); }]) {
    const chromeApi = fakeChrome({ collector });
    const { deps: d, calls } = deps();
    const res = await runSecurityReport(1, { ...d, chromeApi });
    assert.equal(res.ok, true);
    assert.equal(calls.analyzeSite[0][1], null);
    assert.ok(calls.analyzeSite[0][2]);
  }
});

test("a successful collection sends every signal, the library matches, the API surface and the dataset date", async () => {
  const chromeApi = fakeChrome({
    collector: () => [{ result: RAW_SIGNALS }],
    observer: () => [{ result: [{ url: "/api/cart", method: "GET", sameOrigin: true }] }],
  });
  const { deps: d, calls } = deps();
  await runSecurityReport(1, { ...d, chromeApi });

  const [, clientSignals, collectionError] = calls.analyzeSite[0];
  assert.equal(collectionError, undefined);
  assert.deepEqual(clientSignals.vulnerableLibraries, [{ name: "jquery", version: "1.8.0", vulnerabilities: [] }]);
  assert.equal(clientSignals.passwordFields, 1);
  assert.equal(clientSignals.scriptsWithoutIntegrity.length, 1);
  assert.equal(clientSignals.apiSurface.length, 1);
  assert.equal(clientSignals.libraryDataFetchedAt, "2026-09-23");
  // The MAIN-world observer is injected as a function, in the MAIN world.
  const mainWorld = chromeApi.injections.find((i) => i.world === "MAIN");
  assert.equal(mainWorld.func, fraudlensObserveApiSurface);
});

test("a failing MAIN-world observer never blocks the report", async () => {
  const chromeApi = fakeChrome({ collector: () => [{ result: RAW_SIGNALS }], observer: () => { throw new Error("restricted page"); } });
  const { deps: d, calls } = deps();
  const res = await runSecurityReport(1, { ...d, chromeApi });
  assert.equal(res.ok, true);
  assert.deepEqual(calls.analyzeSite[0][1].apiSurface, []);
});

test("a backend failure is reported as an error, not a report", async () => {
  const chromeApi = fakeChrome({ collector: () => [{ result: RAW_SIGNALS }] });
  const { deps: d } = deps({ analyzeSite: async () => { throw Object.assign(new Error("too many security-report requests"), { kind: "rate_limited" }); } });
  const res = await runSecurityReport(1, { ...d, chromeApi });
  assert.deepEqual(res, { ok: false, error: "too many security-report requests", errorKind: "rate_limited" });
});

test("the report is saved for the full-screen view and recorded in recent checks", async () => {
  const chromeApi = fakeChrome({ collector: () => [{ result: RAW_SIGNALS }] });
  const { deps: d, calls } = deps();
  const res = await runSecurityReport(1, { ...d, chromeApi });

  assert.equal(res.data.reportId, "report-1");
  const stored = await loadReport(chromeApi, "report-1");
  assert.equal(stored.hostname, "shop.example");
  assert.equal(stored.report.grade, "B");
  assert.equal((await loadReport(chromeApi)).id, "report-1", "no id loads the latest report");
  // Session storage, never local, for report contents.
  assert.equal(Object.keys(chromeApi.storage.local.data).length, 0);
  assert.equal(calls.recent[0].state, "safe");
});
