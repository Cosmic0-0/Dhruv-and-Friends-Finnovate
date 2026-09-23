import { test } from "node:test";
import assert from "node:assert/strict";
import { configuredOrigins, createApiCors } from "./index.js";

function response() {
  return {
    headers: {}, statusCode: null, body: null,
    vary(value) { this.headers.Vary = value; },
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    sendStatus(code) { this.statusCode = code; return this; },
  };
}

test("development CORS permits only the local Outlook add-in origin by default", () => {
  assert.deepEqual([...configuredOrigins({ NODE_ENV: "development" })], ["https://localhost:3001"]);
  assert.equal(configuredOrigins({ NODE_ENV: "production" }).size, 0);
});

test("configured origins are exact, comma-separated and trailing-slash tolerant", () => {
  const origins = configuredOrigins({ NODE_ENV: "production", OUTLOOK_ADDIN_ORIGINS: "https://addin.example, https://demo.example/, http://insecure.example" });
  assert.deepEqual([...origins], ["https://addin.example", "https://demo.example"]);
});

test("allowed preflight receives narrow CORS headers; an unknown origin is rejected", () => {
  const cors = createApiCors({ origins: new Set(["https://addin.example"]) });
  const allowed = response();
  cors({ method: "OPTIONS", headers: { origin: "https://addin.example" } }, allowed, () => assert.fail("preflight should finish"));
  assert.equal(allowed.statusCode, 204);
  assert.equal(allowed.headers["Access-Control-Allow-Origin"], "https://addin.example");
  assert.equal(allowed.headers["Access-Control-Allow-Headers"], "Content-Type");

  const denied = response();
  cors({ method: "OPTIONS", headers: { origin: "https://evil.example" } }, denied, () => assert.fail("denied preflight should finish"));
  assert.equal(denied.statusCode, 403);
});

test("requests without Origin continue unchanged", () => {
  let next = false;
  createApiCors()({ method: "POST", headers: {} }, response(), () => { next = true; });
  assert.equal(next, true);
});
