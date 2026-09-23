// Fixture-based tests for analyzeSite() against 2-3 fixed "sites" — same
// convention as services/domain-age/index.test.js: mock fetch (and here,
// DNS + TLS too) rather than hitting real hosts, so this suite is
// deterministic and runs offline. A live run against a couple of real
// sites is part of the pre-demo manual checklist (extension/README.md),
// not this automated suite.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { analyzeSite } from "./index.js";
import { _internals as dnsInternals } from "./url-safety.js";
import { _internals as tlsInternals } from "./tls.js";

const originalFetch = globalThis.fetch;
const originalLookup = dnsInternals.lookup;
const originalConnect = tlsInternals.connect;

test.afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = originalFetch;
  dnsInternals.lookup = originalLookup;
  tlsInternals.connect = originalConnect;
});

function stubPublicDns() {
  dnsInternals.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
}

function stubTls({ protocol = "TLSv1.3", authorized = true, authorizationError, daysUntilExpiry = 90 } = {}) {
  tlsInternals.connect = () => {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    socket.getProtocol = () => protocol;
    socket.authorized = authorized;
    socket.authorizationError = authorizationError ? new Error(authorizationError) : undefined;
    socket.getPeerCertificate = () => ({
      valid_from: new Date(Date.now() - 30 * 86_400_000).toUTCString(),
      valid_to: new Date(Date.now() + daysUntilExpiry * 86_400_000).toUTCString(),
    });
    queueMicrotask(() => socket.emit("secureConnect"));
    return socket;
  };
}

/** Routes a fake fetch by exact href. Missing routes 404; an Error value simulates a network failure. */
function stubFetch(routes) {
  globalThis.fetch = async (input) => {
    const href = String(input);
    const entry = routes[href];
    if (entry === undefined) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    if (entry instanceof Error) throw entry;
    return entry();
  };
}

test("analyzeSite gives a well-secured site an A grade with no findings", async () => {
  stubPublicDns();
  stubTls({ protocol: "TLSv1.3", authorized: true, daysUntilExpiry: 120 });

  const cookieHeaders = new Headers({ "content-type": "text/html" });
  cookieHeaders.append("set-cookie", "session=abc123; Secure; HttpOnly; SameSite=Strict");

  stubFetch({
    "https://good.example/": () =>
      new Response("<html><body>All good here.</body></html>", {
        status: 200,
        headers: {
          ...Object.fromEntries(cookieHeaders),
          "content-security-policy": "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
          "strict-transport-security": "max-age=63072000; includeSubDomains",
          "x-frame-options": "DENY",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=()",
          "cross-origin-opener-policy": "same-origin",
        },
      }),
    "https://good.example/.well-known/security.txt": () =>
      new Response("Contact: mailto:security@good.example\nExpires: 2027-01-01T00:00:00Z\n", { status: 200, headers: { "content-type": "text/plain" } }),
    "https://good.example/.git/HEAD": () => new Response("not found", { status: 404 }),
    "https://good.example/.env": () => new Response("not found", { status: 404 }),
    "https://good.example/phpmyadmin/": () => new Response("not found", { status: 404 }),
    "https://good.example/admin/": () => new Response("not found", { status: 404 }),
    "https://good.example/wp-admin/": () => new Response("not found", { status: 404 }),
    "http://good.example/": () => new Response(null, { status: 301, headers: { location: "https://good.example/" } }),
  });

  const report = await analyzeSite("https://good.example/");

  assert.equal(report.grade, "A");
  assert.deepEqual(report.findings, []);
});

test("analyzeSite flags missing security headers and unflagged cookies with a lower grade", async () => {
  stubPublicDns();
  stubTls({ protocol: "TLSv1.2", authorized: true, daysUntilExpiry: 90 });

  const cookieHeaders = new Headers({ "content-type": "text/html" });
  cookieHeaders.append("set-cookie", "id=xyz");

  stubFetch({
    "https://weak.example/": () =>
      new Response("<html><body>Hello.</body></html>", { status: 200, headers: Object.fromEntries(cookieHeaders) }),
    "https://weak.example/.git/HEAD": () => new Response("not found", { status: 404 }),
    "https://weak.example/.env": () => new Response("not found", { status: 404 }),
    "https://weak.example/phpmyadmin/": () => new Response("not found", { status: 404 }),
    "https://weak.example/admin/": () => new Response("not found", { status: 404 }),
    "https://weak.example/wp-admin/": () => new Response("not found", { status: 404 }),
    // Also answers on plain HTTP instead of redirecting - a separate finding.
    "http://weak.example/": () => new Response("<html>hi</html>", { status: 200 }),
  });

  const report = await analyzeSite("https://weak.example/");

  const titles = report.findings.map((f) => f.title);
  assert.ok(titles.includes("Missing Content-Security-Policy"));
  assert.ok(titles.includes("Missing Strict-Transport-Security (HSTS)"));
  assert.ok(titles.includes('Cookie "id" missing Secure flag'));
  assert.ok(titles.includes('Cookie "id" has weak SameSite protection'));
  assert.ok(titles.includes("Plain HTTP is also served without a redirect"));
  assert.notEqual(report.grade, "A");
  assert.ok(report.score < 90);
});

