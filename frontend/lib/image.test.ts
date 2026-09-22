import { test } from "node:test";
import assert from "node:assert/strict";
import { fitWithin, ImageError, MAX_EDGE } from "./image.ts";

test("a tall phone screenshot is scaled so its longest edge is 1600px, keeping the aspect ratio", () => {
  assert.deepEqual(fitWithin(1170, 2532), { width: 739, height: MAX_EDGE });
});

test("a wide image is limited on its width", () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 });
});

test("small images are never upscaled", () => {
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1600, 900), { width: 1600, height: 900 });
});

test("extreme aspect ratios keep at least 1px", () => {
  assert.deepEqual(fitWithin(100000, 10), { width: 1600, height: 1 });
});

test("zero or invalid dimensions are rejected as unreadable", () => {
  assert.throws(() => fitWithin(0, 100), (e: unknown) => e instanceof ImageError && e.code === "unreadable");
  assert.throws(() => fitWithin(Number.NaN, 100), ImageError);
});
