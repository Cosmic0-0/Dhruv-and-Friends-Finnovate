import { test } from "node:test";
import assert from "node:assert/strict";

// Own file (own process): in-memory DB, its own rate-limiter budget.
process.env.DATABASE_URL = ":memory:";
process.env.LLM_MODE = "fallback";
process.env.REPORTER_HASH_SECRET = "test-secret";

const { default: express } = await import("express");
const { router } = await import("./index.js");
const { db, reportSender } = await import("../db/index.js");

async function startServer(t) {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return (body) =>
    fetch(`http://127.0.0.1:${port}/api/check-payee`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
}

test("POST /api/check-payee returns the real report count and never counts as a report", async (t) => {
  db.exec("DELETE FROM reports;");
  const post = await startServer(t);

  let res = await post({ method: "phone", identifier: "+230 5781 2094", purpose: "car", amount: 25000 });
  assert.equal(res.status, 200);
  let body = await res.json();
  assert.equal(body.reportCount, 0);
  assert.equal(body.verdict, "clear");
  assert.equal(body.purpose, "car");
  assert.equal(body.identifier, undefined);

  reportSender("57812094");
  reportSender("5781 2094");
  res = await post({ method: "phone", identifier: "5781 2094" });
  body = await res.json();
  assert.equal(body.reportCount, 2);
  assert.equal(body.verdict, "stop");
  // Looking it up again doesn't change the count.
  body = await (await post({ method: "phone", identifier: "57812094" })).json();
  assert.equal(body.reportCount, 2);
});

test("POST /api/check-payee rejects bad input", async (t) => {
  const post = await startServer(t);
  assert.equal((await post({ method: "phone" })).status, 400);
  assert.equal((await post({ method: "cash", identifier: "1" })).status, 400);
  assert.equal((await post({ method: "iban", identifier: "x".repeat(65) })).status, 400);
});
