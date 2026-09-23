// Site Security Report (extension/README.md "Security Report") — a passive
// security posture check for the page the extension's current tab is on.
//
// HARD CONSTRAINT: passive analysis only. This module never sends crafted
// payloads, injection strings, or fuzzed input to a target site, and never
// brute-forces paths. It only:
//   - reads headers/cookies/body from ONE plain GET of the page itself
//     (fetcher.js's fetchOnce, redirect chain included),
//   - opens a bare TLS handshake to read protocol/certificate metadata
//     (tls.js) — no HTTP request sent over it,
//   - makes one GET each against a short FIXED list of well-known paths
//     (checks.js's ARTIFACT_CHECKS) and the page's own referenced scripts'
///    .map siblings — never a wordlist, never expanded at runtime,
//   - scans the body already fetched for error-message text patterns
//     (checks.js's scanForErrorSignatures) — it never tries to trigger an
//     error, and reports any match as a possible weakness requiring
//     authorized testing to confirm, never as a confirmed vulnerability.
// This runs against arbitrary sites a user is browsing, so anything beyond
// this passive scope (active probing, fuzzing, mass scanning) is explicitly
// out of scope — do not extend this module that way.
//
// The target URL is attacker-influenced input (this is reached from a
// public POST route), so every outbound request goes through
// assertPublicHttpUrl()'s SSRF guard (url-safety.js) first.

import { fetchOnce } from "./fetcher.js";
import { probeTls } from "./tls.js";
import { assertPublicHttpUrl, UnsafeUrlError } from "./url-safety.js";
import { checkSecurityHeaders, checkCookies, checkExposedArtifacts, checkSourceMaps, scanForErrorSignatures, computeGrade } from "./checks.js";
import { mapClientSignals } from "./client-signals.js";

export { UnsafeUrlError };

const OUTDATED_TLS_PROTOCOLS = new Set(["TLSv1", "TLSv1.1", "SSLv3", "SSLv2"]);

function tlsFindings(tlsResult) {
  if (!tlsResult) return [];
  if (!tlsResult.ok) {
    return [{ category: "tls", severity: "medium", title: "Could not establish a TLS connection", description: tlsResult.error || "The TLS handshake failed." }];
  }

  const findings = [];
  if (tlsResult.authorized === false) {
    findings.push({
      category: "tls",
      severity: "high",
      title: "TLS certificate is not trusted",
      description: tlsResult.authorizationError || "The certificate chain did not validate against trusted root CAs.",
    });
  }
  if (tlsResult.validTo) {
    const daysLeft = Math.floor((new Date(tlsResult.validTo).getTime() - Date.now()) / 86_400_000);
    if (daysLeft < 0) {
      findings.push({ category: "tls", severity: "high", title: "TLS certificate has expired", description: `The certificate expired on ${tlsResult.validTo}.` });
    } else if (daysLeft < 14) {
      findings.push({ category: "tls", severity: "medium", title: "TLS certificate expires soon", description: `The certificate expires in ${daysLeft} day(s) (${tlsResult.validTo}).` });
    }
  }
  if (tlsResult.protocol && OUTDATED_TLS_PROTOCOLS.has(tlsResult.protocol)) {
    findings.push({ category: "tls", severity: "high", title: `Outdated TLS protocol (${tlsResult.protocol})`, description: "TLS 1.0/1.1 (and SSL) are deprecated and considered insecure; the server should require TLS 1.2 or newer." });
  }
  return findings;
}

// One extra GET to plain http://<same host>/ — not a new target, just
// checking whether the site being analyzed also answers unencrypted on
// port 80 instead of redirecting. Never followed for an http: original URL,
// since fetchOnce()'s own redirect chain already answers that case.
async function checkHttpsRedirect(parsedUrl, mainResult) {
  if (parsedUrl.protocol === "http:") {
    if (!mainResult.finalUrl.startsWith("https://")) {
      return {
        category: "tls",
        severity: "high",
        title: "HTTP does not redirect to HTTPS",
        description: "This site was reached over plain HTTP and never redirected to an encrypted connection, exposing all traffic to interception and tampering.",
      };
    }
    return null;
  }

  try {
    const result = await fetchOnce(`http://${parsedUrl.hostname}/`, { maxRedirects: 0, readBody: false, timeoutMs: 4000 });
    if (result.status >= 200 && result.status < 300) {
      return {
        category: "tls",
        severity: "medium",
        title: "Plain HTTP is also served without a redirect",
        description: 'This host serves content over plain HTTP (port 80) without redirecting to HTTPS, so a visitor who omits "https://" gets an unencrypted connection.',
      };
    }
  } catch {
    // Port 80 unreachable/refused/timed out on this host — nothing to report either way.
  }
  return null;
}

/**
 * @param {string} url - the page to analyze (typically the extension's current-tab URL)
 * @param {object} [clientSignals] - optional client-collected signals from extension/collect-signals.js
 * @returns {Promise<{url: string, finalUrl: string|null, grade: string, score: number|null, scannedAt: string, findings: object[]}>}
 * Throws UnsafeUrlError for a malformed/unsafe url (mapped to 400 by the route); never throws for a well-formed public URL that merely fails to load.
 */
export async function analyzeSite(url, clientSignals) {
  const parsedUrl = await assertPublicHttpUrl(url);

  let mainResult;
  try {
    mainResult = await fetchOnce(parsedUrl.href);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    return {
      url: parsedUrl.href,
      finalUrl: null,
      grade: "N/A",
      score: null,
      scannedAt: new Date().toISOString(),
      findings: [
        {
          category: "network",
          severity: "info",
          title: "Site could not be reached",
          description: `The backend could not fetch ${parsedUrl.href}: ${err.message}. Header, cookie, TLS and artifact checks were skipped.`,
        },
      ],
    };
  }

  const finalUrl = new URL(mainResult.finalUrl);
  const findings = [];

  findings.push(...checkSecurityHeaders(mainResult.headers, finalUrl.protocol));
  findings.push(...checkCookies(mainResult.headers, finalUrl.protocol));
  findings.push(...scanForErrorSignatures(mainResult.body));

  const [artifactFindings, sourceMapFindings, tlsResult, redirectFinding] = await Promise.all([
    checkExposedArtifacts(finalUrl.href, fetchOnce).catch(() => []),
    checkSourceMaps(finalUrl.href, mainResult.body, fetchOnce).catch(() => []),
    finalUrl.protocol === "https:" ? probeTls(finalUrl.hostname).catch((err) => ({ ok: false, error: err.message })) : Promise.resolve(null),
    checkHttpsRedirect(parsedUrl, mainResult).catch(() => null),
  ]);
  findings.push(...artifactFindings, ...sourceMapFindings);

  if (finalUrl.protocol === "https:") {
    findings.push(...tlsFindings(tlsResult));
  } else {
    findings.push({ category: "tls", severity: "high", title: "Site is not served over HTTPS", description: "The final response was served over plain HTTP, so all traffic to this site is unencrypted." });
  }
  if (redirectFinding) findings.push(redirectFinding);

  findings.push(...mapClientSignals(clientSignals));

  const { grade, score } = computeGrade(findings);
  return { url: parsedUrl.href, finalUrl: mainResult.finalUrl, grade, score, scannedAt: new Date().toISOString(), findings };
}
