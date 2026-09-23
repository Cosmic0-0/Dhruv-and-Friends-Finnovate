// Radar (GET /api/trends?range=...): real, privacy-minimised aggregates of
// what FraudLens has flagged, for the web Radar page.
//
// Storage is two daily COUNTER tables, not events: one row per
// (day, verdict, scam type, claimed institution, channel) and one per
// (day, lookalike domain, institution it imitates), each with a count. No
// message text, no sender, no IP, no reporter pseudonym is stored here - only
// the taxonomy values the pipeline already derived (and that ScamDNA already
// keeps), bucketed by day. Rows are purged after RADAR_RETENTION_DAYS
// (default 730, so a 12-month range can still be compared with the previous
// 12 months). A request with shareSamples: false records nothing
// (services/sharing; the pipeline passes record: false).
//
// Every number returned is a SUM over those rows. An empty database returns
// zeros and empty lists; the client shows that as an empty state, never as
// invented activity (CLAUDE.md "Never fabricate live reports ... trends").

import { db } from "../../db/index.js";
import { institutionForHost } from "../institutions/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// Mauritius is UTC+4 all year (no DST): a "day" is a Mauritius calendar day.
const MU_OFFSET_MS = 4 * 60 * 60 * 1000;
const RETENTION_DAYS = Number(process.env.RADAR_RETENTION_DAYS) || 730;

export const RADAR_RANGES = Object.freeze(["7d", "30d", "12m"]);

db.exec(`
  CREATE TABLE IF NOT EXISTS radar_daily (
    day TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('scam', 'suspicious')),
    scam_type TEXT NOT NULL DEFAULT '',
    claimed_identity TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, verdict, scam_type, claimed_identity, channel)
  );
  CREATE TABLE IF NOT EXISTS radar_domain_daily (
    day TEXT NOT NULL,
    domain TEXT NOT NULL,
    imitates TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, domain, imitates)
  );
`);

/** Mauritius calendar day (YYYY-MM-DD) of a timestamp. */
export function muDay(ms) {
  return new Date(ms + MU_OFFSET_MS).toISOString().slice(0, 10);
}

