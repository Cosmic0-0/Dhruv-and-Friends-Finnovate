import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsp, checkSecurityHeaders, checkFraming, checkCors, checkDisclosure, checkSecurityTxt } from "./checks.js";

const titles = (findings) => findings.map((f) => f.title);
const h = (obj) => new Headers(obj);

test("parseCsp splits directives and keeps the first policy's value per directive", () => {
  const csp = parseCsp("default-src 'self'; script-src 'self' https://cdn.example, script-src *");
  assert.deepEqual(csp.get("default-src"), ["'self'"]);
  assert.deepEqual(csp.get("script-src"), ["'self'", "https://cdn.example"]);
});

test("a strict CSP produces no CSP findings", () => {
  const f = checkSecurityHeaders(h({ "content-security-policy": "default-src 'self'; object-src 'none'; base-uri 'self'" }), "http:");
  assert.equal(titles(f).filter((t) => /CSP|Content-Security/.test(t)).length, 0);
});

test("CSP directive weaknesses are each reported", () => {
  const f = titles(checkSecurityHeaders(h({ "content-security-policy": "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:" }), "http:"));
  assert.ok(f.includes("CSP allows inline scripts"));
  assert.ok(f.includes("CSP allows eval()"));
  assert.ok(f.includes("CSP allows scripts from any host"));
  assert.ok(f.includes("CSP does not restrict plugins (object-src)"));
  assert.ok(f.includes("CSP does not set base-uri"));
});

test("'unsafe-inline' alongside a nonce, and host sources under 'strict-dynamic', are not flagged", () => {
  const f = titles(checkSecurityHeaders(h({ "content-security-policy": "script-src 'nonce-abc' 'strict-dynamic' 'unsafe-inline' https:; object-src 'none'; base-uri 'none'" }), "http:"));
  assert.ok(!f.includes("CSP allows inline scripts"));
  assert.ok(!f.includes("CSP allows scripts from any host"));
});

test("report-only CSP without an enforcing one is a low finding, not 'missing'", () => {
  const f = checkSecurityHeaders(h({ "content-security-policy-report-only": "default-src 'self'" }), "http:");
  const csp = f.find((x) => /Content-Security-Policy/.test(x.title));
  assert.equal(csp.title, "Content-Security-Policy is report-only");
  assert.equal(csp.severity, "low");
});

test("HSTS without includeSubDomains is informational", () => {
  const f = checkSecurityHeaders(h({ "strict-transport-security": "max-age=31536000" }), "https:");
  assert.equal(f.find((x) => x.title === "HSTS does not cover subdomains").severity, "info");
});

test("framing: frame-ancestors alone is enough protection, even with no X-Frame-Options", () => {
  assert.deepEqual(checkFraming(h({ "content-security-policy": "frame-ancestors 'self'" })), []);
});

test("framing: X-Frame-Options DENY alone is enough protection", () => {
  assert.deepEqual(checkFraming(h({ "x-frame-options": "DENY" })), []);
});

test("framing: neither header is a medium clickjacking finding", () => {
  const [f] = checkFraming(h({}));
  assert.equal(f.title, "Page can be framed by any site");
  assert.equal(f.severity, "medium");
});

test("framing: a wildcard frame-ancestors is flagged even when X-Frame-Options is DENY", () => {
  const [f] = checkFraming(h({ "content-security-policy": "frame-ancestors *", "x-frame-options": "DENY" }));
  assert.equal(f.title, "CSP frame-ancestors allows framing from any site");
});

test("framing: X-Frame-Options ALLOW-FROM is treated as unprotected", () => {
  const [f] = checkFraming(h({ "x-frame-options": "ALLOW-FROM https://a.example" }));
  assert.equal(f.title, "X-Frame-Options ALLOW-FROM is ignored");
});

test("CORS: null origin and wildcard-with-credentials are medium; plain wildcard is info", () => {
  assert.equal(checkCors(h({ "access-control-allow-origin": "null" }))[0].severity, "medium");
  assert.equal(checkCors(h({ "access-control-allow-origin": "*", "access-control-allow-credentials": "true" }))[0].severity, "medium");
  assert.equal(checkCors(h({ "access-control-allow-origin": "*" }))[0].severity, "info");
  assert.deepEqual(checkCors(h({ "access-control-allow-origin": "https://app.example" })), []);
  assert.deepEqual(checkCors(h({})), []);
});

test("disclosure: versioned Server and X-Powered-By are one low finding; a bare product name is not", () => {
  const [f] = checkDisclosure(h({ server: "Apache/2.4.41 (Ubuntu)", "x-powered-by": "PHP/7.4.3" }));
  assert.equal(f.severity, "low");
  assert.match(f.evidence, /Apache\/2\.4\.41/);
  assert.match(f.evidence, /PHP\/7\.4\.3/);
  assert.deepEqual(checkDisclosure(h({ server: "cloudflare" })), []);
});

test("security.txt: a Contact field means no finding; absence is informational", async () => {
  const withTxt = async () => ({ status: 200, body: "Contact: mailto:sec@x.example\n" });
  const without = async () => ({ status: 404, body: "" });
  assert.deepEqual(await checkSecurityTxt("https://x.example/", withTxt), []);
  const [f] = await checkSecurityTxt("https://x.example/", without);
  assert.equal(f.severity, "info");
});

// ---- Scoring model ----
import { computeGrade, pointsLostByCategory, CATEGORY_CAP } from "./checks.js";
import { summarizeReport } from "./summary.js";

const finding = (category, severity, title) => ({ category, severity, title, description: "" });

test("scoring: repeats of one kind of finding count once in full, then at a quarter", () => {
  const cookies = ["a", "b", "c", "d"].map((n) => finding("cookies", "medium", `Cookie "${n}" has weak SameSite protection`));
  // 10 + 2.5 * 3 = 17.5 -> 18
  assert.equal(pointsLostByCategory(cookies).get("cookies"), 18);
});

test("scoring: distinct problems in one category each count in full", () => {
  const headers = [finding("headers", "medium", "Missing Content-Security-Policy"), finding("headers", "medium", "Missing Strict-Transport-Security (HSTS)")];
  assert.equal(pointsLostByCategory(headers).get("headers"), 20);
});

test("scoring: a category can never cost more than the cap", () => {
  const many = ["Exposed .git repository", "Exposed .env file", "phpMyAdmin reachable"].map((t) => finding("exposed-artifacts", "high", t));
  assert.equal(pointsLostByCategory(many).get("exposed-artifacts"), CATEGORY_CAP);
});

test("scoring: info findings never cost points, and the grade equals 100 minus the category losses", () => {
  const findings = [
    finding("headers", "medium", "Missing Content-Security-Policy"),
    finding("framing", "medium", "Page can be framed by any site"),
    finding("policy", "info", "No security.txt"),
    finding("cookies", "low", 'Cookie "x" missing HttpOnly flag'),
    finding("cookies", "low", 'Cookie "y" missing HttpOnly flag'),
  ];
  const { score, grade } = computeGrade(findings);
  const summary = summarizeReport(findings, { reachable: true, clientSignals: false });
  const charted = summary.categories.reduce((sum, c) => sum + c.points, 0);
  assert.equal(score, 100 - charted, "charted category losses must add up to the grade");
  assert.equal(score, 100 - (10 + 10 + 5));
  assert.equal(grade, "B");
});
