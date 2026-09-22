import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";

const { getDomainAgeDays, attachDomainAges } = await import("./index.js");

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = originalFetch;
});

test("getDomainAgeDays resolves undefined (not a throw) when the RDAP call rejects", async () => {
  globalThis.fetch = async () => {
    throw new Error("network unreachable");
  };
  const result = await getDomainAgeDays("mcb-secure.top");
  assert.equal(result, undefined);
});

test("getDomainAgeDays resolves undefined within the timeout when the RDAP call hangs", async () => {
  globalThis.fetch = (url, { signal } = {}) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });

  const start = Date.now();
  const result = await getDomainAgeDays("mcb-secure.top");
  const elapsed = Date.now() - start;

  assert.equal(result, undefined);
  assert.ok(elapsed < 1000, `expected the capped timeout (~50ms) to apply, took ${elapsed}ms`);
});

test("getDomainAgeDays resolves undefined when RDAP responds non-ok", async () => {
  globalThis.fetch = async () => new Response("not found", { status: 404 });
  const result = await getDomainAgeDays("sbm-verify.top");
  assert.equal(result, undefined);
});

test("getDomainAgeDays resolves undefined when the RDAP response has no registration event", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ events: [] }), { status: 200 });
  const result = await getDomainAgeDays("sbm-verify.top");
  assert.equal(result, undefined);
});

test("getDomainAgeDays computes age in days from a valid registration event", async () => {
  const registeredAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ events: [{ eventAction: "registration", eventDate: registeredAt }] }), {
      status: 200,
    });
  const result = await getDomainAgeDays("mcb-nu.top");
  assert.equal(result, 10);
});

test("getDomainAgeDays caches a successful lookup and doesn't re-fetch for it", async () => {
  const registeredAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ events: [{ eventAction: "registration", eventDate: registeredAt }] }), {
      status: 200,
    });
  };

  const first = await getDomainAgeDays("myt-prize.win");
  const second = await getDomainAgeDays("myt-prize.win");

  assert.equal(first, 5);
  assert.equal(second, 5);
  assert.equal(fetchCalls, 1);
});

test("attachDomainAges never blocks the caller and only attaches lookups that already resolved", async () => {
  // One host resolves fast, the other never resolves (simulates a lookup
  // still in flight when the response is ready to send).
  globalThis.fetch = async (url) => {
    if (String(url).includes("fast-host")) {
      const registeredAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
      return new Response(JSON.stringify({ events: [{ eventAction: "registration", eventDate: registeredAt }] }), {
        status: 200,
      });
    }
    return new Promise(() => {}); // never resolves
  };

  const signals = [
    { type: "lookalike_url", description: "fast-host.top looks fake", severity: "high" },
    { type: "lookalike_url", description: "slow-host.top looks fake", severity: "high" },
  ];
  const attach = attachDomainAges(signals, ["fast-host.top", "slow-host.top"]);

  // Give the fast lookup's microtasks a chance to settle, but don't await
  // the slow one - attach() itself must be synchronous and non-blocking.
  await new Promise((resolve) => setImmediate(resolve));
  attach();

  assert.equal(signals[0].domainAgeDays, 3);
  assert.equal("domainAgeDays" in signals[1], false);
});
