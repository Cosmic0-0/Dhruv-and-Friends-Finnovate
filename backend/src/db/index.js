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

// Normalizes a sender identifier to a canonical digits-only form (assuming
// the 230 Mauritius country code for 8-digit local numbers) so the same
// number submitted in different formats ("+230 5789 1234", "+23057891234",
// "57891234") dedupes to one row instead of three (see
// data/test-payloads/FINDINGS.md #4). This is purely an internal DB key —
// the API still echoes back the raw string the client submitted.
function normalizeSender(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length > 0 && digits.length <= 8 && !digits.startsWith("230")) {
    return `230${digits}`;
  }
  return digits;
}

export function reportSender(sender) {
  const key = normalizeSender(sender);
  db.prepare(
    `INSERT INTO reports (sender, report_count) VALUES (?, 1)
     ON CONFLICT(sender) DO UPDATE SET report_count = report_count + 1`
  ).run(key);
  return db.prepare("SELECT report_count FROM reports WHERE sender = ?").get(key).report_count;
}

export function getReportCount(sender) {
  const key = normalizeSender(sender);
  const row = db.prepare("SELECT report_count FROM reports WHERE sender = ?").get(key);
  return row ? row.report_count : 0;
}

export function saveBatchHistory(summary) {
  db.prepare(
    `INSERT INTO batch_history (total, scam_count, suspicious_count, safe_count) VALUES (?, ?, ?, ?)`
  ).run(summary.total, summary.scamCount, summary.suspiciousCount, summary.safeCount);
}
