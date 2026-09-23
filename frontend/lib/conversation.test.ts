import { test } from "node:test";
import assert from "node:assert/strict";
import { furthestJourney } from "./conversation.ts";
import type { AnalyzeResponse, ScamStage } from "./types.ts";

function response(stage?: ScamStage): AnalyzeResponse {
  return { verdict: "suspicious", signals: [], explanation: "A warning", suggestedAction: "Verify independently", ...(stage ? { journey: { currentStage: stage, likelyNextStages: [{ stage: "ACCOUNT_TAKEOVER" as const, reason: `Following ${stage}` }] } } : {}) };
}

test("conversation retains advanced stage and its own reasons after lower and unresolved messages", () => {
  const advanced = response("OTP_REQUEST");
  assert.equal(furthestJourney([response("INITIAL_CONTACT"), advanced, response("TRUST_BUILDING"), response()]), advanced);
});

test("conversation advances when a later stage appears", () => {
  const advanced = response("PAYMENT_PRESSURE");
  assert.equal(furthestJourney([response("AUTHORITY_CLAIM"), response("PAYMENT_REQUEST"), advanced]), advanced);
});

test("an unresolved conversation has no invented journey", () => {
  assert.equal(furthestJourney([]), undefined);
  assert.equal(furthestJourney([response(), response()]), undefined);
});

test("repeated same-stage messages retain first observed progression", () => {
  const first = response("URGENCY");
  assert.equal(furthestJourney([first, response("URGENCY")]), first);
});
