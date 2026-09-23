import { nextSandboxTurn, MAX_SANDBOX_TURNS } from "../services/sandbox/index.js";
import { PLAYBOOKS, normalizeScamType, normalizeStage } from "../services/playbooks/index.js";
import { getFingerprintMatches } from "../services/scam-dna/index.js";
import { recordUserReport } from "../services/community-signals/index.js";
import { Router, json } from "express";
import rateLimit from "express-rate-limit";
import { checkUrls } from "../services/domain-matching/index.js";
import { runPipeline } from "../services/pipeline/index.js";
import { validatePaymentContext } from "../services/payment-context/index.js";
import { validateEmailContext } from "../services/email-context/index.js";
import { listCampaigns, OUTCOME_LABELS, recordOutcome } from "../services/org-intel/index.js";
import { DEMO_ORGANISATION } from "../services/workplace-registry/index.js";
import { summarizeBatch, MAX_BATCH_SIZE } from "../services/batch/index.js";
import { extractTextFromImage } from "../services/ocr/index.js";
import { redact } from "../services/redact/index.js";
import { reportSender, saveBatchHistory, getReportCount, getTrendSummary } from "../db/index.js";
import { analyzeSite, UnsafeUrlError } from "../services/site-security/index.js";

export const router = Router();

const MAX_MESSAGE_LENGTH = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB, before base64 overhead

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
// checkUrls() is pure/non-LLM and cheap, so this only needs to stop naive
// hammering, not protect an expensive resource.
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
router.post("/check-url", checkUrlLimiter, json({ limit: "10kb" }), (req, res) => {
  const { url } = req.body;
  if (!isNonEmptyString(url)) {
    return res.status(400).json({ error: "url is required and must be a non-empty string" });
  }
  const signals = checkUrls(url);
  res.json({ url, flagged: signals.length > 0, signals });
});

// Passive site-security scan for the extension's popup (see
// extension/README.md "Security Report" and
// backend/src/services/site-security/index.js's header comment for the
// "no crafted payloads, no fuzzing, no brute-forcing" constraint this runs
// under). `url` is attacker-influenced input (public POST route), so
// analyzeSite() runs it through its own SSRF guard before any outbound
// request - a malformed/unsafe url is a 400 here, not a 500.
router.post("/analyze-site", siteSecurityLimiter, json({ limit: "300kb" }), async (req, res) => {
  const { url, clientSignals } = req.body;
  if (!isNonEmptyString(url)) {
    return res.status(400).json({ error: "url is required and must be a non-empty string" });
  }
  try {
    res.json(await analyzeSite(url, clientSignals));
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
