import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNELS, validateChannel, channelLabel } from "./index.js";

test("absent channel is allowed", () => {
  assert.deepEqual(validateChannel(undefined), { value: null });
  assert.deepEqual(validateChannel(null), { value: null });
});

test("every known channel validates", () => {
  for (const c of CHANNELS) assert.deepEqual(validateChannel(c), { value: c });
});

test("unknown or non-string channel is rejected", () => {
  assert.ok(validateChannel("telegram").error);
  assert.ok(validateChannel("SMS").error);
  assert.ok(validateChannel(3).error);
  assert.ok(validateChannel({}).error);
});

test("labels exist for every channel", () => {
  for (const c of CHANNELS) assert.equal(typeof channelLabel(c), "string");
  assert.equal(channelLabel("nope"), null);
});
