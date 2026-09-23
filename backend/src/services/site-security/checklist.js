// The complete list of checks a Security Report runs, with a status for
// each - so the full-screen report can show what PASSED, not only what was
// found. Findings don't carry a check id, so each check claims the finding
// titles it produces (the same stable titles recommendations.js matches on).
//
// Status:
//   fail     at least one finding from this check costs points
//   warn     only informational findings (worth knowing, costs nothing)
//   pass     the check ran and found nothing
//   info     an inventory, not a test (e.g. API calls): lists what was seen
//            and never counts as a pass, even when nothing was seen
//   not_run  the check couldn't run for this page - `reason` says why.
//            Never shown as a pass: "we didn't look" is not "it's fine".
//
// checklist.test.js asserts that every finding title the checks emit is
// claimed by exactly one entry here, so a new check can't silently fall
// outside the list.

import { SEVERITY_DEDUCTION } from "./checks.js";

const needs = {
  server: (c) => (c.reachable ? null : "The FraudLens backend couldn't reach this site."),
  https: (c) => (!c.reachable ? "The FraudLens backend couldn't reach this site." : c.https ? null : "The site isn't served over HTTPS, so there's no certificate to check."),
  csp: (c) => (!c.reachable ? "The FraudLens backend couldn't reach this site." : c.hasCsp ? null : "There's no enforced Content-Security-Policy to inspect (see the CSP check)."),
  client: (c) => (c.clientSignals ? null : "The extension couldn't read this page's content."),
};

/** [id, label, area, requirement, title pattern] */
const CHECKS = [
  ["https", "Page is served over HTTPS", "transport", "server", /^Site is not served over HTTPS$/],
  ["http-redirect", "Plain HTTP redirects to HTTPS", "transport", "server", /^(?:HTTP does not redirect to HTTPS|Plain HTTP is also served without a redirect)$/],
  ["tls-handshake", "TLS connection can be established", "transport", "https", /^Could not establish a TLS connection$/],
  ["tls-trust", "Certificate is issued by a trusted authority", "transport", "https", /^TLS certificate is not trusted$/],
  ["tls-expiry", "Certificate is valid and not about to expire", "transport", "https", /^TLS certificate (?:has expired|expires soon)$/],
  ["tls-protocol", "Only modern TLS (1.2 or newer)", "transport", "https", /^Outdated TLS protocol/],

  ["csp", "Content-Security-Policy is set and enforced", "headers", "server", /^(?:Missing Content-Security-Policy|Content-Security-Policy is report-only)$/],
  ["csp-scripts", "CSP restricts where scripts load from", "headers", "csp", /^CSP does not restrict scripts$/],
  ["csp-inline", "CSP blocks injected inline scripts", "headers", "csp", /^CSP allows inline scripts$/],
  ["csp-eval", "CSP blocks eval()", "headers", "csp", /^CSP allows eval\(\)$/],
  ["csp-hosts", "CSP doesn't allow scripts from any host", "headers", "csp", /^CSP allows scripts from any host$/],
  ["csp-object", "CSP blocks plugins (object-src)", "headers", "csp", /^CSP does not restrict plugins/],
  ["csp-base", "CSP locks the base URL (base-uri)", "headers", "csp", /^CSP does not set base-uri$/],
  ["hsts", "HSTS keeps browsers on HTTPS", "headers", "https", /^(?:Missing Strict-Transport-Security \(HSTS\)|Short HSTS max-age)$/],
  ["hsts-subdomains", "HSTS covers subdomains", "headers", "https", /^HSTS does not cover subdomains$/],
  ["nosniff", "X-Content-Type-Options: nosniff", "headers", "server", /X-Content-Type-Options/],
  ["referrer", "Referrer-Policy limits what's leaked", "headers", "server", /Referrer-Policy/],
  ["permissions", "Permissions-Policy restricts browser features", "headers", "server", /^Missing Permissions-Policy$/],
  ["coop", "Cross-Origin-Opener-Policy isolates the window", "headers", "server", /^Missing Cross-Origin-Opener-Policy$/],
  ["cors", "CORS doesn't expose responses to other sites", "headers", "server", /CORS|^Response readable by any origin$/],
  ["security-txt", "security.txt tells researchers how to report issues", "headers", "server", /^No security\.txt$/],

  ["framing", "Page can't be framed by other sites (clickjacking)", "framing", "server", /^(?:Page can be framed by any site|CSP frame-ancestors allows framing from any site|X-Frame-Options ALLOW-FROM is ignored|Non-standard X-Frame-Options value)$/],

  ["cookie-secure", "Cookies are HTTPS-only (Secure)", "cookies", "server", /missing Secure flag$/],
  ["cookie-httponly", "Cookies are hidden from scripts (HttpOnly)", "cookies", "server", /missing HttpOnly flag$/],
  ["cookie-samesite", "Cookies resist cross-site requests (SameSite)", "cookies", "server", /weak SameSite protection$/],

  ["exposed-git", "No exposed .git repository", "exposure", "server", /^Exposed \.git repository$/],
  ["exposed-env", "No exposed .env file", "exposure", "server", /^Exposed \.env file$/],
  ["exposed-phpmyadmin", "No public phpMyAdmin", "exposure", "server", /^phpMyAdmin reachable$/],
  ["exposed-admin", "Admin paths aren't openly reachable", "exposure", "server", /admin path reachable$/i],
  ["source-maps", "No public source maps", "exposure", "server", /^Source map exposed$/],
  ["version-disclosure", "Server software version isn't advertised", "exposure", "server", /^Server software version disclosed$/],
  ["error-text", "No database or stack-trace errors in the page", "exposure", "server", /error text in the response$/],

  ["dom-code-sinks", "No string-to-code sinks (eval, new Function, string timers)", "page-code", "client", /^Page uses (?:eval|new Function|setTimeout\(string\)|setInterval\(string\))$/],
  ["dom-html-sinks", "No raw HTML sinks (innerHTML, document.write …)", "page-code", "client", /^Page uses (?:innerHTML|outerHTML|document\.write|insertAdjacentHTML|dangerouslySetInnerHTML)$/],
  ["inline-handlers", "No inline event handlers", "page-code", "client", /^Page uses inlineEventHandler$/],
  ["reflected-params", "URL parameters aren't reflected unencoded", "page-code", "client", /reflected unencoded in the page$/],
  ["vulnerable-libraries", "No known-vulnerable JavaScript libraries", "page-code", "client", /^Vulnerable library/],
  ["sri", "Third-party scripts pinned with Subresource Integrity", "page-code", "client", /without Subresource Integrity$/],

  ["mixed-content", "No HTTP resources on an HTTPS page", "content", "client", /^Mixed content/],
  ["form-http", "Forms don't submit over plain HTTP", "content", "client", /^Form submits over plain HTTP$/],
  ["form-cross-origin", "Forms submit to this same site", "content", "client", /^Form submits to a different origin$/],
  ["password-http", "No password fields on an unencrypted page", "content", "client", /^Password field on an unencrypted page$/],

  ["third-party-scripts", "Third-party scripts loaded", "third-party", "client", /third-party script\(s\) loaded$/],
  ["api-calls", "API calls made by the page", "third-party", "client", /API call\(s\) observed$/],
];

