import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightSegments, type Segment } from "./highlight.ts";

const join = (segs: Segment[]) => segs.map((s) => s.text).join("");
const marked = (segs: Segment[]) => segs.filter((s) => s.severity).map((s) => [s.text, s.severity]);

test("highlights an exact match and keeps every character", () => {
  const text = "Verify at https://mcb-mu.help/verify today.";
  const segs = highlightSegments(text, [{ evidence: "https://mcb-mu.help/verify", severity: "high" }]);
  assert.equal(join(segs), text);
  assert.deepEqual(marked(segs), [["https://mcb-mu.help/verify", "high"]]);
});

test("matching is case-insensitive and whitespace-tolerant, but shows the user's own text", () => {
  const text = "Your account is BLOCKED\n  today.  Act now";
  const segs = highlightSegments(text, [{ evidence: "blocked today", severity: "medium" }]);
  assert.equal(join(segs), text);
  assert.deepEqual(marked(segs), [["BLOCKED\n  today", "medium"]]);
});

test("evidence that doesn't match is ignored silently", () => {
  const text = "Hello there";
  const segs = highlightSegments(text, [{ evidence: "not in the text", severity: "high" }]);
  assert.deepEqual(segs, [{ text }]);
});

test("empty, whitespace or missing evidence is ignored", () => {
  const text = "Hello there";
  const segs = highlightSegments(text, [
    { evidence: "", severity: "high" },
    { evidence: "   ", severity: "high" },
    { evidence: undefined as unknown as string, severity: "high" },
  ]);
  assert.deepEqual(segs, [{ text }]);
});

test("on overlap the higher severity wins, and nothing overlaps", () => {
  const text = "Click mcb-secure.top now or lose access";
  const segs = highlightSegments(text, [
    { evidence: "Click mcb-secure.top now", severity: "medium" },
    { evidence: "mcb-secure.top", severity: "high" },
    { evidence: "now or lose access", severity: "low" },
  ]);
  assert.equal(join(segs), text);
  assert.deepEqual(marked(segs), [
    ["mcb-secure.top", "high"],
    ["now or lose access", "low"],
  ]);
});

test("regex characters in evidence are treated literally", () => {
  const text = "Pay Rs (5,000) + fee? [urgent]";
  const segs = highlightSegments(text, [{ evidence: "Rs (5,000) + fee?", severity: "high" }]);
  assert.equal(join(segs), text);
  assert.deepEqual(marked(segs), [["Rs (5,000) + fee?", "high"]]);
});

test("every occurrence is highlighted", () => {
  const text = "OTP 1234. Share the OTP.";
  const segs = highlightSegments(text, [{ evidence: "otp", severity: "medium" }]);
  assert.equal(join(segs), text);
  assert.equal(marked(segs).length, 2);
});

test("empty text round-trips", () => {
  assert.equal(join(highlightSegments("", [{ evidence: "x", severity: "high" }])), "");
});

test("unicode and emoji text is never mangled", () => {
  const text = "Félicitations 🎉 ou finn gagn Rs 50 000 ! Klik la: myt-prize.win";
  const segs = highlightSegments(text, [
    { evidence: "myt-prize.win", severity: "high" },
    { evidence: "félicitations 🎉", severity: "low" },
  ]);
  assert.equal(join(segs), text);
  assert.equal(marked(segs).length, 2);
});
