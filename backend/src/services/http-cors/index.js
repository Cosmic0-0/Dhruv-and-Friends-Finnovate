// Narrow browser CORS for web-hosted clients such as the Outlook task pane.
// Native/extension calls without an Origin header are unchanged. Production
// origins must be configured explicitly; development permits only the local
// Outlook add-in origin.

export function configuredOrigins(env = process.env) {
  const configured = String(env.OUTLOOK_ADDIN_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter((value) => /^https:\/\//i.test(value));
  if (configured.length) return new Set(configured);
  return env.NODE_ENV === "production" ? new Set() : new Set(["https://localhost:3001"]);
}

export function createApiCors({ origins = configuredOrigins() } = {}) {
  return function apiCors(req, res, next) {
    const origin = req.headers.origin?.replace(/\/$/, "");
    if (!origin) return next();

    res.vary("Origin");
    if (!origins.has(origin)) {
      if (req.method === "OPTIONS") return res.status(403).json({ error: "origin not allowed" });
      return next();
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}
