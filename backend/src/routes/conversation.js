import { Router, json } from "express";
import rateLimit from "express-rate-limit";
import { runPipeline } from "../services/pipeline/index.js";
import { analyzeConversation, validateConversation } from "../services/conversation/index.js";
import { parseShareSamples } from "../services/sharing/index.js";

// POST /api/analyze/conversation - one pipeline run over a whole chat
// (services/conversation). Same cost class as /api/analyze: one semantic
// model call per request, so the same per-IP budget.
export const conversationRouter = Router();

const conversationLimiter = rateLimit({
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  handler: (_req, res) => res.status(429).json({ error: "too many conversation checks, try again shortly" }),
});

conversationRouter.post("/analyze/conversation", conversationLimiter, json({ limit: "3mb" }), async (req, res) => {
  const input = validateConversation(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  // Settings > "Share anonymous scam samples" off: store nothing from this chat.
  const sharing = parseShareSamples(req.body.shareSamples);
  if (sharing.error) return res.status(400).json({ error: sharing.error });
  try {
    res.json(
      await analyzeConversation(input.value.messages, {
        analyze: (text) => runPipeline(text, { source: "conversation", language: input.value.language, ip: req.ip, record: sharing.record }),
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "conversation analysis failed" });
  }
});
