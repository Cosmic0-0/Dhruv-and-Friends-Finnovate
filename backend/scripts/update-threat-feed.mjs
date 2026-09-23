// Refreshes data/threat-intel/openphish.txt from the OpenPhish community
// feed (free, non-commercial; updated every few hours upstream).
//
//   npm run update:threat-feed
//
// The backend picks the new file up within a minute, no restart needed. The
// file is gitignored: it's third-party data that goes stale within hours.

import { writeFileSync, mkdirSync } from "node:fs";

const SOURCE = "https://openphish.com/feed.txt";
const OUT_DIR = new URL("../../data/threat-intel/", import.meta.url);
const OUT = new URL("openphish.txt", OUT_DIR);
const MAX_ENTRIES = 50_000;

const res = await fetch(SOURCE, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
if (!res.ok) throw new Error(`failed to fetch ${SOURCE}: HTTP ${res.status}`);
const lines = (await res.text()).split(/\r?\n/).map((l) => l.trim());

// Keep only well-formed http(s) URLs; drop query strings and fragments (they
// carry per-victim tokens and never help matching).
const urls = new Set();
for (const line of lines) {
  if (!/^https?:\/\//i.test(line)) continue;
  try {
    const u = new URL(line);
    urls.add(`${u.protocol}//${u.host}${u.pathname}`);
  } catch {
    // skip malformed lines
  }
  if (urls.size >= MAX_ENTRIES) break;
}
if (urls.size === 0) throw new Error("feed returned no URLs - keeping the previous file");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT,
  `# OpenPhish community feed (${SOURCE})\n# fetched: ${new Date().toISOString()}\n# entries: ${urls.size}\n${[...urls].join("\n")}\n`
);
console.log(`wrote ${urls.size} phishing URLs to data/threat-intel/openphish.txt`);
