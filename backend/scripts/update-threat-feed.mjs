// Refreshes the downloaded threat feeds in data/threat-intel/:
//   openphish.txt  OpenPhish community feed (phishing pages; free, non-commercial)
//   urlhaus.txt    abuse.ch URLhaus online URLs (malware distribution; free bulk download, no key)
//
//   npm run update:threat-feed
//
// The backend picks new files up within a minute, no restart needed. The
// files are gitignored: third-party data that goes stale within hours. A feed
// that fails keeps its previous file, so one outage never empties the lists.

import { writeFileSync, mkdirSync } from "node:fs";

const FEEDS = [
  { file: "openphish.txt", label: "OpenPhish community feed", source: "https://openphish.com/feed.txt", kind: "phishing" },
  { file: "urlhaus.txt", label: "abuse.ch URLhaus (online)", source: "https://urlhaus.abuse.ch/downloads/text_online/", kind: "malware" },
];
const OUT_DIR = new URL("../../data/threat-intel/", import.meta.url);
const MAX_ENTRIES = 50_000;

// Keep only well-formed http(s) URLs; drop query strings and fragments (they
// carry per-victim tokens and never help matching).
function cleanUrls(text) {
  const urls = new Set();
  for (const line of text.split(/\r?\n/).map((l) => l.trim())) {
    if (!/^https?:\/\//i.test(line)) continue;
    try {
      const u = new URL(line);
      urls.add(`${u.protocol}//${u.host}${u.pathname}`);
    } catch {
      // skip malformed lines
    }
    if (urls.size >= MAX_ENTRIES) break;
  }
  return urls;
}

async function refresh(feed) {
  const res = await fetch(feed.source, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const urls = cleanUrls(await res.text());
  if (urls.size === 0) throw new Error("feed returned no URLs");
  writeFileSync(
    new URL(feed.file, OUT_DIR),
    `# ${feed.label} (${feed.source})\n# fetched: ${new Date().toISOString()}\n# entries: ${urls.size}\n${[...urls].join("\n")}\n`
  );
  return urls.size;
}

mkdirSync(OUT_DIR, { recursive: true });
let failures = 0;
for (const feed of FEEDS) {
  try {
    console.log(`wrote ${await refresh(feed)} ${feed.kind} URLs to data/threat-intel/${feed.file}`);
  } catch (err) {
    failures += 1;
    console.error(`${feed.file}: ${err.message} - keeping the previous file`);
  }
}
if (failures === FEEDS.length) process.exit(1);
