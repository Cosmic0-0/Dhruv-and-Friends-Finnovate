import type { NextConfig } from "next";

/**
 * The browser only ever calls same-origin `/api/*`; Next proxies it to the
 * backend. This sidesteps the backend's missing CORS, and it means a phone
 * on the same network (or the installed PWA) reaches the API through the
 * frontend host, since `localhost:4000` would resolve to the phone itself.
 *
 * BACKEND_URL is read when the config loads: at `next dev` startup, and at
 * `next build` for production (rewrites are baked into the build output).
 */
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/+$/, "");

/** Extra hosts allowed to load dev assets, e.g. "10.2.0.2" to test from a phone. Comma-separated. */
const ALLOWED_DEV_ORIGINS = (process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  allowedDevOrigins: ALLOWED_DEV_ORIGINS,
  experimental: {
    // The rewrite proxy's default timeout is 30s, shorter than a slow local
    // LLM call. Keep it above lib/api.ts's longest client timeout (batch,
    // 180s) so the client's own timeout is always the one that fires.
    proxyTimeout: 190_000,
    // Next clones every request body up to this size and silently truncates
    // anything longer before proxying it (default 10MB), which cut document
    // uploads short: a 10MB file is ~13.4MB as base64 JSON. Kept just above
    // the backend's 14MB JSON limit, so an oversized body gets the backend's
    // clean 413 instead of a dropped connection.
    middlewareClientMaxBodySize: "15mb",
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        // The service worker must never be served stale, or clients get
        // stuck on an old app shell after a deploy.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
