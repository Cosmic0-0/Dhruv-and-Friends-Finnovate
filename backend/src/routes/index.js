import { nextSandboxTurn, MAX_SANDBOX_TURNS } from "../services/sandbox/index.js";
import { PLAYBOOKS, normalizeScamType, normalizeStage } from "../services/playbooks/index.js";
import { getFingerprintMatches } from "../services/scam-dna/index.js";
import { recordUserReport } from "../services/community-signals/index.js";
import { Router, json } from "express";
import rateLimit from "express-rate-limit";
import { assessUrl } from "../services/url-reputation/index.js";
import { runPipeline } from "../services/pipeline/index.js";
import { validatePaymentContext } from "../services/payment-context/index.js";
import { validateEmailContext } from "../services/email-context/index.js";
import { listCampaigns, OUTCOME_LABELS, recordOutcome } from "../services/org-intel/index.js";
import { DEMO_ORGANISATION } from "../services/workplace-registry/index.js";
import { summarizeBatch, MAX_BATCH_SIZE } from "../services/batch/index.js";
import { extractTextFromImage } from "../services/ocr/index.js";
import { ingestDocument, extractDocumentText } from "../services/document-store/index.js";
import { analyzeDocumentForensics } from "../services/document-forensics-client/index.js";
import { redact } from "../services/redact/index.js";
import { reportSender, saveBatchHistory, getReportCount, getTrendSummary } from "../db/index.js";
import { analyzeSite, UnsafeUrlError } from "../services/site-security/index.js";
import {
  analyzeDocument, DocumentError, DOCUMENT_DETECTOR_VERSION, MAX_DOCUMENT_BYTES, sniffDocumentType,
} from "../services/document-forensics/index.js";

export const router = Router();

const MAX_MESSAGE_LENGTH = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB, before base64 overhead
// POST /api/documents' own cap (image forensics: JPEG/PNG/WEBP, plus PDF for
// its metadata-only checks) - distinct from services/document-forensics'
// own MAX_DOCUMENT_BYTES (PDF/DOCX structural forensics, imported above),
// which is smaller since that path also holds parsed pages/previews in
// memory inside a heap-capped worker.
const MAX_IMAGE_DOCUMENT_BYTES = 15 * 1024 * 1024;

function rateLimited(message, options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: message }),
    ...options,
  });
}

// LLM/OCR calls are the expensive path (self-hosted inference over
// Tailscale, or a paid fallback API) - cap per-IP volume so one client can't
// run up inference cost or starve the demo's shared LLM endpoint.
const analyzeLimiter = rateLimited("too many analyze requests, try again shortly", {
  windowMs: 15 * 60 * 1000,
  limit: 20,
});
const batchLimiter = rateLimited("too many batch-scan requests, try again shortly", {
  windowMs: 15 * 60 * 1000,
  limit: 10,
});
// Non-LLM and mostly in-memory; the one outbound lookup (domain age via
// RDAP) is cached per domain for 24h and capped at 1.5s. The extension
// caches results per URL too, so tab switching doesn't spend this budget.
const checkUrlLimiter = rateLimited("too many check-url requests, try again shortly", {
  windowMs: 15 * 60 * 1000,
  limit: 120,
});
// getReportCount() is a single indexed SELECT, same cost class as check-url.
const checkSenderLimiter = rateLimited("too many check-sender requests, try again shortly", {
  windowMs: 15 * 60 * 1000,
  limit: 120,
});
// Bot protection for the crowdsourced report feed (see checklist.md
// "Add bot protection"): the feed's value depends on report counts meaning
// something, so a tight per-IP cap - much tighter than the read/analyze
// routes - is the deterrent against a script trivially inflating a sender's
// reportCount or poisoning an innocent sender's reputation.
const reportLimiter = rateLimited("too many report submissions from this address, try again later", {
  windowMs: 60 * 60 * 1000,
  limit: 5,
});
// analyzeSite() makes roughly a dozen outbound requests to the target site
// per call (main fetch, TLS probe, artifact/source-map checks, HTTP-redirect
// probe) - much heavier than check-url, so this stays well below that
// route's 120/15min even though it's also non-LLM.
const siteSecurityLimiter = rateLimited("too many security-report requests, try again shortly", {
  windowMs: 15 * 60 * 1000,
  limit: 15,
});
// Document ingestion runs OCR (same cost class as analyzeLimiter) today;
// Part 2's forensics pipeline adds local model inference on top, so this
// stays capped independently rather than sharing analyzeLimiter's bucket.
const documentLimiter = rateLimited("too many document-check requests, try again shortly", {
  windowMs: 15 * 60 * 1000,
  limit: 15,
});

