import { Router } from "express";
import { analyzeMessage } from "../services/analysis/index.js";
import { checkUrls } from "../services/domain-matching/index.js";
import { reportSender, saveBatchHistory } from "../db/index.js";

export const router = Router();

const MAX_MESSAGE_LENGTH = 5000;
const MAX_BATCH_MESSAGES = 50;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

router.post("/analyze", async (req, res) => {
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

router.post("/batch-scan", async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  if (messages.length > MAX_BATCH_MESSAGES) {
    return res.status(400).json({ error: `messages exceeds maximum batch size of ${MAX_BATCH_MESSAGES}` });
  }
  if (!messages.every(isNonEmptyString)) {
    return res.status(400).json({ error: "every message in the batch must be a non-empty string" });
  }
  if (messages.some((m) => m.length > MAX_MESSAGE_LENGTH)) {
    return res.status(400).json({ error: `every message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
  }

  const results = [];
  for (const message of messages) {
    try {
      const r = await analyzeMessage(message);
      r.signals.push(...checkUrls(message));
      results.push({ message, ...r });
    } catch (err) {
      results.push({
        message,
        verdict: "suspicious",
        signals: [],
        suggestedAction: "verify_official_channel",
        explanation: `Analysis failed: ${err.message}`,
      });
    }
  }

  const summary = {
    total: results.length,
    scamCount: results.filter((r) => r.verdict === "scam").length,
    suspiciousCount: results.filter((r) => r.verdict === "suspicious").length,
    safeCount: results.filter((r) => r.verdict === "safe").length,
  };
  saveBatchHistory(summary);
  res.json({ results, summary });
});

router.post("/report", (req, res) => {
  const { sender } = req.body;
  if (!isNonEmptyString(sender)) {
    return res.status(400).json({ error: "sender is required and must be a non-empty string" });
  }
  const reportCount = reportSender(sender);
  res.json({ sender, reportCount, recorded: true });
});