// Inventory checks: they report what the page does without judging it.
const INFORMATIONAL = {
  "api-calls": "No API calls were observed while the page loaded. This lists calls; it doesn't test them.",
};

/** The first few code/response locations behind a check's findings, for the report. */
function locationsOf(matched) {
  const locations = matched.flatMap((f) => f.locations ?? []).slice(0, 3);
  return locations.length ? { locations } : {};
}

export const CHECK_IDS = Object.freeze(CHECKS.map(([id]) => id));

const SEVERITY_ORDER = ["high", "medium", "low", "info"];
const STATUS_ORDER = { fail: 0, warn: 1, pass: 2, info: 3, not_run: 4 };

/** The check a finding belongs to, or null (network/coverage notes aren't checks). */
export function checkIdForFinding(finding) {
  const hit = CHECKS.find(([, , , , re]) => re.test(finding.title || ""));
  return hit ? hit[0] : null;
}

/**
 * @param {object[]} findings
 * @param {{ reachable: boolean, https: boolean, clientSignals: boolean }} coverage
 * @returns {object[]} every check, most pressing first
 */
export function buildChecklist(findings, { reachable, https, clientSignals }) {
  const hasCsp = reachable && !findings.some((f) => f.title === "Missing Content-Security-Policy" || f.title === "Content-Security-Policy is report-only");
  const ctx = { reachable, https, clientSignals, hasCsp };

  const rows = CHECKS.map(([id, label, area, requirement, re]) => {
    const reason = needs[requirement](ctx);
    const matched = findings.filter((f) => re.test(f.title || ""));
    if (reason && matched.length === 0) return { id, label, area, status: "not_run", reason };
    if (INFORMATIONAL[id]) {
      return matched.length
        ? { id, label, area, status: "info", findings: matched.map((f) => f.title), ...locationsOf(matched) }
        : { id, label, area, status: "info", reason: INFORMATIONAL[id] };
    }
    const costly = matched.filter((f) => (SEVERITY_DEDUCTION[f.severity] ?? 0) > 0);
    const worst = SEVERITY_ORDER.find((s) => matched.some((f) => f.severity === s)) ?? null;
    const status = costly.length > 0 ? "fail" : matched.length > 0 ? "warn" : "pass";
    return {
      id,
      label,
      area,
      status,
      ...(worst ? { severity: worst } : {}),
      ...(matched.length ? { findings: matched.map((f) => f.title) } : {}),
      ...locationsOf(matched),
    };
  });

  return rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      SEVERITY_ORDER.indexOf(a.severity ?? "info") - SEVERITY_ORDER.indexOf(b.severity ?? "info")
  );
}
