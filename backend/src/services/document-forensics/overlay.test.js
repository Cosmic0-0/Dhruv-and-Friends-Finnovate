import { test } from "node:test";
import assert from "node:assert/strict";
import { alphaStats, compose, coverage, effectiveDpi, IDENTITY, placementFromCtm, toGray } from "./overlay.js";

test("compose follows PDF cm semantics (m first, then the current CTM)", () => {
  const scale = [2, 0, 0, 3, 0, 0];
  const move = [1, 0, 0, 1, 10, 20];
  // Translate inside a scaled space: the offset is scaled too.
  assert.deepEqual(compose(scale, move), [2, 0, 0, 3, 20, 60]);
  assert.deepEqual(compose(IDENTITY, scale), scale);
});

test("placementFromCtm gives the drawn box and size, also when rotated", () => {
  const p = placementFromCtm([172.8, 0, 0, 64.8, 100, 200]);
  assert.deepEqual(p.bbox, [100, 200, 272.8, 264.8]);
  assert.equal(p.widthPt, 172.8);
  assert.equal(p.heightPt, 64.8);
  const rotated = placementFromCtm([0, 100, -50, 0, 300, 300]);
  assert.equal(rotated.widthPt, 100);
  assert.equal(rotated.heightPt, 50);
  assert.deepEqual(rotated.bbox, [250, 300, 300, 400]);
});

test("effectiveDpi is pixels per placed inch, the worse axis wins", () => {
  // A 1240x1754 scan on A4 is 150 dpi.
  assert.equal(Math.round(effectiveDpi(1240, 1754, 595.28, 841.89)), 150);
  // 116 px stretched over 2.4 in = 48 dpi, even though the height axis is ~49.
  assert.equal(Math.round(effectiveDpi(116, 44, 2.4 * 72, 0.9 * 72)), 48);
  assert.equal(effectiveDpi(100, 100, 0, 10), null);
});

test("coverage is the share of the page view the box covers", () => {
  const view = [0, 0, 100, 200];
  assert.equal(coverage([0, 0, 100, 200], view), 1);
  assert.equal(coverage([-50, 0, 50, 200], view), 0.5);
  assert.equal(coverage([200, 200, 300, 300], view), 0);
});

function rgbaFromAlpha(alpha, width) {
  const out = new Uint8Array(alpha.length * 4);
  alpha.forEach((a, i) => (out[i * 4 + 3] = a));
  return { data: out, width, height: alpha.length / width };
}

test("alphaStats: a hard cut-out has hardEdgeRatio 1, an anti-aliased one near 0", () => {
  const hard = rgbaFromAlpha([0, 0, 0, 0, 255, 255, 0, 255, 255, 0, 0, 0], 3);
  const h = alphaStats(hard.data, hard.width, hard.height);
  assert.equal(h.hardEdgeRatio, 1);
  assert.ok(h.transparentShare > 0.5);

  const soft = rgbaFromAlpha([0, 64, 0, 64, 255, 64, 0, 64, 0], 3);
  const s = alphaStats(soft.data, soft.width, soft.height);
  assert.equal(s.hardEdgeRatio, 0);

  const opaque = rgbaFromAlpha([255, 255, 255, 255], 2);
  assert.deepEqual(alphaStats(opaque.data, 2, 2), { transparentShare: 0, hardEdgeRatio: null });
});

test("toGray handles pdf.js 1-bit, RGB and RGBA layouts", () => {
  // 1 bpp: a 10-pixel row padded to 2 bytes; bit set = white.
  assert.deepEqual([...toGray(new Uint8Array([0b10000000, 0b01000000]), 1, 10, 1)], [255, 0, 0, 0, 0, 0, 0, 0, 0, 255]);
  assert.deepEqual([...toGray(new Uint8Array([255, 255, 255, 0, 0, 0]), 2, 2, 1)], [255, 0]);
  assert.deepEqual([...toGray(new Uint8Array([255, 255, 255, 0]), 3, 1, 1)], [255]);
});