// Magic-byte signatures - the screenshot route never trusts a
// client-reported MIME type (see checklist.md § Security), it sniffs the
// decoded bytes instead.
const IMAGE_SIGNATURES = [
  { mimeType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
];

function sniffImageType(buffer) {
  for (const { mimeType, bytes } of IMAGE_SIGNATURES) {
    if (buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b)) return mimeType;
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Every analysis goes through runPipeline() (services/pipeline): the risk
// level, score, verdict and actions are computed by the deterministic
// engine, and the LLM is optional enrichment - an LLM timeout/outage still
// returns 200 with a deterministic assessment (analysis.semantic.status).
// `pageUrl` is only ever used to derive a hostname for the domain-comparison
// exception in checkLinkHygiene (see pipeline/index.js) - it is never fetched
// and never trusted as a claim about the message content, so a malformed
// value is just ignored rather than rejected (it's supplementary context,
// not part of what's being analysed).
function pageHostFrom(pageUrl) {
  if (typeof pageUrl !== "string" || pageUrl.length === 0 || pageUrl.length > 2000) return null;
  try {
    return new URL(pageUrl).hostname || null;
  } catch {
    return null;
  }
}

router.post("/analyze", analyzeLimiter, json({ limit: "300kb" }), async (req, res) => {
  const { message, language, pageUrl } = req.body;
  if (!isNonEmptyString(message)) {
    return res.status(400).json({ error: "message is required and must be a non-empty string" });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` });
  }
  const payment = validatePaymentContext(req.body.paymentContext);
  if (payment.error) return res.status(400).json({ error: payment.error });
  // Optional workplace-email metadata (future Outlook add-in). `message` is
  // the email body; when emailContext is present the source is "email" and
  // the same runPipeline() runs the EMAIL-* detectors - no separate engine.
  const email = validateEmailContext(req.body.emailContext);
  if (email.error) return res.status(400).json({ error: email.error });
  try {
    res.json(
      await runPipeline(message, {
        source: "pasted_text",
        language,
        paymentContext: payment.value,
        emailContext: email.value,
        pageHost: pageHostFrom(pageUrl),
        ip: req.ip,
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "analysis failed, try again shortly" });
  }
});

router.post("/analyze/screenshot", analyzeLimiter, json({ limit: "8mb" }), async (req, res) => {
  const { image, language } = req.body;
  if (!isNonEmptyString(image)) {
    return res.status(400).json({ error: "image is required and must be a base64-encoded string" });
  }

  const base64 = image.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) {
    return res.status(400).json({ error: "image could not be decoded as base64" });
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return res.status(400).json({ error: `image exceeds maximum size of ${MAX_IMAGE_BYTES / (1024 * 1024)}MB` });
  }
  if (!sniffImageType(buffer)) {
    return res
      .status(400)
      .json({ error: "image must be a valid PNG, JPEG, or WEBP file (checked by content, not the declared type)" });
  }

  let extractedText;
  try {
    extractedText = await extractTextFromImage(buffer);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "OCR failed, try again shortly" });
  }
  if (!isNonEmptyString(extractedText)) {
    return res.status(400).json({ error: "no readable text was found in the image" });
  }

  // The raw image has to reach the server for OCR, so - unlike the text-paste
  // path, which redacts in the browser before anything is sent - this is the
  // earliest point identifiers can be redacted. Everything downstream
  // (length check, analysis, the response) uses the redacted text only, so
  // the same "personal identifiers never leave [this boundary]" guarantee
  // holds for screenshots too (see backend/src/services/redact/index.js).
  const { redacted: redactedText } = redact(extractedText);
  if (redactedText.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `extracted text exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` });
  }

  try {
    const result = await runPipeline(redactedText, { source: "screenshot", language, ip: req.ip });
    res.json({ extractedText: redactedText, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "analysis failed, try again shortly" });
  }
});

// Public document-analysis failures. Messages are fixed strings: the
// underlying parser error is logged server-side only.
const DOCUMENT_UNSUPPORTED = "document must be a PDF or Word (.docx) file (checked by content, not the file name)";
const DOCUMENT_ERRORS = {
  unsupported: [400, DOCUMENT_UNSUPPORTED],
  encrypted: [400, "document is password-protected"],
  // Also a parse that timed out or ran out of memory in the worker.
  unreadable: [400, "document could not be read"],
  busy: [503, "document analysis is busy, try again shortly"],
};

/**
 * Documents routinely hold more text than one analysis accepts, so - unlike
 * a screenshot, whose text is rejected when too long - the redacted text is
 * cut to the cap at a line or word boundary (never inside a redaction
 * placeholder) and the response says so (`document.textTruncated`). The
 * structural checks cover the first pages regardless.
 */
function capDocumentText(text) {
  if (text.length <= MAX_MESSAGE_LENGTH) return { text, truncated: false };
  let cut = text.slice(0, MAX_MESSAGE_LENGTH);
  if (cut.lastIndexOf("[") > cut.lastIndexOf("]")) cut = cut.slice(0, cut.lastIndexOf("["));
  const near = MAX_MESSAGE_LENGTH * 0.8;
  const line = cut.lastIndexOf("\n");
  const word = cut.lastIndexOf(" ");
  if (line > near) cut = cut.slice(0, line);
  else if (word > near) cut = cut.slice(0, word);
  return { text: cut.trimEnd(), truncated: true };
}

// Document forensics (services/document-forensics): structural warning signs
// in a PDF/DOCX plus its text through the same runPipeline(), producing a
// full verdict - the same "signals feed the deterministic scorer" pattern
// every other detector in this app already uses. The type is decided by
// magic bytes only (`fileName` is display-only on the client and ignored
// here); parsing runs in a heap-capped worker with a hard timeout.
//
// The parsed content (text/previews) is never stored, but the exact
// original bytes are (services/document-store, the same byte-exact
// ingestion POST /api/documents below also uses) - `documentId` in the
// response is an internal reference only, never a public retrieval
// endpoint (see that route's own comment).
router.post("/analyze/document", analyzeLimiter, json({ limit: "14mb" }), async (req, res) => {
  const { file, language } = req.body ?? {};
  if (!isNonEmptyString(file)) {
    return res.status(400).json({ error: "document is required and must be a base64-encoded string" });
  }
  const buffer = Buffer.from(file.replace(/^data:[^;,]*;base64,/, ""), "base64");
  if (buffer.length === 0) {
    return res.status(400).json({ error: "document could not be decoded as base64" });
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    return res.status(400).json({ error: `document exceeds maximum size of ${MAX_DOCUMENT_BYTES / (1024 * 1024)}MB` });
  }
  if (!sniffDocumentType(buffer)) {
    return res.status(400).json({ error: DOCUMENT_UNSUPPORTED });
  }

  let doc;
  try {
    doc = await analyzeDocument(buffer);
  } catch (err) {
    if (err instanceof DocumentError && DOCUMENT_ERRORS[err.code]) {
      if (err.code === "unreadable" || err.code === "busy") console.error(`[document] ${err.message}`);
      const [status, error] = DOCUMENT_ERRORS[err.code];
      return res.status(status).json({ error });
    }
    console.error(err);
    return res.status(500).json({ error: "analysis failed, try again shortly" });
  }

  // Storage failing is not a reason to fail an otherwise-successful
  // analysis - same "enrichment, not a precondition" stance the OCR/
  // forensics calls on /api/documents below take.
  let documentId = null;
  try {
    const stored = ingestDocument({ buffer, sourceChannel: "web_upload" });
    if (!stored.error) documentId = stored.id;
  } catch (err) {
    console.error(err);
  }

  // Same server-side redaction as screenshot OCR text: identifiers never
  // reach the pipeline, the LLM or the response.
  const { text, truncated } = capDocumentText(redact(doc.text).redacted);
  try {
    const result = await runPipeline(text, {
      source: "document",
      language,
      ip: req.ip,
      extraSignals: doc.signals,
      extraDetectorVersions: { document: DOCUMENT_DETECTOR_VERSION },
      ...(doc.ocrQuality ? { ocrQuality: doc.ocrQuality } : {}),
      // No text at all (unreadable scan): the structural findings still get
      // a full deterministic verdict; there is nothing for the model to read.
      ...(text.trim() ? {} : { semantic: { enabled: false } }),
    });
    res.json({
      ...result,
      documentId,
      extractedText: text,
      document: {
        fileType: doc.fileType,
        pageCount: doc.pageCount,
        pagesAnalyzed: doc.pagesAnalyzed,
        textSource: doc.textSource,
        textTruncated: truncated,
        metadata: doc.metadata,
        previews: doc.previews,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "analysis failed, try again shortly" });
  }
});

// Byte-exact document ingestion, focused on images (JPEG/PNG/WEBP) and
// PDF metadata-only checks - the file types /analyze/document above does
// NOT cover (it's PDF/DOCX structural forensics with a verdict; this is a
// photographed document, e.g. a phone photo of a bank statement, plus the
// local document-forensics ML service (TruFor/Donut - see document-
// forensics/README.md) for indicators-with-confidence, never a verdict.
// Complementary to /analyze/document, not a duplicate of it: different
// file types, different (deliberately verdict-free) output shape.
router.post("/documents", documentLimiter, json({ limit: "20mb" }), async (req, res) => {
  const { document, filename } = req.body;
  if (!isNonEmptyString(document)) {
    return res.status(400).json({ error: "document is required and must be a base64-encoded string" });
  }

  const base64 = document.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) {
    return res.status(400).json({ error: "document could not be decoded as base64" });
  }
  if (buffer.length > MAX_IMAGE_DOCUMENT_BYTES) {
    return res
      .status(400)
      .json({ error: `document exceeds maximum size of ${MAX_IMAGE_DOCUMENT_BYTES / (1024 * 1024)}MB` });
  }

  const stored = ingestDocument({
    buffer,
    sourceChannel: "web_upload",
    originalFilename: typeof filename === "string" ? filename.slice(0, 255) : undefined,
  });
  if (stored.error === "unsupported_type") {
    return res
      .status(400)
      .json({ error: "document must be a valid PDF, PNG, JPEG, or WEBP file (checked by content, not the declared type)" });
  }

  // OCR (Node, reads the stored bytes back) and forensics (the Python
  // service, given the bytes directly - see services/document-forensics-
  // client) are independent enrichments over the same stored document, so
  // they run concurrently rather than one waiting on the other. Neither
  // failing is a reason to fail the upload: ingestion already succeeded
  // and the bytes are safely stored (same "enrichment, not a precondition"
  // stance as /analyze/screenshot's own pipeline-survives-LLM-outage
  // guarantee, extended here to a second, independent enrichment step).
  const [extractedText, forensics] = await Promise.all([
    extractDocumentText(stored.id).catch((err) => {
      console.error(err);
      return null;
    }),
    analyzeDocumentForensics({ buffer, mimeType: stored.mimeType, documentId: stored.id }),
  ]);

  res.status(201).json({
    documentId: stored.id,
    mimeType: stored.mimeType,
    byteLength: stored.byteLength,
    receivedAt: stored.receivedAt,
    extractedText: extractedText ? redact(extractedText).redacted : null,
    forensics,
  });
});

router.post("/batch-scan", batchLimiter, json({ limit: "300kb" }), async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  if (messages.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ error: `messages exceeds maximum batch size of ${MAX_BATCH_SIZE}` });
  }
  if (!messages.every(isNonEmptyString)) {
    return res.status(400).json({ error: "every message in the batch must be a non-empty string" });
  }
  if (messages.some((m) => m.length > MAX_MESSAGE_LENGTH)) {
    return res.status(400).json({ error: `every message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
  }

  // Never throws: a single message's analysis failure must not fail the
  // whole batch (see docs/API-CONTRACT.md — no top-level 5xx for this
  // route). runPipeline() already survives an LLM outage on its own (the
  // deterministic assessment still counts as analysed), so "unknown" /
  // analysisFailed is now reserved for an unexpected pipeline error; the
  // summary never counts it as scam/suspicious/safe.
  const analyze = async (message) => {
    try {
      return await runPipeline(message, { source: "batch", ip: req.ip });
    } catch (err) {
      console.error(err);
      return {
        verdict: "unknown",
        signals: [],
        suggestedAction: "verify_official_channel",
        explanation: "Analysis failed for this message.",
        analysisFailed: true,
      };
    }
  };

  const { results, summary } = await summarizeBatch(messages, { analyze });
  saveBatchHistory(summary);
  res.json({ results, summary });
});

// Non-LLM, synchronous domain check for the browser extension (see
// extension/README.md) — the extension must reuse this logic via the API,
// never reimplement it locally. Deliberately skips runPipeline(): a bare
// URL isn't a scam "message" to classify, and the extension needs a fast,
// deterministic per-navigation check, not an LLM round trip.
//
// services/url-reputation adds what a single visited URL can show without a
// message: shortener / raw-IP / "@" tricks, known-phishing lists, brand-new
// domains, repeated user reports, and the positive "official domain" fact.
router.post("/check-url", checkUrlLimiter, json({ limit: "10kb" }), async (req, res) => {
  const { url } = req.body;
  if (!isNonEmptyString(url)) {
    return res.status(400).json({ error: "url is required and must be a non-empty string" });
  }
  if (url.length > 2048) {
    return res.status(400).json({ error: "url exceeds maximum length of 2048 characters" });
  }
  try {
    res.json(await assessUrl(url));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "link check failed, try again shortly" });
  }
});

