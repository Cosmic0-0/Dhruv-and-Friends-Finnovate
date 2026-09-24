import express from "express";
import helmet from "helmet";
import { router } from "./routes/index.js";
import { conversationRouter } from "./routes/conversation.js";
import { checkOllamaHealth, llmStatus } from "./services/analysis/llmClient.js";
import { checkDocumentForensicsHealth } from "./services/document-forensics-client/index.js";
import { createApiCors } from "./services/http-cors/index.js";
import { jsonErrorHandler } from "./services/http-errors/index.js";

const app = express();

// Needed for req.secure / express-rate-limit's IP detection to see the real
// client behind a reverse proxy (Vercel/Render/etc. terminate TLS in front
// of this process) - without it every request looks like it came from the
// proxy's own IP, over HTTP.
app.set("trust proxy", 1);

if (process.env.NODE_ENV === "production") {
  // The demo host terminates TLS in front of this process, so "is this
  // request HTTPS" has to be read from the forwarded header, not req.secure.
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] === "http") {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    next();
  });
}

// Sets CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, etc.
// This is a JSON API (no HTML views), so helmet's default CSP is harmless
// here and doesn't need per-route tuning.
app.use(helmet());

// Each route declares its own express.json() limit (see routes/index.js) -
// text routes stay small, the screenshot route needs room for a base64
// image - so there's no blanket body-size limit here.
app.use("/api", createApiCors(), router);
app.use("/api", createApiCors(), conversationRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/llm", async (_req, res) => {
  const reachable = await checkOllamaHealth();
  const status = llmStatus();
  const activeProvider = reachable ? "ollama" : status.fallbackConfigured ? status.fallbackProvider : "none";
  res.json({ reachable, activeProvider, ...status });
});

// document-forensics (see document-forensics/README.md) is a separate
// local process this backend calls over HTTP, same as Ollama - a down/not-
// yet-started forensics service never fails POST /api/documents (it just
// returns forensics.status: "unavailable"), but this endpoint gives a
// direct yes/no for the pre-demo checklist and local dev, same purpose as
// /health/llm above.
app.get("/health/document-forensics", async (_req, res) => {
  const reachable = await checkDocumentForensicsHealth();
  res.json({ reachable });
});

// Final error-handling middleware: malformed JSON -> 400, a body over a
// route's size limit -> 413, anything else -> generic 500 (never an HTML
// stack trace). See services/http-errors.
app.use(jsonErrorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`fraudlens-backend listening on :${port}`);
});
