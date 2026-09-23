// Loads senders.json into the backend's `reports` table so the "reported N
// times" surfaces have numbers for the demo. Goes through the backend's own
// db module, so sender normalization matches what the API does at runtime.
//
//   node data/sender-reputation-seed/load.mjs           top each sender up to its reportCount
//   node data/sender-reputation-seed/load.mjs --reset   wipe ALL reports first, then load
//
// Running it twice does not double the counts. Use --reset before a
// rehearsal to undo reports made live on stage.

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(here, "../../backend");

export function readSeed() {
  return JSON.parse(readFileSync(join(here, "senders.json"), "utf8"));
}

// `store` is backend/src/db/index.js: { db, reportSender, getReportCount }.
export function applySeed(entries, store, { reset = false } = {}) {
  if (reset) store.db.prepare("DELETE FROM reports").run();
  return entries.map(({ sender, reportCount }) => {
    let count = store.getReportCount(sender);
    while (count < reportCount) count = store.reportSender(sender);
    return { sender, reportCount: count };
  });
}

async function main() {
  const reset = process.argv.includes("--reset");

  // Same DB file the backend uses: backend/.env's DATABASE_URL, resolved
  // relative to backend/ because that's where `npm run dev` starts.
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(join(backendDir, ".env"));
    } catch {}
  }
  const url = process.env.DATABASE_URL || "./fraudlens.db";
  process.env.DATABASE_URL = url === ":memory:" || isAbsolute(url) ? url : resolve(backendDir, url);

  const store = await import(pathToFileURL(join(backendDir, "src/db/index.js")).href);
  const results = applySeed(readSeed(), store, { reset });

  console.log(`${reset ? "Reset and loaded" : "Loaded"} ${results.length} senders into ${process.env.DATABASE_URL}`);
  for (const r of results) console.log(`  ${r.sender.padEnd(16)} ${r.reportCount}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
