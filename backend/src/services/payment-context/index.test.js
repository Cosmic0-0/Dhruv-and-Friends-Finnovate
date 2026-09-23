import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePaymentContext, evaluatePaymentContext, namesMatch } from "./index.js";

test("validation accepts a well-formed context and rejects bad fields", () => {
  const ok = validatePaymentContext({ amount: 15000, currency: "MUR", method: "bank_transfer", recipient: "John Smith", claimedOrganisation: "ABC Ltd", onCallNow: false });
  assert.deepEqual(ok.value, { amount: 15000, currency: "MUR", method: "bank_transfer", recipient: "John Smith", claimedOrganisation: "ABC Ltd", onCallNow: false });
  assert.deepEqual(validatePaymentContext(undefined), { value: null });
  assert.ok(validatePaymentContext({ amount: -1 }).error);
  assert.ok(validatePaymentContext({ method: "carrier_pigeon" }).error);
  assert.ok(validatePaymentContext({ onCallNow: "yes" }).error);
  assert.ok(validatePaymentContext([]).error);
});

test("recipient != claimed organisation -> PAY-05; onCallNow -> PAY-06; gift card -> PAY-02", () => {
  const codes = evaluatePaymentContext({ recipient: "John Smith", claimedOrganisation: "ABC Ltd", onCallNow: true, method: "gift_card" }).map((s) => s.code);
  assert.deepEqual(codes.sort(), ["PAY-02", "PAY-05", "PAY-06"]);
});

test("matching names do not fire PAY-05", () => {
  assert.equal(namesMatch("ABC Trading Ltd", "ABC Ltd"), true);
  assert.equal(namesMatch("Mauritius Commercial Bank", "MCB"), true);
  assert.deepEqual(evaluatePaymentContext({ recipient: "ABC Trading Ltd", claimedOrganisation: "ABC Ltd", method: "bank_transfer", onCallNow: false }), []);
});
