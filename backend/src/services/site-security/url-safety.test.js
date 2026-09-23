import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { isBlockedAddress, assertPublicHttpUrl, UnsafeUrlError, _internals } from "./url-safety.js";

test.afterEach(() => mock.restoreAll());

test("isBlockedAddress blocks loopback, private, link-local, and reserved IPv4 ranges", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.5", "192.168.1.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
    assert.equal(isBlockedAddress(ip), true, `expected ${ip} to be blocked`);
  }
});

test("isBlockedAddress allows ordinary public IPv4 addresses", () => {
  for (const ip of ["93.184.216.34", "8.8.8.8", "1.1.1.1"]) {
    assert.equal(isBlockedAddress(ip), false, `expected ${ip} to be allowed`);
  }
});

test("isBlockedAddress blocks IPv6 loopback, link-local, unique-local, and mapped-IPv4-private addresses", () => {
  for (const ip of ["::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1"]) {
    assert.equal(isBlockedAddress(ip), true, `expected ${ip} to be blocked`);
  }
});

test("isBlockedAddress fails closed for garbage input", () => {
  assert.equal(isBlockedAddress("not-an-ip"), true);
});

test("assertPublicHttpUrl rejects non-http(s) schemes", async () => {
  await assert.rejects(() => assertPublicHttpUrl("file:///etc/passwd"), UnsafeUrlError);
  await assert.rejects(() => assertPublicHttpUrl("ftp://example.com"), UnsafeUrlError);
});

test("assertPublicHttpUrl rejects malformed input", async () => {
  await assert.rejects(() => assertPublicHttpUrl("not a url"), UnsafeUrlError);
});

test("assertPublicHttpUrl rejects localhost by name", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://localhost/"), UnsafeUrlError);
});

test("assertPublicHttpUrl rejects a hostname that resolves to a private address", async () => {
  const original = _internals.lookup;
  _internals.lookup = async () => [{ address: "10.0.0.5", family: 4 }];
  try {
    await assert.rejects(() => assertPublicHttpUrl("http://internal.evil.example/"), UnsafeUrlError);
  } finally {
    _internals.lookup = original;
  }
});

test("assertPublicHttpUrl rejects a bare private IP literal without needing DNS", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1:4000/admin"), UnsafeUrlError);
});

test("assertPublicHttpUrl accepts a public hostname resolving to a public address", async () => {
  const original = _internals.lookup;
  _internals.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  try {
    const parsed = await assertPublicHttpUrl("https://good.example/path");
    assert.equal(parsed.hostname, "good.example");
  } finally {
    _internals.lookup = original;
  }
});

test("assertPublicHttpUrl rejects a hostname DNS cannot resolve", async () => {
  const original = _internals.lookup;
  _internals.lookup = async () => {
    throw new Error("ENOTFOUND");
  };
  try {
    await assert.rejects(() => assertPublicHttpUrl("https://nowhere.invalid/"), UnsafeUrlError);
  } finally {
    _internals.lookup = original;
  }
});