// Passive site-security scan for the extension's popup (see
// extension/README.md "Security Report" and
// backend/src/services/site-security/index.js's header comment for the
// "no crafted payloads, no fuzzing, no brute-forcing" constraint this runs
// under). `url` is attacker-influenced input (public POST route), so
// analyzeSite() runs it through its own SSRF guard before any outbound
// request - a malformed/unsafe url is a 400 here, not a 500.
router.post("/analyze-site", siteSecurityLimiter, json({ limit: "300kb" }), async (req, res) => {
  const { url, clientSignals, clientCollectionError } = req.body;
  if (!isNonEmptyString(url)) {
    return res.status(400).json({ error: "url is required and must be a non-empty string" });
  }
  try {
    res.json(await analyzeSite(url, clientSignals, { clientCollectionError: typeof clientCollectionError === "string" ? clientCollectionError : undefined }));
  } catch (err) {
    if (err instanceof UnsafeUrlError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "security report failed, try again shortly" });
  }
});

// Read-only counterpart to /api/report: looks up a sender's existing report
// count WITHOUT incrementing it. Added for the "Before You Pay" flow, which
// needs to show "this recipient has been reported N times" for an
// identifier the user is about to pay, without that lookup itself counting
// as a report (see extension/README.md's "reuse the API" rule — same
// principle applies to any new frontend surface, not just the extension).
router.post("/check-sender", checkSenderLimiter, json({ limit: "10kb" }), (req, res) => {
  const { sender } = req.body;
  if (!isNonEmptyString(sender)) {
    return res.status(400).json({ error: "sender is required and must be a non-empty string" });
  }
  res.json({ sender, reportCount: getReportCount(sender) });
});

