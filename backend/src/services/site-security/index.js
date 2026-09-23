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
//     (checks.js's ARTIFACT_CHECKS, /.well-known/security.txt) and the
//     page's own referenced scripts' .map siblings — never a wordlist,
//     never expanded at runtime,
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
// assertPublicHttpUrl()'s SSRF guard (url-safety.js) first. There is no
// per-target limit, cache or concurrency cap (removed at the product
// owner's request) - only the per-client-IP rate limit in routes/index.js.

import { fetchOnce } from "./fetcher.js";
import { probeTls } from "./tls.js";
import { classifySiteIntent } from "./intent.js";
import { assessUrl } from "../url-reputation/index.js";
import { assertPublicHttpUrl, UnsafeUrlError } from "./url-safety.js";
import {
  checkSecurityHeaders,
  checkFraming,
  checkCors,
  checkDisclosure,
  checkSecurityTxt,
  checkCookies,
  checkExposedArtifacts,
  checkSourceMaps,
  scanForErrorSignatures,
  computeGrade,
} from "./checks.js";
import { mapClientSignals } from "./client-signals.js";
import { summarizeReport } from "./summary.js";
import { buildChecklist } from "./checklist.js";
import { withRecommendations } from "./recommendations.js";

export { UnsafeUrlError };

// Vulnerable-library signatures ship inside the extension
// (extension/vendor/retire-js-dataset.js); past this age the report says so,
// because "no vulnerable libraries found" is only as good as the data.
const LIBRARY_DATA_STALE_DAYS = 120;

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
    const result = await fetchOnce(`http://${parsedUrl.hostname}/`, { maxRedirects: 0, readBody: false });
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
 * The server-side half of a report: everything that depends only on the
 * URL. This is the part that makes outbound requests, so it is the part
 * that makes outbound requests to the target site.
 * @returns {Promise<{ finalUrl: string|null, scannedAt: string, findings: object[] }>}
 */
