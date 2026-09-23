import { test } from "node:test";
import assert from "node:assert/strict";
import { mapClientSignals } from "./client-signals.js";

test("mapClientSignals returns nothing for missing/malformed input", () => {
  assert.deepEqual(mapClientSignals(undefined), []);
  assert.deepEqual(mapClientSignals(null), []);
  assert.deepEqual(mapClientSignals("not an object"), []);
  assert.deepEqual(mapClientSignals({}), []);
});

test("mapClientSignals grades eval/new Function sinks as high, innerHTML-style sinks as medium", () => {
  const findings = mapClientSignals({
    domSinks: [
      { sink: "eval", count: 2 },
      { sink: "innerHTML", count: 5 },
      { sink: "inlineEventHandler", count: 1 },
    ],
  });
  assert.equal(findings.length, 3);
  assert.equal(findings.find((f) => f.evidence === "eval").severity, "high");
  assert.equal(findings.find((f) => f.evidence === "innerHTML").severity, "medium");
  assert.equal(findings.find((f) => f.evidence === "inlineEventHandler").severity, "low");
  assert.ok(findings[0].description.includes("2x"));
});

test("mapClientSignals reports reflected URL parameters as high severity", () => {
  const findings = mapClientSignals({ reflectedParams: [{ param: "q", value: "<img onerror=x>" }] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.equal(findings[0].category, "client-dom");
});

test("mapClientSignals aggregates mixed content into one finding, not one per resource", () => {
  const findings = mapClientSignals({
    mixedContent: [{ url: "http://a.example/1.js" }, { url: "http://a.example/2.js" }, { url: "http://a.example/3.js" }],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.ok(findings[0].description.startsWith("3 resource(s)"));
});

test("mapClientSignals distinguishes HTTP-action forms (medium) from cross-origin forms (low)", () => {
  const findings = mapClientSignals({
    insecureForms: [
      { action: "http://a.example/submit", httpAction: true },
      { action: "https://other.example/submit", crossOrigin: true },
    ],
  });
  assert.equal(findings.length, 2);
  assert.equal(findings.find((f) => f.evidence.startsWith("http://")).severity, "medium");
  assert.equal(findings.find((f) => f.evidence.startsWith("https://")).severity, "low");
});

test("mapClientSignals grades vulnerable libraries by their worst matched vulnerability severity", () => {
  const findings = mapClientSignals({
    vulnerableLibraries: [
      { name: "jquery", version: "1.7.2", vulnerabilities: [{ severity: "high", info: "XSS in jQuery <1.9" }] },
      { name: "lodash", version: "4.17.4", vulnerabilities: [{ severity: "low", info: "minor issue" }] },
    ],
  });
  assert.equal(findings.length, 2);
  assert.equal(findings.find((f) => f.title.includes("jquery")).severity, "high");
  assert.equal(findings.find((f) => f.title.includes("lodash")).severity, "low");
});

test("mapClientSignals reports third-party scripts and API surface as info-only, observational findings", () => {
  const findings = mapClientSignals({
    thirdPartyScripts: [{ src: "https://cdn.example/a.js", host: "cdn.example" }],
    apiSurface: [
      { url: "/api/x", method: "GET", sameOrigin: true },
      { url: "https://other.example/y", method: "POST", sameOrigin: false },
    ],
  });
  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.severity === "info"));
  const apiFinding = findings.find((f) => f.category === "api-surface");
  assert.ok(apiFinding.description.includes("1 same-origin and 1 third-party"));
});

test("mapClientSignals caps array inputs so an oversized payload can't blow up the report", () => {
  const domSinks = Array.from({ length: 100 }, () => ({ sink: "innerHTML" }));
  const findings = mapClientSignals({ domSinks });
  assert.equal(findings.length, 25);
});
