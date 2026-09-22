// Run: npm test  (Node's built-in test runner; Node strips the TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, restore } from "./redact.ts";

function check(input: string) {
  const r = redact(input);
  // The mapping must always round-trip back to exactly what the user typed.
  assert.equal(restore(r.redacted, r.redactions), input);
  return r;
}

test("account numbers of 9+ digits keep only the last 4", () => {
  const { redacted } = check("Your account 000123454417 has been blocked.");
  assert.equal(redacted, "Your account [account ending 4417] has been blocked.");
});

test("grouped card numbers are treated as one account", () => {
  const { redacted } = check("Card 4556 1234 9876 4417 was charged.");
  assert.equal(redacted, "Card [account ending 4417] was charged.");
});

test("6-8 digit numbers next to an account keyword are accounts", () => {
  const { redacted } = check("Compte no. 1234567 suspendu");
  assert.equal(redacted, "Compte no. [account ending 4567] suspendu");
});

test("IBANs are redacted to the last 4 digits", () => {
  const { redacted } = check("Transfer to MU17BOMM0101101030300200000MUR today");
  assert.match(redacted, /\[account ending 0000\]/);
  assert.doesNotMatch(redacted, /0101101030/);
});

test("+230 phone numbers are redacted", () => {
  const { redacted, redactions } = check("Call +230 5251 2345 now");
  assert.equal(redacted, "Call [phone 1] now");
  assert.equal(redactions[0].kind, "phone");
});

test("local 8-digit mobile and 7-digit landline numbers are redacted", () => {
  const { redacted } = check("Kontak nou lor 52512345 ouswa 2123456");
  assert.equal(redacted, "Kontak nou lor [phone 1] ouswa [phone 2]");
});

test("a phone number followed by the word 'code' is still a phone", () => {
  const { redacted } = check("Call 52512345 to get your code");
  assert.equal(redacted, "Call [phone 1] to get your code");
});

test("the same number twice gets the same placeholder", () => {
  const { redacted, redactions } = check("Call 52512345. Again: 52512345");
  assert.equal(redacted, "Call [phone 1]. Again: [phone 1]");
  assert.equal(redactions.length, 1);
});

test("email local part is redacted, domain kept for lookalike checks", () => {
  const { redacted } = check("Reply to jean.pierre@mcb-secure-login.com urgently");
  assert.equal(redacted, "Reply to [email 1]@mcb-secure-login.com urgently");
});

test("URLs and domains are never redacted, even with digits in them", () => {
  const input = "Verify at https://mcb-mu.verify-account.co/login?id=12345678 or sbm-bank24.com/secure";
  assert.equal(check(input).redacted, input);
});

test("OTP codes near a code keyword are kept", () => {
  for (const input of [
    "Your OTP is 482913. Do not share it.",
    "482913 is your verification code",
    "Votre code de vérification: 12345678",
    "Kod ou: 5829",
    "PIN 1234",
  ]) {
    assert.equal(check(input).redacted, input, input);
  }
});

test("a bare 6-digit number with no context is kept (likely a code)", () => {
  const input = "Share 482913 with our agent";
  assert.equal(check(input).redacted, input);
});

test("currency amounts are kept", () => {
  for (const input of [
    "You won Rs 50,000!",
    "Pay Rs5000 now",
    "Montant: MUR 12 500.00",
    "Fee of 1,250,000 due",
    "Send €100 or $2500",
    "Ou finn gagn 25000 roupies",
    "Amount 15000.00 pending",
  ]) {
    assert.equal(check(input).redacted, input, input);
  }
});

test("dates are not mistaken for phone numbers", () => {
  const input = "Pay before 22/09/2026 or 22-09-26";
  assert.equal(check(input).redacted, input);
});

test("already-masked numbers are left alone", () => {
  const input = "Card XXXX4417 and ****4417 debited";
  assert.equal(check(input).redacted, input);
});

test("realistic code-switched scam keeps its signals and loses the identifiers", () => {
  const input =
    "MCB: Bonjour, ou kont 000456789012 inn bloke. Klik https://mcb-mu.help/verify ek met kod OTP 739201. " +
    "Si ou pa fer li zordi, Rs 15,000 pou debite. Info: +230 5789 1234 / support.mcb@gmail.com";
  const { redacted } = check(input);
  assert.match(redacted, /\[account ending 9012\]/);
  assert.match(redacted, /\[phone 1\]/);
  assert.match(redacted, /\[email 1\]@gmail\.com/);
  assert.match(redacted, /https:\/\/mcb-mu\.help\/verify/);
  assert.match(redacted, /OTP 739201/);
  assert.match(redacted, /Rs 15,000/);
  assert.doesNotMatch(redacted, /000456789012|5789 1234|support\.mcb@/);
});

test("restore also rewrites placeholders quoted in server text", () => {
  const { redactions } = redact("Call +230 5251 2345");
  assert.equal(restore("The number [phone 1] is not MCB's.", redactions), "The number +230 5251 2345 is not MCB's.");
});

test("text with nothing to redact is unchanged", () => {
  const input = "Hi, see you at 5pm for dinner!";
  const r = check(input);
  assert.equal(r.redacted, input);
  assert.equal(r.redactions.length, 0);
});
