import test from "node:test";
import assert from "node:assert/strict";
import { parseShareSamples } from "./index.js";

test("shareSamples defaults to recording", () => {
  assert.deepEqual(parseShareSamples(undefined), { record: true });
  assert.deepEqual(parseShareSamples(null), { record: true });
});

test("shareSamples false opts out", () => {
  assert.deepEqual(parseShareSamples(false), { record: false });
  assert.deepEqual(parseShareSamples(true), { record: true });
});

test("shareSamples rejects non-booleans", () => {
  for (const bad of ["false", 0, 1, {}, []]) assert.ok(parseShareSamples(bad).error);
});
