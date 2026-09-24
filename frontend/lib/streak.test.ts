import { test } from "node:test";
import assert from "node:assert/strict";
import { accuracyPct, DAILY_GOAL, emptyState, normalizeState, recordAnswer, visibleStreak, weekHistory, type StreakState } from "./streak.ts";

const item = (id: string, isScam = true) => ({ id, text: `message ${id}`, isScam, reasons: ["urgency_language" as const] });

function play(state: StreakState, day: string, results: boolean[]) {
  let s = state;
  const completions: boolean[] = [];
  results.forEach((correct, i) => {
    const r = recordAnswer(s, { item: item(`${day}-${i}`), correct }, day);
    s = r.state;
    completions.push(r.completedNow);
  });
  return { state: s, completions };
}

test("a day completes on the 5th answer, exactly once", () => {
  const { state, completions } = play(emptyState("2026-09-22"), "2026-09-22", [true, true, true, true, true, true, true]);
  assert.deepEqual(completions, [false, false, false, false, true, false, false]);
  assert.equal(DAILY_GOAL, 5);
  assert.equal(state.streak, 1);
  assert.equal(state.lastCompletedDay, "2026-09-22");
  assert.equal(state.today.answered, 7);
  assert.equal(state.today.correct, 7);
});

test("four answers don't complete a day or start a streak", () => {
  const { state, completions } = play(emptyState("2026-09-22"), "2026-09-22", [true, false, true, true]);
  assert.ok(completions.every((c) => !c));
  assert.equal(state.streak, 0);
  assert.equal(visibleStreak(state, "2026-09-22"), 0);
});

test("consecutive completed days grow the streak; a missed day resets it to 1", () => {
  let s = emptyState("2026-09-20");
  s = play(s, "2026-09-20", Array(5).fill(true)).state;
  s = play(s, "2026-09-21", Array(5).fill(true)).state;
  s = play(s, "2026-09-22", Array(5).fill(true)).state;
  assert.equal(s.streak, 3);
  s = play(s, "2026-09-24", Array(5).fill(true)).state; // skipped the 23rd
  assert.equal(s.streak, 1);
});

test("the visible streak survives until the end of the next day, then disappears", () => {
  const s = play(emptyState("2026-09-21"), "2026-09-21", Array(5).fill(true)).state;
  const two = play(s, "2026-09-22", Array(5).fill(true)).state;
  assert.equal(visibleStreak(two, "2026-09-22"), 2);
  assert.equal(visibleStreak(two, "2026-09-23"), 2); // not played yet today: still alive
  assert.equal(visibleStreak(two, "2026-09-24"), 0); // missed a day
  const one = play(emptyState("2026-09-10"), "2026-09-10", Array(5).fill(true)).state;
  assert.equal(visibleStreak(one, "2026-09-13"), 0);
});

test("today's progress and mistakes roll over at midnight", () => {
  const s = play(emptyState("2026-09-22"), "2026-09-22", [false, true, false]).state;
  assert.equal(s.today.mistakes.length, 2);
  const tomorrow = normalizeState(s, "2026-09-23");
  assert.equal(tomorrow.today.day, "2026-09-23");
  assert.equal(tomorrow.today.answered, 0);
  assert.deepEqual(tomorrow.today.mistakes, []);
  assert.equal(tomorrow.today.celebrated, false);
});

test("mistakes keep the message and its real answer; a repeated miss isn't listed twice", () => {
  let s = emptyState("2026-09-22");
  s = recordAnswer(s, { item: item("a"), correct: false }, "2026-09-22").state;
  s = recordAnswer(s, { item: item("b", false), correct: false }, "2026-09-22").state;
  s = recordAnswer(s, { item: item("a"), correct: false }, "2026-09-22").state;
  assert.deepEqual(s.today.mistakes.map((m) => [m.id, m.isScam]), [["b", false], ["a", true]]);
  assert.equal(s.today.correct, 0);
});

test("the old v1 shape doesn't crash: its streak is discarded, its best score kept", () => {
  const v1 = { streak: 9, lastDay: "2026-09-21", best: { score: 6, total: 8 } };
  const s = normalizeState(null, "2026-09-22", v1);
  assert.equal(s.version, 3);
  assert.equal(s.streak, 0);
  assert.equal(s.lastCompletedDay, null);
  assert.deepEqual(s.best, { score: 6, total: 8 });
  assert.equal(s.totalAnswered, 0);
});

test("garbage and partial data are tolerated", () => {
  for (const raw of [null, undefined, 42, "x", [], { version: 2 }, { version: 3 }, { version: 2, today: "nope", streak: -3, best: { score: "a" } }]) {
    const s = normalizeState(raw, "2026-09-22", { best: 7 });
    assert.equal(s.version, 3);
    assert.equal(s.today.day, "2026-09-22");
    assert.ok(s.streak >= 0);
    assert.ok(s.totalAnswered >= 0);
  }
  const bad = normalizeState({ version: 2, streak: 3, lastCompletedDay: "garbage", today: { day: "2026-09-22", answered: 2, correct: 9, mistakes: [{ id: 1 }, { id: "x", text: "t", isScam: true, reasons: "no" }] } }, "2026-09-22");
  assert.equal(bad.lastCompletedDay, null);
  assert.equal(bad.today.correct, 2, "correct can't exceed answered");
  assert.deepEqual(bad.today.mistakes, [{ id: "x", text: "t", isScam: true, reasons: [] }]);
});

test("v2 → v3 migration seeds totals and history from the old single-day snapshot", () => {
  const v2 = { version: 2, streak: 2, lastCompletedDay: "2026-09-21", today: { day: "2026-09-21", answered: 5, correct: 4, mistakes: [], celebrated: true }, best: null };
  const rolled = normalizeState(v2, "2026-09-22"); // a day later: yesterday becomes history
  assert.equal(rolled.version, 3);
  assert.equal(rolled.totalAnswered, 5);
  assert.equal(rolled.totalCorrect, 4);
  assert.deepEqual(rolled.history["2026-09-21"], { answered: 5, correct: 4 });
  assert.equal(rolled.today.answered, 0);

  const sameDay = normalizeState(v2, "2026-09-21"); // still today: nothing to move to history yet
  assert.equal(sameDay.totalAnswered, 5);
  assert.deepEqual(sameDay.history, {});
});

test("accuracy is cumulative across days, null before any answer", () => {
  assert.equal(accuracyPct(emptyState("2026-09-22")), null);
  let s = emptyState("2026-09-20");
  s = play(s, "2026-09-20", [true, true, false, true]).state; // 3/4
  assert.equal(accuracyPct(s), 75);
  s = play(s, "2026-09-21", [true, false]).state; // cumulative 4/6
  assert.equal(accuracyPct(s), 67);
});

test("weekHistory returns 7 days ending today, real answered/correct per day", () => {
  let s = emptyState("2026-09-16");
  s = play(s, "2026-09-16", Array(5).fill(true)).state; // completed, will roll into history
  s = play(s, "2026-09-18", [true, false]).state; // partial day, no goal met
  const week = weekHistory(s, "2026-09-22");
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((d) => d.day), ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"]);
  assert.deepEqual(week[0], { day: "2026-09-16", answered: 5, correct: 5, goalMet: true });
  assert.deepEqual(week[2], { day: "2026-09-18", answered: 2, correct: 1, goalMet: false });
  assert.deepEqual(week[6], { day: "2026-09-22", answered: 0, correct: 0, goalMet: false });
});
