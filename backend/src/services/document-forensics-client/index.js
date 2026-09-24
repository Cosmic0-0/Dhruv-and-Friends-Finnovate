// Transport for the document-forensics call: a local Python microservice
// (document-forensics/, see its own README) reached over localhost HTTP,
// the same "another local process over HTTP" pattern already used for
// Ollama (services/analysis/llmClient.js). Never a third-party API.

const DOCUMENT_FORENSICS_URL = process.env.DOCUMENT_FORENSICS_URL || "http://127.0.0.1:8081";
// The service's own checks are cheap-to-expensive with early exit, but a
// cold process (first call after startup) pays PyTorch/transformers model
// load on top of whichever checks actually run - a full 4-stage escalation
// was measured at ~17s warm; a cold Donut load alone can add many seconds
// on top of that. 90s mirrors LLM_TIMEOUT_MS's "real margin, not a
// guarantee" stance (see that constant's comment in llmClient.js).
const DOCUMENT_FORENSICS_TIMEOUT_MS = Number(process.env.DOCUMENT_FORENSICS_TIMEOUT_MS) || 90000;

// Failures are tagged with one of these public reason codes. The response
// carries only the code; the underlying error (addresses, ports, the
// service's own error body) is logged server-side.
class ForensicsError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

async function withTimeout(fn, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new ForensicsError("timeout", `timed out after ${ms}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function publicReason(err) {
  if (err instanceof ForensicsError) return err.reason;
  if (err instanceof SyntaxError) return "service_error"; // unparsable JSON body
  return "unreachable";
}

function camelizeIndicator(indicator) {
  return {
    check: indicator.check,
    title: indicator.title,
    description: indicator.description,
    confidence: indicator.confidence,
    evidence: indicator.evidence ?? null,
  };
}

// The Python service's response is snake_case (a plain pydantic
// model_dump); every other route in this API is camelCase
// (docs/API-CONTRACT.md) - translate at this one boundary rather than
// letting snake_case leak into the locked contract.
function camelizeReport(report) {
  return {
    documentId: report.document_id ?? null,
    mimeType: report.mime_type,
    confidence: report.confidence ?? null,
    summary: report.summary,
    indicators: (report.indicators ?? []).map(camelizeIndicator),
    signature: report.signature
      ? {
          present: report.signature.present,
          note: report.signature.note,
          indicators: (report.signature.indicators ?? []).map(camelizeIndicator),
        }
      : null,
    checksRun: report.checks_run ?? [],
    checksSkipped: (report.checks_skipped ?? []).map((s) => ({ check: s.check, reason: s.reason })),
    scannedAt: report.scanned_at,
  };
}

/**
 * Calls the local document-forensics service. Never throws for "service
 * unreachable/slow/erroring" - returns { status: "unavailable", reason }
 * instead, where reason is "unreachable" | "timeout" | "service_error".
 * Same posture services/analysis/llmClient.js takes toward an Ollama
 * outage: this is enrichment on top of ingestion, not a
 * precondition for it, so a down forensics service must never fail
 * POST /api/documents.
 * @param {{ buffer: Buffer, mimeType: string, documentId?: string, timeoutMs?: number }} input
 */
export async function analyzeDocumentForensics({ buffer, mimeType, documentId, timeoutMs = DOCUMENT_FORENSICS_TIMEOUT_MS }) {
  try {
    const report = await withTimeout(async (signal) => {
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: mimeType }), documentId || "document");
      form.append("mime_type", mimeType);
      if (documentId) form.append("document_id", documentId);

      const res = await fetch(`${DOCUMENT_FORENSICS_URL}/analyze`, { method: "POST", body: form, signal });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ForensicsError("service_error", `document-forensics request failed: ${res.status} ${body.slice(0, 200)}`);
      }
      return res.json();
    }, timeoutMs);

    return { status: "ok", report: camelizeReport(report) };
  } catch (err) {
    console.error("[document-forensics]", err.message);
    return { status: "unavailable", reason: publicReason(err) };
  }
}

export async function checkDocumentForensicsHealth() {
  try {
    const res = await withTimeout((signal) => fetch(`${DOCUMENT_FORENSICS_URL}/health`, { signal }), 3000);
    return res.ok;
  } catch {
    return false;
  }
}
