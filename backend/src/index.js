import express from "express";
import { router } from "./routes/index.js";
import { checkOllamaHealth, llmStatus } from "./services/analysis/llmClient.js";

const app = express();
// Each route declares its own express.json() limit (see routes/index.js) -
// text routes stay small, the screenshot route needs room for a base64
// image - so there's no blanket body-size limit here.
app.use("/api", router);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/llm", async (_req, res) => {
  const reachable = await checkOllamaHealth();
  const status = llmStatus();
  const activeProvider = reachable ? "ollama" : status.fallbackConfigured ? status.fallbackProvider : "none";
  res.json({ reachable, activeProvider, ...status });
});

// Final error-handling middleware (must be 4-arg, and registered after every
// route it's meant to catch, per Express's error-middleware rules). Without
// this, a body that fails express.json() parsing (e.g. malformed JSON) falls
// through to Express's default handler, which returns an HTML stack trace
// with absolute filesystem paths — see data/test-payloads/FINDINGS.md #5.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "invalid JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`fraudlens-backend listening on :${port}`);
});
