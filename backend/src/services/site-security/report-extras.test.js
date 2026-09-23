// Summary aggregation and remediation text for the Security Report
// (summary.js, recommendations.js), plus the newer client-side signals.

import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeReport, AREAS } from "./summary.js";
import { recommendationFor, withRecommendations } from "./recommendations.js";
import { mapClientSignals } from "./client-signals.js";

const F = (category, severity, title = "x") => ({ category, severity, title, description: "" });

test("summary counts severities and ranks categories by points lost", () => {
  const s = summarizeReport([F("headers", "medium", "Missing Content-Security-Policy"), F("headers", "low", "Missing X-Content-Type-Options"), F("tls", "high", "TLS certificate has expired"), F("policy", "info", "No security.txt")], { reachable: true, clientSignals: true });
  assert.deepEqual(s.severityCounts, { high: 1, medium: 1, low: 1, info: 1 });
  assert.equal(s.categories[0].category, "tls");
  assert.equal(s.categories[0].points, 25);
  assert.equal(s.categories.find((c) => c.category === "headers").points, 14);
});

test("summary area scores: clean, issues, and not_checked", () => {
  const s = summarizeReport([F("headers", "medium"), F("third-party", "info")], { reachable: true, clientSignals: false });
  const byId = Object.fromEntries(s.areas.map((a) => [a.id, a]));
  assert.equal(byId.headers.status, "issues");
  assert.equal(byId.headers.score, 90);
  assert.equal(byId.cookies.status, "clean");
  assert.equal(byId.cookies.score, 100);
  assert.equal(byId["page-code"].status, "not_checked");
  assert.equal(byId["page-code"].score, null);
  assert.equal(s.areas.length, AREAS.length);
});

test("summary: client areas are still judged when the server couldn't reach the site", () => {
  const s = summarizeReport([F("network", "info")], { reachable: false, clientSignals: true });
  const byId = Object.fromEntries(s.areas.map((a) => [a.id, a]));
  assert.equal(byId.transport.status, "not_checked");
  assert.equal(byId["page-code"].status, "clean");
});

test("every finding the checks can emit that costs points has a recommendation", () => {
  for (const title of ["Missing Content-Security-Policy", "Page can be framed by any site", 'Cookie "sid" missing Secure flag', "Exposed .env file", "Password field on an unencrypted page", "Vulnerable library: jquery 1.8.0"]) {
    assert.ok(recommendationFor({ title }), title);
  }
  assert.equal(recommendationFor({ title: "something unknown" }), null);
});

test("withRecommendations never mutates its input", () => {
  const input = [F("headers", "medium", "Missing Content-Security-Policy")];
  const out = withRecommendations(input);
  assert.equal(input[0].recommendation, undefined);
  assert.match(out[0].recommendation, /Content-Security-Policy/);
});

test("client signals: third-party scripts without SRI, and a password field over HTTP", () => {
  const f = mapClientSignals({
    scriptsWithoutIntegrity: [{ src: "https://cdn.example/a.js", host: "cdn.example" }],
    passwordFields: 1,
    pageProtocol: "http:",
  });
  assert.ok(f.some((x) => x.category === "sri" && x.severity === "low"));
  assert.ok(f.some((x) => x.category === "credentials" && x.severity === "high"));
  // The same password field on HTTPS is fine.
  assert.ok(!mapClientSignals({ passwordFields: 1, pageProtocol: "https:" }).some((x) => x.category === "credentials"));
});

