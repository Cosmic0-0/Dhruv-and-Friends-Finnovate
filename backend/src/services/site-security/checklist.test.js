import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, checkIdForFinding, CHECK_IDS } from "./checklist.js";
import { checkSecurityHeaders, checkFraming, checkCors, checkDisclosure, checkSecurityTxt, checkCookies, scanForErrorSignatures } from "./checks.js";
import { mapClientSignals } from "./client-signals.js";

const h = (obj) => new Headers(obj);

// Findings produced by the REAL check functions over deliberately bad inputs,
// plus the titles from index.js/checks.js paths that need network fixtures.
async function everyFindingTitle() {
  const cookieHeaders = new Headers();
  cookieHeaders.append("set-cookie", "session=1");
  const findings = [
    ...checkSecurityHeaders(h({}), "https:"),
    ...checkSecurityHeaders(h({ "content-security-policy-report-only": "default-src 'self'" }), "https:"),
    ...checkSecurityHeaders(h({ "content-security-policy": "script-src 'unsafe-inline' 'unsafe-eval' *", "strict-transport-security": "max-age=100", "x-content-type-options": "yes", "referrer-policy": "unsafe-url" }), "https:"),
    ...checkSecurityHeaders(h({ "content-security-policy": "img-src 'self'", "strict-transport-security": "max-age=31536000" }), "https:"),
    ...checkFraming(h({})),
    ...checkFraming(h({ "content-security-policy": "frame-ancestors *" })),
    ...checkFraming(h({ "x-frame-options": "ALLOW-FROM https://x" })),
    ...checkFraming(h({ "x-frame-options": "weird" })),
    ...checkCors(h({ "access-control-allow-origin": "null" })),
    ...checkCors(h({ "access-control-allow-origin": "*", "access-control-allow-credentials": "true" })),
    ...checkCors(h({ "access-control-allow-origin": "*" })),
    ...checkDisclosure(h({ server: "Apache/2.4.1" })),
    ...(await checkSecurityTxt("https://x.example/", async () => ({ status: 404, body: "" }))),
    ...checkCookies(cookieHeaders, "https:"),
    ...scanForErrorSignatures("Warning: mysqli_query(): SQL syntax error near MySQL"),
    ...mapClientSignals({
      domSinks: ["eval", "new Function", "setTimeout(string)", "setInterval(string)", "innerHTML", "outerHTML", "document.write", "insertAdjacentHTML", "dangerouslySetInnerHTML", "inlineEventHandler"].map((sink) => ({ sink, count: 1 })),
      reflectedParams: [{ param: "q" }],
      mixedContent: [{ url: "http://x/a.js" }],
      insecureForms: [{ action: "http://x/f", httpAction: true }, { action: "https://y/f", crossOrigin: true }],
      vulnerableLibraries: [{ name: "jquery", version: "1.8.0", vulnerabilities: [{ severity: "medium" }] }],
      scriptsWithoutIntegrity: [{ src: "https://cdn/x.js", host: "cdn" }],
      passwordFields: 1,
      pageProtocol: "http:",
      thirdPartyScripts: [{ src: "https://cdn/x.js", host: "cdn" }],
      apiSurface: [{ url: "/api", sameOrigin: true }],
    }),
  ];
  const fromNetworkPaths = [
    "Site is not served over HTTPS", "HTTP does not redirect to HTTPS", "Plain HTTP is also served without a redirect",
    "Could not establish a TLS connection", "TLS certificate is not trusted", "TLS certificate has expired", "TLS certificate expires soon",
    "Outdated TLS protocol (TLSv1.1)", "Exposed .git repository", "Exposed .env file", "phpMyAdmin reachable", "Admin path reachable",
    "WordPress admin path reachable", "Source map exposed",
  ];
  return [...new Set([...findings.map((f) => f.title), ...fromNetworkPaths])];
}

test("every finding the checks can emit belongs to exactly one checklist entry", async () => {
  const titles = await everyFindingTitle();
  assert.ok(titles.length > 40, `expected broad coverage, got ${titles.length}`);
  for (const title of titles) assert.ok(checkIdForFinding({ title }), `no checklist entry claims: ${title}`);
});

test("check ids are unique", () => {
  assert.equal(new Set(CHECK_IDS).size, CHECK_IDS.length);
});

const F = (title, severity) => ({ title, severity, category: "x", description: "" });

test("statuses: fail for costly findings, warn for info-only, pass when clean - most pressing first", () => {
  const rows = buildChecklist(
    [F("Exposed .env file", "high"), F("Missing Content-Security-Policy", "medium"), F("No security.txt", "info")],
    { reachable: true, https: true, clientSignals: true }
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId["exposed-env"].status, "fail");
  assert.equal(byId["exposed-env"].severity, "high");
  assert.equal(byId["security-txt"].status, "warn");
  assert.equal(byId["exposed-git"].status, "pass");
  assert.equal(rows[0].id, "exposed-env", "high failures come first");
  assert.equal(rows[1].id, "csp");
  const order = rows.map((r) => r.status);
  const rank = ["fail", "warn", "pass", "info", "not_run"];
  assert.deepEqual(order, [...order].sort((a, b) => rank.indexOf(a) - rank.indexOf(b)));
});

test("a check that couldn't run is not_run with a reason - never a pass", () => {
  const rows = buildChecklist([F("Missing Content-Security-Policy", "medium")], { reachable: true, https: false, clientSignals: false });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId["tls-trust"].status, "not_run");
  assert.match(byId["tls-trust"].reason, /HTTPS/);
  assert.equal(byId["csp-inline"].status, "not_run", "no CSP -> its directive checks can't run");
  assert.equal(byId["vulnerable-libraries"].status, "not_run");
  assert.match(byId["vulnerable-libraries"].reason, /couldn't read/);
  assert.equal(rows.at(-1).status, "not_run", "not-run checks go last");
});

test("an unreachable site marks every server-side check not_run", () => {
  const rows = buildChecklist([], { reachable: false, https: false, clientSignals: true });
  for (const r of rows.filter((r) => !["page-code", "content", "third-party", "identity"].includes(r.area))) assert.equal(r.status, "not_run", r.id);
  assert.ok(rows.some((r) => r.area === "page-code" && r.status === "pass"));
});

test("the API-calls inventory is informational: never shown as a pass, with or without calls", () => {
  const coverage = { reachable: true, https: true, clientSignals: true };
  const none = buildChecklist([], coverage).find((c) => c.id === "api-calls");
  assert.equal(none.status, "info");
  assert.match(none.reason, /no API calls/i);

  const some = buildChecklist([{ title: "3 API call(s) observed", severity: "info" }], coverage).find((c) => c.id === "api-calls");
  assert.equal(some.status, "info");
  assert.deepEqual(some.findings, ["3 API call(s) observed"]);

  const unread = buildChecklist([], { ...coverage, clientSignals: false }).find((c) => c.id === "api-calls");
  assert.equal(unread.status, "not_run");
});
