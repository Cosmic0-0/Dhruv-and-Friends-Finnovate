// Points at the FraudLens AI backend. Update for a deployed environment,
// and keep manifest.json's host_permissions matching this origin —
// Manifest V3 blocks fetch() to origins not listed there.
export const API_BASE_URL = "https://api.fraudlens.site";

// Where the main FraudLens web app runs. Used only for the "Open in
// FraudLens" handoff link (chrome.tabs.create) — no permission needed for
// that, it's a normal navigation, not a fetch(). No host_permissions entry
// required for this origin.
export const FRONTEND_ORIGIN = "https://fraudlens.site";

// Hard caps so the extension never sends more than a bounded amount of text
// in one request, whatever the source (scanned page / selected text).
export const MAX_ANALYZE_CHARS = 5000; // backend's own /api/analyze cap
export const MAX_HANDOFF_CHARS = 400; // kept short: this goes in a URL query param

