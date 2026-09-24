// Thin fetch wrappers around the existing FraudLens backend
// (docs/API-CONTRACT.md). This is the ONLY place the extension talks to the
// network — every call site (background.js, security-report.js) imports from
// here instead of hand-rolling its own fetch, so the request shapes stay in
// one place and match the locked contract exactly. No detection/domain-
// matching logic is reimplemented here: every function just calls a backend
// route and returns its JSON.
//
// Every failure is thrown as an ApiError with a `kind`, so the UI can say
// what actually happened (findings #23 / #27): "too many checks" is not
// "backend unreachable", and neither is "this page can't be read".

import { API_BASE_URL } from "./config.js";

/** @typedef {"unreachable"|"rate_limited"|"busy"|"rejected"|"server"} ApiErrorKind */

export class ApiError extends Error {
  /**
   * @param {ApiErrorKind} kind
   * @param {string} message
   * @param {number|null} status
   */
  constructor(kind, message, status = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

function kindForStatus(status) {
  if (status === 429) return "rate_limited";
  if (status === 503) return "busy";
  if (status >= 500) return "server";
  return "rejected";
}

async function post(path, body, extraHeaders = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("unreachable", "the FraudLens backend can't be reached");
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error ?? "";
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(kindForStatus(res.status), detail || `backend returned ${res.status}`, res.status);
  }
  return res.json();
}

/**
 * POST /api/check-url — the toolbar badge's check of the current page.
 * Returns { url, host, flagged, signals, reportCount, officialInstitution,
 * trusted, domainAgeDays } or throws ApiError.
 */
export function checkUrl(url) {
  return post("/api/check-url", { url });
}

/**
 * POST /api/analyze — full message analysis (LLM + domain/identity checks).
 * `text` should already be capped client-side (see config.js MAX_ANALYZE_CHARS)
 * — the backend also enforces its own 5000-char limit and returns 400 past it.
 * `pageUrl`, when given (the "Scan This Page" flow), lets the backend treat
 * links to the scanned page's own site as same-origin rather than "not an
 * official domain" (see docs/API-CONTRACT.md).
 */
export function analyzeText(text, language, pageUrl, pageForms) {
  const body = { message: text };
  if (language) body.language = language;
  if (pageUrl) body.pageUrl = pageUrl;
  // Scan This Page only: destination host + field kinds of password/card forms (URL-10).
  if (pageUrl && Array.isArray(pageForms) && pageForms.length > 0) body.pageForms = pageForms.slice(0, 10);
  return post("/api/analyze", body);
}

/**
 * POST /api/analyze-site — passive Site Security Report (see
 * backend/src/services/site-security/index.js). The backend does all
 * header/TLS/cookie/artifact fetching itself, never the extension.
 */
export function analyzeSite(url, clientSignals, clientCollectionError) {
  const body = { url, clientSignals };
  if (clientCollectionError) body.clientCollectionError = String(clientCollectionError).slice(0, 200);
  return post("/api/analyze-site", body);
}

/**
 * POST /api/report — crowdsourced sender/domain report.
 * Returns { sender, reportCount, recorded } or throws ApiError.
 */
export function reportSender(sender) {
  return post("/api/report", { sender });
}