async function serverScan(parsedUrl) {
  let mainResult;
  try {
    mainResult = await fetchOnce(parsedUrl.href);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    return {
      finalUrl: null,
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
  findings.push(...checkFraming(mainResult.headers));
  findings.push(...checkCors(mainResult.headers));
  findings.push(...checkDisclosure(mainResult.headers));
  findings.push(...checkCookies(mainResult.headers, finalUrl.protocol));
  findings.push(...scanForErrorSignatures(mainResult.body));

  const [artifactFindings, sourceMapFindings, securityTxtFindings, tlsResult, redirectFinding] = await Promise.all([
    checkExposedArtifacts(finalUrl.href, fetchOnce).catch(() => []),
    checkSourceMaps(finalUrl.href, mainResult.body, fetchOnce).catch(() => []),
    checkSecurityTxt(finalUrl.href, fetchOnce).catch(() => []),
    finalUrl.protocol === "https:" ? probeTls(finalUrl.hostname).catch((err) => ({ ok: false, error: err.message })) : Promise.resolve(null),
    checkHttpsRedirect(parsedUrl, mainResult).catch(() => null),
  ]);
  findings.push(...artifactFindings, ...sourceMapFindings, ...securityTxtFindings);

  if (finalUrl.protocol === "https:") {
    findings.push(...tlsFindings(tlsResult));
  } else {
    findings.push({ category: "tls", severity: "high", title: "Site is not served over HTTPS", description: "The final response was served over plain HTTP, so all traffic to this site is unencrypted." });
  }
  if (redirectFinding) findings.push(redirectFinding);

  return { finalUrl: mainResult.finalUrl, scannedAt: new Date().toISOString(), findings };
}

const REPUTATION_TIMEOUT_MS = 5000;

// Where a server-side finding comes from, for the report's "Where" line.
// These aren't in page code: they're in the server's response or TLS setup,
// which is where the fix goes (web server / CDN configuration).
const SERVER_SOURCE = {
  headers: "HTTP response headers",
  cors: "HTTP response headers",
  policy: "HTTP response headers",
  framing: "HTTP response headers",
  cookies: "Set-Cookie response headers",
  disclosure: "HTTP response headers",
  tls: "TLS certificate and handshake",
  network: "HTTP to HTTPS redirect",
  "exposed-artifacts": "Publicly reachable file",
  "injection-signal": "Page HTML returned by the server",
};

function withServerLocation(finding, pageUrl) {
  const source = SERVER_SOURCE[finding.category];
  if (!source || finding.locations) return finding;
  return { ...finding, locations: [{ file: `${source} · ${pageUrl}`, code: finding.evidence ?? "(not present in the response)" }] };
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Honest notes about what this report could NOT see. Informational only - they never cost points. */
function coverageFindings(clientSignals, clientCollectionError, now) {
  const findings = [];
  if (typeof clientCollectionError === "string" && clientCollectionError.trim()) {
    findings.push({
      category: "coverage",
      severity: "info",
      title: "Page-content checks were skipped",
      description: `The extension could not collect DOM/script signals from this page (${clientCollectionError.trim().slice(0, 200)}). Header, cookie, TLS and exposed-file checks are unaffected.`,
    });
  }
  const fetchedAt = Date.parse(clientSignals?.libraryDataFetchedAt ?? "");
  if (Number.isFinite(fetchedAt)) {
    const ageDays = Math.floor((now - fetchedAt) / 86_400_000);
    if (ageDays > LIBRARY_DATA_STALE_DAYS) {
      findings.push({
        category: "coverage",
        severity: "info",
        title: "Vulnerable-library signatures are out of date",
        description: `The extension's Retire.js signature data is ${ageDays} days old, so recently disclosed library vulnerabilities may be missed. Run npm run update:retire in extension/ and reload the extension.`,
      });
    }
  }
  return findings;
}

/**
 * @param {string} url - the page to analyze (typically the extension's current-tab URL)
 * @param {object} [clientSignals] - optional client-collected signals from extension/collect-signals.js
 * @param {{ clientCollectionError?: string, now?: number }} [options]
 * @returns {Promise<{url: string, finalUrl: string|null, grade: string, score: number|null, scannedAt: string,
 *   findings: object[], summary: object, coverage: object}>}
 * Throws UnsafeUrlError for a malformed/unsafe url (400). Never throws for a well-formed public URL that
 * merely fails to load.
 */
export async function analyzeSite(url, clientSignals, { clientCollectionError, now = Date.now(), reputation = assessUrl } = {}) {
  const parsedUrl = await assertPublicHttpUrl(url);
  // Reputation (who runs the site) runs alongside the scan (how it's built);
  // capped and fail-open so it can never hold up or break the report.
  const reputationPromise = withTimeout(Promise.resolve().then(() => reputation(parsedUrl.href)), REPUTATION_TIMEOUT_MS).catch(() => null);
  const server = await serverScan(parsedUrl);

  const reachable = server.finalUrl !== null;
  const hasClientSignals = Boolean(clientSignals && typeof clientSignals === "object") && !clientCollectionError;
  const findings = withRecommendations([
    ...server.findings.map((f) => withServerLocation(f, server.finalUrl ?? parsedUrl.href)),
    ...mapClientSignals(clientSignals),
    ...coverageFindings(clientSignals, clientCollectionError, now),
  ]);
  const { grade, score } = reachable ? computeGrade(findings) : { grade: "N/A", score: null };
  const siteReputation = await reputationPromise;

  return {
    url: parsedUrl.href,
    finalUrl: server.finalUrl,
    grade,
    score,
    scannedAt: server.scannedAt,
    // Badly built vs hostile: see intent.js.
    intent: classifySiteIntent({ reputation: siteReputation, grade, findings }),
    reputation: siteReputation
      ? {
          signals: siteReputation.signals,
          officialInstitution: siteReputation.officialInstitution,
          domainAgeDays: siteReputation.domainAgeDays,
          firstCertificateDays: siteReputation.firstCertificateDays,
          certificate: siteReputation.certificate,
        }
      : null,
    findings,
    summary: summarizeReport(findings, { reachable, clientSignals: hasClientSignals }),
    // Every check that was run (or couldn't be), with pass/fail - most pressing first.
    checks: buildChecklist(findings, { reachable, https: reachable && server.finalUrl.startsWith("https:"), clientSignals: hasClientSignals }),
    coverage: {
      serverChecks: reachable,
      clientSignals: hasClientSignals,
      libraryDataFetchedAt: typeof clientSignals?.libraryDataFetchedAt === "string" ? clientSignals.libraryDataFetchedAt.slice(0, 40) : null,
    },
  };
}
