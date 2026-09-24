// POST /api/translate: request validation and the cases that never reach a model.
// Model-backed translation is covered with a stub provider in
// services/kreol/messageTranslation.test.js, so nothing here depends on an LLM.

process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "1";

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { router } from "./index.js";

async function serverFor(t) {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return async (body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
}

const KREOL = "Ou kont pou bloke zordi. Pa partaz ou kod OTP ar personn. Apel labank aster pou konfirm.";

test("rejects a missing or non-string message", async (t) => {
  const call = await serverFor(t);
  assert.equal((await call({ target: "mfe" })).status, 400);
  assert.equal((await call({ message: 42, target: "mfe" })).status, 400);
  assert.equal((await call({ message: "   ", target: "mfe" })).status, 400);
});

test("rejects an unknown target", async (t) => {
  const call = await serverFor(t);
  const res = await call({ message: KREOL, target: "de" });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /target must be one of/);
});

test("rejects an over-long message", async (t) => {
  const call = await serverFor(t);
  const res = await call({ message: "a".repeat(2001), target: "mfe" });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /maximum length/);
});

test("a message already in the wanted language is answered without a model", async (t) => {
  const call = await serverFor(t);
  const res = await call({ message: KREOL, target: "mfe" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "same_language");
  assert.equal(res.body.text, null);
  assert.equal(res.body.machineTranslated, true);
  assert.equal(res.body.reviewed, false);
});