const clean = (v, max = 120) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
// A redaction placeholder is not an identity or a domain.
const isPlaceholder = (v) => /\[(?:phone|redacted|account|email|card|otp)/i.test(v);

/**
 * Adds one flagged check to the daily counters. Safe results are not
 * counted (Radar is about what scammers send). Never throws.
 * @param {object} result pipeline result (verdict, scamProfile, signals, analysis.channel)
 */
export function recordRadarObservation(result, now = Date.now()) {
  try {
    if (!result || (result.verdict !== "scam" && result.verdict !== "suspicious")) return false;
    const day = muDay(now);
    const scamType = clean(result.scamProfile?.type, 60);
    let identity = clean(result.scamProfile?.claimedIdentity);
    if (isPlaceholder(identity)) identity = "";
    const channel = clean(result.analysis?.channel, 20);
    const lookalikes = (Array.isArray(result.signals) ? result.signals : [])
      .filter((s) => s && s.type === "lookalike_url" && typeof s.domain === "string" && s.domain.trim())
      .map((s) => {
        const domain = clean(s.domain, 253).toLowerCase();
        const official = typeof s.officialDomain === "string" ? institutionForHost(s.officialDomain) : null;
        const imitates = clean(official?.display_name ?? s.claimedIdentity ?? identity ?? "");
        return { domain, imitates: isPlaceholder(imitates) ? "" : imitates };
      })
      .filter((l) => l.domain && !isPlaceholder(l.domain));

    db.transaction(() => {
      db.prepare(
        `INSERT INTO radar_daily (day, verdict, scam_type, claimed_identity, channel, count) VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(day, verdict, scam_type, claimed_identity, channel) DO UPDATE SET count = count + 1`
      ).run(day, result.verdict, scamType, identity, channel);
      const seen = new Set();
      for (const l of lookalikes) {
        const key = `${l.domain}\u0000${l.imitates}`;
        if (seen.has(key)) continue;
        seen.add(key);
        db.prepare(
          `INSERT INTO radar_domain_daily (day, domain, imitates, count) VALUES (?, ?, ?, 1)
           ON CONFLICT(day, domain, imitates) DO UPDATE SET count = count + 1`
        ).run(day, l.domain, l.imitates);
      }
    })();
    return true;
  } catch (err) {
    console.error(`[radar] observation not recorded: ${err.message}`);
    return false;
  }
}

export function purgeExpiredRadarData(now = Date.now()) {
  const cutoff = muDay(now - RETENTION_DAYS * DAY_MS);
  const a = db.prepare("DELETE FROM radar_daily WHERE day < ?").run(cutoff).changes;
  const b = db.prepare("DELETE FROM radar_domain_daily WHERE day < ?").run(cutoff).changes;
  return { daily: a, domains: b };
}

try {
  purgeExpiredRadarData();
} catch (err) {
  console.error(`[radar] retention purge failed: ${err.message}`);
}
setInterval(() => {
  try {
    purgeExpiredRadarData();
  } catch (err) {
    console.error(`[radar] retention purge failed: ${err.message}`);
  }
}, 6 * 60 * 60 * 1000).unref();

/** Bucket boundaries for a range: `buckets` (oldest first) plus the current and previous periods. */
export function rangeWindows(range, now = Date.now()) {
  const today = muDay(now);
  const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
  if (range === "12m") {
    const [y, m] = today.split("-").map(Number);
    const monthStart = (i) => {
      // i months before the current month (0 = this month)
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      return d.toISOString().slice(0, 10);
    };
    const buckets = [];
    for (let i = 11; i >= 0; i--) buckets.push({ start: monthStart(i), end: i === 0 ? addDays(today, 1) : monthStart(i - 1) });
    return { unit: "month", buckets, from: monthStart(11), to: addDays(today, 1), prevFrom: monthStart(23), prevTo: monthStart(11) };
  }
  const n = range === "30d" ? 30 : 7;
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) buckets.push({ start: addDays(today, -i), end: addDays(today, -i + 1) });
  return { unit: "day", buckets, from: addDays(today, -(n - 1)), to: addDays(today, 1), prevFrom: addDays(today, -(2 * n - 1)), prevTo: addDays(today, -(n - 1)) };
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Aggregates for one range. Fields that cannot be computed honestly are
 * null/empty: `change` without any flagged scam in the previous period,
 * `rising` without a scam type that grew.
 */
export function getRadar(range = "7d", now = Date.now(), limit = 5) {
  if (!RADAR_RANGES.includes(range)) throw new RangeError("unknown range");
  const w = rangeWindows(range, now);
  const sum = (sql, ...args) => db.prepare(sql).get(...args)?.n ?? 0;

  const scams = sum("SELECT COALESCE(SUM(count), 0) AS n FROM radar_daily WHERE verdict = 'scam' AND day >= ? AND day < ?", w.from, w.to);
  const flagged = sum("SELECT COALESCE(SUM(count), 0) AS n FROM radar_daily WHERE day >= ? AND day < ?", w.from, w.to);
  const prevScams = sum("SELECT COALESCE(SUM(count), 0) AS n FROM radar_daily WHERE verdict = 'scam' AND day >= ? AND day < ?", w.prevFrom, w.prevTo);

  const seriesStmt = db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM radar_daily WHERE verdict = 'scam' AND day >= ? AND day < ?");
  const series = w.buckets.map((b) => ({ start: b.start, scams: seriesStmt.get(b.start, b.end).n }));

  const identities = db
    .prepare(
      `SELECT claimed_identity AS name, SUM(count) AS n FROM radar_daily
       WHERE day >= ? AND day < ? AND claimed_identity != '' GROUP BY claimed_identity ORDER BY n DESC, name ASC LIMIT 1`
    )
    .get(w.from, w.to);
  const topImpersonated = identities ? { name: identities.name, checks: identities.n, sharePct: pct(identities.n, flagged) } : null;

  const typeRows = db
    .prepare(
      `SELECT scam_type AS t, SUM(count) AS n FROM radar_daily
       WHERE day >= ? AND day < ? AND scam_type != '' GROUP BY scam_type ORDER BY n DESC, t ASC`
    )
    .all(w.from, w.to);
  const typedTotal = typeRows.reduce((a, r) => a + r.n, 0);
  const topScamTypes = typeRows.slice(0, limit).map((r) => ({ scamType: r.t, checks: r.n, pct: pct(r.n, typedTotal) }));

  const prevTypes = new Map(
    db
      .prepare(`SELECT scam_type AS t, SUM(count) AS n FROM radar_daily WHERE day >= ? AND day < ? AND scam_type != '' GROUP BY scam_type`)
      .all(w.prevFrom, w.prevTo)
      .map((r) => [r.t, r.n])
  );
  let rising = null;
  for (const r of typeRows) {
    const before = prevTypes.get(r.t) ?? 0;
    const growth = r.n - before;
    if (growth <= 0) continue;
    if (!rising || growth > rising.current - rising.previous || (growth === rising.current - rising.previous && r.n > rising.current)) {
      rising = { scamType: r.t, current: r.n, previous: before };
    }
  }
  if (rising) {
    const ch = db
      .prepare(
        `SELECT channel AS c, SUM(count) AS n FROM radar_daily
         WHERE day >= ? AND day < ? AND scam_type = ? AND channel != '' GROUP BY channel ORDER BY n DESC, c ASC LIMIT 1`
      )
      .get(w.from, w.to, rising.scamType);
    rising.mainChannel = ch ? ch.c : null;
  }

  const fakeLinks = db
    .prepare(
      `SELECT domain, imitates, SUM(count) AS n FROM radar_domain_daily
       WHERE day >= ? AND day < ? GROUP BY domain, imitates ORDER BY n DESC, domain ASC LIMIT ?`
    )
    .all(w.from, w.to, limit)
    .map((r) => ({ domain: r.domain, imitates: r.imitates || null, times: r.n }));

  return {
    range,
    unit: w.unit,
    from: w.from,
    to: w.to,
    scamsCaught: scams,
    flaggedChecks: flagged,
    change: prevScams > 0 ? { previous: prevScams, pct: Math.round(((scams - prevScams) / prevScams) * 100) } : null,
    series,
    topImpersonated,
    rising,
    topScamTypes,
    fakeLinks,
  };
}
