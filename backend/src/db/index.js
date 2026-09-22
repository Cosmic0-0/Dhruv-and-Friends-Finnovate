import Database from "better-sqlite3";

const db = new Database(process.env.DATABASE_URL || "./fraudlens.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    sender TEXT PRIMARY KEY,
    report_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS batch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total INTEGER, scam_count INTEGER, suspicious_count INTEGER, safe_count INTEGER
  );
`);

export function reportSender(sender) {
  db.prepare(
    `INSERT INTO reports (sender, report_count) VALUES (?, 1)
     ON CONFLICT(sender) DO UPDATE SET report_count = report_count + 1`
  ).run(sender);
  return db.prepare("SELECT report_count FROM reports WHERE sender = ?").get(sender).report_count;
}

export function getReportCount(sender) {
  const row = db.prepare("SELECT report_count FROM reports WHERE sender = ?").get(sender);
  return row ? row.report_count : 0;
}

export function saveBatchHistory(summary) {
  db.prepare(
    `INSERT INTO batch_history (total, scam_count, suspicious_count, safe_count) VALUES (?, ?, ?, ?)`
  ).run(summary.total, summary.scamCount, summary.suspiciousCount, summary.safeCount);
}
