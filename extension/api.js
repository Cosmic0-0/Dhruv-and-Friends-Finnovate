// Thin fetch wrappers around the existing FraudLens backend
// (docs/API-CONTRACT.md). This is the ONLY place the extension talks to the
// network — every call site (background.js, popup.js) imports from here
// instead of hand-rolling its own fetch, so the request shapes stay in one
// place and match the locked contract exactly. No detection/domain-matching
// logic is reimplemented here: every function just calls a backend route
// and returns its JSON.

import { API_BASE_URL } from "./config.js";

/**
 * POST /api/check-url — non-LLM lookalike-domain check.
 * Returns { url, flagged, signals } or throws on network/HTTP failure.
 */
export async function checkUrl(url) {
  const res = await fetch(`${API_BASE_URL}/api/check-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`backend returned ${res.status}`);
  return res.json();
}

/**
 * POST /api/analyze — full message analysis (LLM + domain/identity checks).
 * `text` should already be capped client-side (see config.js MAX_ANALYZE_CHARS)
 * — the backend also enforces its own 5000-char limit and returns 400 past it.
 * Returns the AnalyzeResponse shape from docs/API-CONTRACT.md, or throws.
 */
export async function analyzeText(text, language) {
  const body = { message: text };
  if (language) body.language = language;
  const res = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error ?? "";
    } catch {
      /* body wasn't JSON */
    }
    throw new Error(detail || `backend returned ${res.status}`);
  }
  return res.json();
}

/**
 * POST /api/report — crowdsourced sender/domain report.
 * Returns { sender, reportCount, recorded } or throws.
 */
export async function reportSender(sender) {
  const res = await fetch(`${API_BASE_URL}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error ?? "";
    } catch {
      /* body wasn't JSON */
    }
    throw new Error(detail || `backend returned ${res.status}`);
  }
  return res.json();
}