router.post("/report", reportLimiter, json({ limit: "300kb" }), (req, res) => {
  const { sender } = req.body;
  if (!isNonEmptyString(sender)) {
    return res.status(400).json({ error: "sender is required and must be a non-empty string" });
  }
  const reportCount = reportSender(sender);
  // Also recorded as a timestamped evidence event for cluster/wave
  // detection (services/community-signals). Best-effort: the response
  // shape and the legacy count above don't depend on it. An oversized or
  // non-string `message` is simply not fingerprinted, rather than turning
  // a previously-valid report into a 400.
  const { message } = req.body;
  try {
    recordUserReport({
      sender,
      message: typeof message === "string" && message.length <= MAX_MESSAGE_LENGTH ? message : undefined,
      ip: req.ip,
    });
  } catch (err) {
    console.error(`[community-signals] report event not recorded: ${err.message}`);
  }
  res.json({ sender, reportCount, recorded: true });
});

router.get("/campaign/:fingerprintId", checkSenderLimiter, (req, res) => {
  if (req.params.fingerprintId.length > 300) return res.status(400).json({ error: "invalid fingerprint ID" });
  const campaign = getFingerprintMatches(req.params.fingerprintId);
  if (!campaign) return res.status(404).json({ error: "campaign not found" });
  res.json(campaign);
});

