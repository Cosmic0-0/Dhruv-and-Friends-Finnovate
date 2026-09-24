import { test } from "node:test";
import assert from "node:assert/strict";

// POST /api/analyze/document shares the analyze rate limit (20 requests per
// 15 minutes per IP) with /api/analyze - docs/API-CONTRACT.md. Own file =
// own process = a fresh budget. Rejected (400) requests still count, so
// the budget is spent without running any analysis.
process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";

const { default: express } = await import("express");
const { router } = await import("./index.js");

test("document checks and text checks draw on one 20-per-15-minutes budget", async (t) => {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path) => fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

  for (let i = 0; i < 19; i++) assert.equal((await post("/analyze")).status, 400, `text check ${i + 1}`);
  assert.equal((await post("/analyze/document")).status, 400, "the 20th request is still within budget");
  const limited = await post("/analyze/document");
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "too many analyze requests, try again shortly" });
});
