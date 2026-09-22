import { Router, json } from "express";
import { analyzeMessage } from "../services/analysis/index.js";
import { checkUrls } from "../services/domain-matching/index.js";
import { summarizeBatch, MAX_BATCH_SIZE } from "../services/batch/index.js";
import { extractTextFromImage } from "../services/ocr/index.js";
import { reportSender, saveBatchHistory } from "../db/index.js";

export const router = Router();

const MAX_MESSAGE_LENGTH = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB, before base64 overhead

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

router.post("/analyze", json({ limit: "300kb" }), async (req, res) => {
  const { message, language } = req.body;
  if (!isNonEmptyString(message)) {
    return res.status(400).json({ error: "message is required and must be a non-empty string" });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` });
  }
  try {
    const result = await analyzeMessage(message, language);
    result.signals.push(...checkUrls(message));
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post("/analyze/screenshot", json({ limit: "8mb" }), async (req, res) => {
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
    return res.status(502).json({ error: `OCR failed: ${err.message}` });
  }
  if (!isNonEmptyString(extractedText)) {
    return res.status(400).json({ error: "no readable text was found in the image" });
  }
  if (extractedText.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `extracted text exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` });
  }

  try {
    const result = await analyzeMessage(extractedText, language);
    result.signals.push(...checkUrls(extractedText));
    res.json({ extractedText, ...result });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post("/batch-scan", json({ limit: "300kb" }), async (req, res) => {
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
  // whole batch (see docs/API-CONTRACT.md — no top-level 5xx for this route).
  //
  // checkUrls() is computed BEFORE the try so it's still included on the
  // failure path — it's pure, deterministic, and needs no LLM, so an LLM
  // outage shouldn't discard a confirmed lookalike-URL signal (see
  // data/test-payloads/FINDINGS.md #7). The failure branch also sets
  // analysisFailed: true so the summary can report an explicit
  // unanalyzedCount instead of the outage being indistinguishable from a
  // real "suspicious" verdict (see FINDINGS.md #6).
  const analyze = async (message) => {
    const urlSignals = checkUrls(message);
    try {
      const result = await analyzeMessage(message);
      result.signals.push(...urlSignals);
      return result;
    } catch (err) {
      return {
        verdict: "suspicious",
        signals: urlSignals,
        suggestedAction: "verify_official_channel",
        explanation: `Analysis failed: ${err.message}`,
        analysisFailed: true,
      };
    }
  };

  const { results, summary } = await summarizeBatch(messages, { analyze });
  saveBatchHistory(summary);
  res.json({ results, summary });
});

router.post("/report", json({ limit: "300kb" }), (req, res) => {
  const { sender } = req.body;
  if (!isNonEmptyString(sender)) {
    return res.status(400).json({ error: "sender is required and must be a non-empty string" });
  }
  const reportCount = reportSender(sender);
  res.json({ sender, reportCount, recorded: true });
});