// Organisation-scoped workplace intelligence. The demo has one configured
// profile; callers cannot choose an arbitrary org id and cross tenant data.
router.get("/org/campaigns", checkSenderLimiter, (_req, res) => {
  res.json({
    organisationId: DEMO_ORGANISATION.organisationId,
    campaigns: listCampaigns(DEMO_ORGANISATION.organisationId),
  });
});

router.post("/org/outcomes", reportLimiter, json({ limit: "10kb" }), (req, res) => {
  const { observationId, label } = req.body ?? {};
  if (typeof observationId !== "string" || !/^[a-f0-9]{64}$/.test(observationId)) {
    return res.status(400).json({ error: "observationId must be a 64-character hexadecimal identifier" });
  }
  if (!OUTCOME_LABELS.includes(label)) {
    return res.status(400).json({ error: `label must be one of: ${OUTCOME_LABELS.join(", ")}` });
  }
  const result = recordOutcome({
    orgId: DEMO_ORGANISATION.organisationId,
    inputHash: observationId,
    analystId: req.ip,
    label,
  });
  if (result.error === "not_found") return res.status(404).json({ error: "organisation observation not found" });
  res.json(result);
});

// A phone-number-shaped sender is masked to its last 4 digits for this
// PUBLIC leaderboard (unlike /check-sender's exact-match lookup, this
// exposes senders nobody specifically searched for). A brand/identity name
// ("MCB", "Emtel Prize Team") isn't personally identifying, so it's shown
// as-is - same distinction the frontend already draws in lib/result.ts's
// "last_four_only" SAFE check.
function maskSender(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return raw;
  return `•••• ${digits.slice(-4)}`;
}

