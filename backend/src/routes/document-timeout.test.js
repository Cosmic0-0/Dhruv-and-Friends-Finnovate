import { test } from "node:test";
import assert from "node:assert/strict";

// A parse that exceeds DOCUMENT_TIMEOUT_MS is terminated and reported with
// the same generic message as any unreadable file. Own file, because the
// timeout is read from the environment when the module loads.
process.env.DATABASE_URL = ":memory:";
process.env.DOCUMENT_TIMEOUT_MS = "1";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";

const { default: express } = await import("express");
const { router } = await import("./index.js");
const B = await import("../services/document-forensics/fixture-builders.js");

test("worker timeout -> 400 with a generic message, and the server keeps serving", async (t) => {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const file = Buffer.from(await B.buildCleanNativePdf()).toString("base64");
  const res = await fetch(`${url}/api/analyze/document`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file }) });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "document could not be read" });
  const check = await fetch(`${url}/api/check-url`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://www.mcb.mu" }) });
  assert.equal(check.status, 200);
});
