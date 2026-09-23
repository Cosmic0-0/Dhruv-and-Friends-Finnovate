import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanExtractedText, extractTextFromImage, mergeOcrPasses } from "./index.js";

test("cleanExtractedText collapses blank lines and trims whitespace", () => {
  const raw = "  Bank One  \n\n\n  Your account is locked   \n  \nVerify now\n\n";
  assert.equal(cleanExtractedText(raw), "Bank One\nYour account is locked\nVerify now");
});

test("cleanExtractedText returns empty string for whitespace-only input", () => {
  assert.equal(cleanExtractedText("   \n\n  \n"), "");
});

test("extractTextFromImage rejects a non-Buffer input", async () => {
  await assert.rejects(() => extractTextFromImage("not-a-buffer"), /must be a non-empty Buffer/);
});

test("extractTextFromImage rejects an empty Buffer", async () => {
  await assert.rejects(() => extractTextFromImage(Buffer.alloc(0)), /must be a non-empty Buffer/);
});

test("mergeOcrPasses keeps the normal pass's lines and order as the base", () => {
  const normal = "Dear customer,\nYour account is limited.";
  const inverted = "Dear customer,\nYour account is limited.";
  assert.equal(mergeOcrPasses(normal, inverted), "Dear customer,\nYour account is limited.");
});

test("mergeOcrPasses appends lines the inverted pass alone found, e.g. a button label", () => {
  const normal = "Dear customer,\nYour account is limited.";
  const inverted = "Dear customer,\nYour account is limited.\nConfirm Your Information";
  assert.equal(
    mergeOcrPasses(normal, inverted),
    "Dear customer,\nYour account is limited.\nConfirm Your Information"
  );
});

test("mergeOcrPasses treats matching lines as duplicates case-insensitively", () => {
  const normal = "CONFIRM NOW";
  const inverted = "confirm now";
  assert.equal(mergeOcrPasses(normal, inverted), "CONFIRM NOW");
});

test("mergeOcrPasses handles an empty inverted pass", () => {
  assert.equal(mergeOcrPasses("Some text", ""), "Some text");
});