test("analyzeSite reports exposed .git/.env, a source map, an outdated TLS version, and a possible-SQL-error signal as possible-weakness, never confirmed", async () => {
  stubPublicDns();
  stubTls({ protocol: "TLSv1.1", authorized: true, daysUntilExpiry: 90 });

  stubFetch({
    "https://risky.example/": () =>
      new Response('<html><body><script src="/app.js"></script>Warning: mysqli_query(): SQL syntax error near MySQL server version</body></html>', {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    "https://risky.example/.git/HEAD": () => new Response("ref: refs/heads/main\n", { status: 200, headers: { "content-type": "text/plain" } }),
    "https://risky.example/.env": () =>
      new Response("DB_PASSWORD=hunter2\nAPI_KEY=abc123\n", { status: 200, headers: { "content-type": "text/plain" } }),
    "https://risky.example/phpmyadmin/": () => new Response("not found", { status: 404 }),
    "https://risky.example/admin/": () => new Response("not found", { status: 404 }),
    "https://risky.example/wp-admin/": () => new Response("not found", { status: 404 }),
    "https://risky.example/app.js.map": () =>
      new Response('{"version":3,"sources":["app.ts"],"mappings":"AAAA"}', { status: 200, headers: { "content-type": "application/json" } }),
    "http://risky.example/": new Error("connect ECONNREFUSED"),
  });

  const report = await analyzeSite("https://risky.example/");

  const titles = report.findings.map((f) => f.title);
  assert.ok(titles.includes("Exposed .git repository"));
  assert.ok(titles.includes("Exposed .env file"));
  assert.ok(titles.includes("Source map exposed"));
  assert.ok(titles.includes("Outdated TLS protocol (TLSv1.1)"));

  const sqlFinding = report.findings.find((f) => f.title.includes("MySQL error"));
  assert.ok(sqlFinding, "expected a possible-MySQL-error finding");
  assert.equal(sqlFinding.severity, "low");
  assert.match(sqlFinding.description, /possible weakness, not a confirmed vulnerability/);
  assert.match(sqlFinding.description, /requires? authorized testing/);

  assert.equal(report.grade, "F");
});

test("analyzeSite never throws for a well-formed public URL that simply fails to load", async () => {
  stubPublicDns();
  globalThis.fetch = async () => {
    throw new Error("ETIMEDOUT");
  };

  const report = await analyzeSite("https://down.example/");

  assert.equal(report.grade, "N/A");
  assert.equal(report.findings[0].category, "network");
});

test("analyzeSite rejects an unsafe url before making any request", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("", { status: 200 });
  };
  await assert.rejects(() => analyzeSite("http://127.0.0.1/"));
  assert.equal(called, false);
});

test("the report carries a chartable summary, recommendations and coverage notes", async () => {
  stubPublicDns();
  stubTls();
  globalThis.fetch = async () => new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } });

  const report = await analyzeSite("https://summary.example/", null, { clientCollectionError: "collector returned no result" });

  assert.ok(report.summary.severityCounts.medium > 0);
  assert.ok(report.summary.areas.find((a) => a.id === "headers").score < 100);
  assert.equal(report.summary.areas.find((a) => a.id === "page-code").status, "not_checked");
  assert.equal(report.coverage.clientSignals, false);
  assert.ok(report.findings.some((f) => f.title === "Page-content checks were skipped" && f.severity === "info"));
  assert.ok(report.findings.find((f) => f.title === "Missing Content-Security-Policy").recommendation);
});

test("stale vulnerable-library signature data is called out, fresh data is not", async () => {
  stubPublicDns();
  stubTls();
  globalThis.fetch = async () => new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } });
  const now = Date.parse("2027-06-01T00:00:00Z");

  const stale = await analyzeSite("https://stale.example/", { libraryDataFetchedAt: "2026-09-23" }, { now });
  const fresh = await analyzeSite("https://fresh.example/", { libraryDataFetchedAt: "2027-05-01" }, { now });

  assert.ok(stale.findings.some((f) => f.title === "Vulnerable-library signatures are out of date"));
  assert.ok(!fresh.findings.some((f) => f.title === "Vulnerable-library signatures are out of date"));
});
