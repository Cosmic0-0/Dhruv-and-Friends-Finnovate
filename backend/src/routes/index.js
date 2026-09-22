import { Router } from "express";
import { analyzeMessage } from "../services/analysis/index.js";
import { checkUrls } from "../services/domain-matching/index.js";
import { reportSender, saveBatchHistory } from "../db/index.js";

export const router = Router();

router.post("/analyze", async (req, res) => {
  const { message, language } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });
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
  if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be an array" });

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
  if (!sender) return res.status(400).json({ error: "sender is required" });
  const reportCount = reportSender(sender);
  res.json({ sender, reportCount, recorded: true });
});
