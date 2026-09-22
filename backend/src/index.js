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

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`fraudlens-backend listening on :${port}`);
});