// Real aggregate counts only - see db/index.js's getTrendSummary() doc
// comment. Cheap indexed reads, same cost class as /check-sender.
router.get("/trends", checkSenderLimiter, (_req, res) => {
  const { topSenders, topCampaigns, scamTypeCounts, totals } = getTrendSummary();
  res.json({
    totals,
    // A blank/whitespace-only sender can exist in old report rows from
    // before input validation tightened - never surface it as a leaderboard
    // entry with nothing to show.
    topSenders: topSenders.filter((r) => r.sender.trim() !== "").map((r) => ({ sender: maskSender(r.sender), reportCount: r.report_count })),
    topCampaigns: topCampaigns.map((c) => ({
      fingerprintId: c.fingerprint_id,
      scamType: c.scam_type,
      claimedIdentity: c.claimed_identity,
      messageCount: c.message_count,
    })),
    scamTypeCounts: scamTypeCounts.map((s) => ({ scamType: s.scam_type, campaigns: s.campaigns, messages: s.messages })),
  });
});

const sandboxLimiter = rateLimited("too many simulation requests, try again shortly", { windowMs: 15 * 60 * 1000, limit: 30 });
router.get("/sandbox/playbooks", checkSenderLimiter, (_req, res) => {
  res.json({ maxTurns: MAX_SANDBOX_TURNS, playbooks: Object.entries(PLAYBOOKS).map(([scamType, p]) => ({ scamType, label: p.label, typicalStages: p.typicalStages })) });
});
router.post("/sandbox/next", sandboxLimiter, json({ limit: "10kb" }), async (req, res) => {
  const scamType = normalizeScamType(req.body?.scamType);
  const stage = normalizeStage(req.body?.stage);
  const turnIndex = req.body?.turnIndex;
  if (!scamType || !stage || !PLAYBOOKS[scamType].typicalStages.includes(stage) || !Number.isSafeInteger(turnIndex) || turnIndex < 0) {
    return res.status(400).json({ error: "valid scamType, playbook stage and non-negative integer turnIndex are required" });
  }
  res.json(await nextSandboxTurn({ scamType, stage, turnIndex }));
});
