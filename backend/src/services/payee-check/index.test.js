import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePayee, ibanChecksumOk, inspectIban, isMauritianMobile, isPlausibleAccount, validatePayeeRequest } from "./index.js";

// ISO 13616 published example IBANs (valid checksums).
const GB_VALID = "GB82 WEST 1234 5698 7654 32";
const MU_VALID = "MU17 BOMM 0101 1010 3030 0200 000M UR";

test("IBAN checksum and shape", () => {
  assert.equal(ibanChecksumOk(GB_VALID.replace(/\s/g, "")), true);
  assert.equal(inspectIban(MU_VALID).checksumOk, true);
  assert.equal(inspectIban(MU_VALID).lengthOk, true);
  assert.equal(inspectIban("MU18 BOMM 0101 1010 3030 0200 000M UR").checksumOk, false);
  assert.equal(inspectIban("not an iban").shape, "invalid");
});

test("Mauritian mobile and account shapes", () => {
  assert.equal(isMauritianMobile("5 781 2094"), true);
  assert.equal(isMauritianMobile("+230 5781 2094"), true);
  assert.equal(isMauritianMobile("212 4017"), false);
  assert.equal(isMauritianMobile("abc"), false);
  assert.equal(isPlausibleAccount("000 448 219 07"), true);
  assert.equal(isPlausibleAccount("12"), false);
});

test("validation", () => {
  assert.ok(validatePayeeRequest({ method: "fax", identifier: "1" }).error);
  assert.ok(validatePayeeRequest({ method: "phone", identifier: "" }).error);
  assert.ok(validatePayeeRequest({ method: "phone", identifier: "5", amount: -1 }).error);
  assert.ok(validatePayeeRequest({ method: "phone", identifier: "5", purpose: "holiday" }).error);
  assert.deepEqual(validatePayeeRequest({ method: "phone", identifier: " 57812094 ", name: "", amount: 25000, purpose: "car" }).value, {
    method: "phone", identifier: "57812094", amount: 25000, purpose: "car",
  });
});

test("verdicts come only from real findings", () => {
  const clear = evaluatePayee({ method: "iban", identifier: MU_VALID }, { reportCount: 0 });
  assert.equal(clear.verdict, "clear");
  assert.deepEqual(clear.findings.map((f) => f.code), ["IBAN_VALID", "NOT_REPORTED"]);

  const reported = evaluatePayee({ method: "phone", identifier: "57812094" }, { reportCount: 3 });
  assert.equal(reported.verdict, "stop");
  assert.equal(reported.findings[0].code, "REPORTED");
  assert.equal(reported.findings[0].params.count, 3);

  const bad = evaluatePayee({ method: "iban", identifier: "MU18 BOMM 0101 1010 3030 0200 000M UR" }, { reportCount: 0 });
  assert.equal(bad.verdict, "stop");

  const org = evaluatePayee({ method: "phone", identifier: "57812094", name: "MCB Customer Care", amount: 60000 }, { reportCount: 0 });
  assert.equal(org.verdict, "caution");
  assert.deepEqual(org.findings.map((f) => f.code), ["PHONE_VALID", "ORGANISATION_ON_PERSONAL_NUMBER", "LARGE_AMOUNT", "NOT_REPORTED"]);
  // Never a claim about who owns the account.
  assert.ok(!org.findings.some((f) => /NAME_MISMATCH/.test(f.code)));
});
