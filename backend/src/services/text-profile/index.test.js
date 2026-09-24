import { test } from "node:test";
import assert from "node:assert/strict";
import { profileText } from "./index.js";

test("Kreol message with one link", () => {
  const p = profileText("Ou kont MCB pou bloke zordi. Konfirm ou OTP lor mcb-secure.top/verify");
  assert.equal(p.language, "kreol");
  assert.equal(p.links, 1);
  assert.deepEqual(p.hosts, ["mcb-secure.top"]);
});

test("English and French", () => {
  assert.equal(profileText("Please verify your account now with the bank").language, "en");
  assert.equal(profileText("Veuillez confirmer votre compte avec nous pour les paiements").language, "fr");
});

test("no markers means unknown, not English", () => {
  const p = profileText("12345");
  assert.equal(p.language, null);
  assert.equal(p.links, 0);
});

test("code-switched text is mixed", () => {
  assert.equal(profileText("Bonjour, ou kont pe bloke, veuillez confirmer votre compte pou nou kapav ede ou").language, "mixed");
});

test("POST /api/text-profile validates and profiles", async (t) => {
  process.env.DATABASE_URL = ":memory:";
  const { default: express } = await import("express");
  const { router } = await import("../../routes/index.js");
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/text-profile`;
  const post = (body) => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ text: "x".repeat(5001) })).status, 400);
  const ok = await post({ text: "Ou kont pou bloke. mcb-secure.top" });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.links, 1);
});
