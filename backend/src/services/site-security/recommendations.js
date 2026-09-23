// One-line remediation for each finding type, attached as `recommendation`
// so the full-screen report can show "what to do about it" next to "what we
// saw". Kept in the backend with the checks themselves: the extension only
// renders these strings, it never decides them. Matched on title because
// titles are the stable, specific identifier each check emits (categories
// are too coarse - "headers" covers a dozen different fixes).

const RULES = [
  [/^Missing Content-Security-Policy$/, "Add a Content-Security-Policy header. A safe starting point is: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' - then add the specific hosts the page needs."],
  [/^Content-Security-Policy is report-only$/, "Once the report-only policy has run without unexpected violations, send the same policy as Content-Security-Policy so it is actually enforced."],
  [/^CSP does not restrict scripts$/, "Add script-src (or default-src) to the policy, ideally with per-request nonces and 'strict-dynamic'."],
  [/^CSP allows inline scripts$/, "Replace 'unsafe-inline' in script-src with a per-response nonce (or hashes) and move inline handlers into script files."],
  [/^CSP allows eval\(\)$/, "Remove 'unsafe-eval' and replace eval/new Function/string timers in the page's code (and its libraries) with normal functions."],
  [/^CSP allows scripts from any host$/, "Replace the wildcard or scheme source in script-src with the exact script hosts the page uses, or switch to a nonce + 'strict-dynamic' policy."],
  [/^CSP does not restrict plugins/, "Add object-src 'none' to the policy."],
  [/^CSP does not set base-uri$/, "Add base-uri 'self' (or 'none') to the policy."],
  [/^(?:Missing Strict-Transport-Security|Short HSTS max-age)/, "Send Strict-Transport-Security: max-age=31536000; includeSubDomains on every HTTPS response."],
  [/^HSTS does not cover subdomains$/, "Add includeSubDomains to Strict-Transport-Security once every subdomain is reachable over HTTPS."],
  [/X-Content-Type-Options/, "Send X-Content-Type-Options: nosniff on every response."],
  [/Referrer-Policy/, "Send Referrer-Policy: strict-origin-when-cross-origin (or stricter)."],
  [/^Missing Permissions-Policy$/, "Send a Permissions-Policy that disables features the site doesn't use, e.g. camera=(), microphone=(), geolocation=()."],
  [/^Missing Cross-Origin-Opener-Policy$/, "Send Cross-Origin-Opener-Policy: same-origin (or same-origin-allow-popups if the site relies on popups such as payment or sign-in windows)."],
  [/^Page can be framed by any site$/, "Send Content-Security-Policy: frame-ancestors 'self' (and X-Frame-Options: DENY or SAMEORIGIN for older browsers)."],
  [/^CSP frame-ancestors allows framing/, "Restrict frame-ancestors to 'self' or the specific sites that legitimately embed this page."],
  [/X-Frame-Options/, "Use X-Frame-Options: DENY or SAMEORIGIN, and CSP frame-ancestors for anything more specific."],
  [/^CORS trusts the "null" origin$/, 'Never allow "null" as an origin. List the exact trusted origins instead.'],
  [/^Contradictory CORS configuration$/, "Check the CORS logic for origin reflection; with credentials, only ever echo origins from an explicit allowlist."],
  [/^Response readable by any origin$/, "Keep Access-Control-Allow-Origin: * only on responses that are genuinely public, and never on anything user-specific."],
  [/^Server software version disclosed$/, "Remove version numbers from Server/X-Powered-By and similar headers (most servers and frameworks have a setting for it)."],
  [/^No security\.txt$/, "Publish /.well-known/security.txt with at least a Contact: line and an Expires: date (RFC 9116)."],
  [/missing Secure flag$/, "Set the Secure attribute on this cookie so it is never sent over plain HTTP."],
  [/missing HttpOnly flag$/, "Set HttpOnly on this cookie unless page JavaScript genuinely needs to read it."],
  [/weak SameSite protection$/, "Set SameSite=Lax (or Strict) on this cookie; use SameSite=None only together with Secure and only where cross-site use is required."],
  [/^Exposed \.git repository$/, "Block access to /.git on the web server and rotate any credentials that were ever committed to the repository."],
  [/^Exposed \.env file$/, "Remove the .env file from the web root, block dotfiles on the server, and rotate every secret it contained."],
  [/^phpMyAdmin reachable$/, "Move phpMyAdmin off the public internet (VPN or IP allowlist) or remove it."],
  [/admin path reachable$/i, "Make sure the admin area requires strong authentication and ideally isn't reachable from the public internet."],
  [/^Source map exposed$/, "Stop deploying .map files to production, or restrict them to authenticated staff."],
  [/error text in the response$/, "Turn off verbose error output in production and review the affected page's database/query handling (with authorized testing)."],
  [/^TLS certificate (?:is not trusted|has expired|expires soon)$/, "Renew or replace the certificate with one from a trusted CA and automate renewal."],
  [/^Outdated TLS protocol/, "Disable TLS 1.0/1.1 and SSL on the server; require TLS 1.2 or newer."],
  [/^Could not establish a TLS connection$/, "Check that the server's HTTPS configuration and certificate chain are valid."],
  [/^(?:HTTP does not redirect to HTTPS|Plain HTTP is also served without a redirect|Site is not served over HTTPS)$/, "Serve the site only over HTTPS and redirect every plain-HTTP request to it with a 301."],
  [/^Page uses /, "Check whether untrusted data can reach this sink; prefer textContent / safe DOM APIs and consider Trusted Types."],
  [/reflected unencoded in the page$/, "HTML-encode this parameter wherever it is written into the page, and verify with authorized testing."],
  [/^Mixed content/, "Load every resource over HTTPS (or add upgrade-insecure-requests to the CSP)."],
  [/^Form submits over plain HTTP$/, "Point the form's action at an HTTPS URL."],
  [/^Form submits to a different origin$/, "Confirm the destination is expected; users should see the same domain they are submitting data to."],
  [/^Vulnerable library/, "Upgrade the library to a version outside every affected range listed in the evidence."],
  [/without Subresource Integrity$/, "Add integrity=\"sha384-...\" and crossorigin=\"anonymous\" to third-party <script> tags, or self-host the scripts."],
  [/^Password field on an unencrypted page$/, "Serve this page, and wherever the form submits, only over HTTPS."],
];

export function recommendationFor(finding) {
  const rule = RULES.find(([re]) => re.test(finding.title || ""));
  return rule ? rule[1] : null;
}

/** Returns new finding objects; never mutates the input. */
export function withRecommendations(findings) {
  return findings.map((f) => {
    if (f.recommendation) return f;
    const recommendation = recommendationFor(f);
    return recommendation ? { ...f, recommendation } : f;
  });
}
