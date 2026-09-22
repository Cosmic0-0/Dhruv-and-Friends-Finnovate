import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanExtractedText, extractTextFromImage } from "./index.js";

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
