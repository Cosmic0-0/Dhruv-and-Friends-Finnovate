import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = ":memory:";
const { recordFingerprint, getFingerprintMatches, attachScamDna } = await import("./index.js");

test("same type and claimed identity merge distinct senders and domains", () => {
 const first = recordFingerprint({ scamType:"MCB_IMPERSONATION", claimedIdentity:"MCB", sender:"Sender-A", domains:["mcb-one.top"] });
 assert.equal(first.previous, null);
 const second = recordFingerprint({ scamType:"MCB_IMPERSONATION", claimedIdentity:"mcb", sender:"Sender-B", domains:["mcb-two.top", "mcb-two.top"] });
 assert.equal(first.fingerprintId, second.fingerprintId);
 assert.equal(second.messageCount, 2);
 assert.deepEqual(second.senders,["Sender-A","Sender-B"]);
 assert.equal(second.domains.length,2);
 assert.equal(second.previous.messageCount,1);
 assert.equal(getFingerprintMatches("absent"),null);
});
test("same claimed identity merges even when the LLM classifies a different scamType each time", () => {
 // Real-world LLM variance: two near-identical MCB-impersonation messages
 // were observed classifying as MCB_IMPERSONATION vs BANK_ONE_IMPERSONATION
 // in live testing. The claimed identity is the stable "same campaign"
 // signal here, not the tactic label - see the comment in index.js.
 const first = recordFingerprint({ scamType: "MCB_IMPERSONATION", claimedIdentity: "Absa", sender: "Sender-C" });
 const second = recordFingerprint({ scamType: "BANK_ONE_IMPERSONATION", claimedIdentity: "Absa", sender: "Sender-D" });
 assert.equal(first.fingerprintId, second.fingerprintId);
 assert.equal(second.messageCount, 2);
});

test("first sighting has zero related counts and no fabricated sender node", () => {
 const result = { verdict:"scam", sender:"SBM", signals:[], scamProfile:{type:"SBM_IMPERSONATION",claimedIdentity:"SBM"} };
 attachScamDna(result);
 assert.equal(result.scamDna.matchStrength,"new");
 assert.equal(result.scamDna.relatedReports,0);
 assert.equal(result.scamDna.relatedSenders,0);
 assert.deepEqual(getFingerprintMatches(result.scamDna.fingerprintId).senders,[]);
 attachScamDna(result);
 assert.equal(result.scamDna.matchStrength,"matched");
 assert.equal(result.scamDna.relatedReports,1);
});
test("safe checks do not create fingerprints and redacted senders are not stored", () => {
 const result = {verdict:"safe",signals:[],scamProfile:{type:"FAKE_PARCEL",claimedIdentity:"Parcel"}};
 attachScamDna(result); assert.equal(result.scamDna,undefined);
 const record=recordFingerprint({scamType:"FAKE_PARCEL",claimedIdentity:"Parcel",sender:"[PHONE]"});
 assert.deepEqual(record.senders,[]);
});
