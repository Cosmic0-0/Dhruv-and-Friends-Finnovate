import { test } from "node:test";
import assert from "node:assert/strict";
import { weekStats, WEEK_MS } from "./week.ts";
import type { RecentCheck } from "./storage.ts";

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0); // 2026-09-23T12:00:00Z

const check = (agoMs: number, verdict: RecentCheck["verdict"]): RecentCheck => ({
  id: `${agoMs}-${verdict}`,
  text: "redacted message",
  verdict,
  at: NOW - agoMs,
});

const hours = (n: number) => n * 60 * 60 * 1000;
const days = (n: number) => n * 24 * 60 * 60 * 1000;

test("counts every verdict inside the seven-day window", () => {
  const stats = weekStats(
    [
      check(hours(1), "scam"),
      check(hours(5), "scam"),
      check(days(2), "suspicious"),
      check(days(6), "safe"),
      check(days(6) + hours(23), "safe"),
    ],
    NOW,
  );
  assert.deepEqual(stats, { total: 5, scam: 2, suspicious: 1, safe: 2 });
});

test("checks older than seven days are outside the window", () => {
  const stats = weekStats([check(days(8), "scam"), check(days(30), "safe"), check(hours(2), "safe")], NOW);
  assert.deepEqual(stats, { total: 1, scam: 0, suspicious: 0, safe: 1 });
});

test("the window boundary is exclusive, so a check never lingers a day too long", () => {
  assert.equal(weekStats([check(WEEK_MS, "scam")], NOW).total, 0);
  assert.equal(weekStats([check(WEEK_MS - 1, "scam")], NOW).total, 1);
});

test("a check timestamped in the future is ignored rather than counted for ever", () => {
  // A device clock that moved backwards would otherwise leave this check
  // inside every future window.
  const stats = weekStats([{ ...check(0, "scam"), at: NOW + days(3) }, check(hours(1), "safe")], NOW);
  assert.deepEqual(stats, { total: 1, scam: 0, suspicious: 0, safe: 1 });
});

test("no checks, or none recent, gives zeroed counts rather than throwing", () => {
  assert.deepEqual(weekStats([], NOW), { total: 0, scam: 0, suspicious: 0, safe: 0 });
  assert.equal(weekStats([check(days(9), "scam")], NOW).total, 0);
});

test("a corrupt timestamp is skipped, not counted", () => {
  const stats = weekStats(
    [{ ...check(0, "scam"), at: Number.NaN }, { ...check(0, "safe"), at: Number.POSITIVE_INFINITY }, check(hours(3), "suspicious")],
    NOW,
  );
  assert.deepEqual(stats, { total: 1, scam: 0, suspicious: 1, safe: 0 });
});
