// Seeds a SYNTHETIC scam wave into report_events for the live demo of
// community cluster/wave detection (services/community-signals).
//
//   npm run seed:wave            add 8 synthetic reports over the last ~6h
//   npm run seed:wave -- --clear remove every seeded row (and nothing else)
//
// Honesty rule: these are simulated reports, not real Mauritius data. Every
// row is tagged evidence.channel = "demo_seed" so it can be told apart from,
// and removed without touching, genuine reports. Say so out loud in the demo.
//
// DEMO SCRIPT (how this is shown live):
//   1. npm run seed:wave
//   2. Analyze a VARIANT of the seeded message (different amount/number), e.g.
//      "MCB: Your account is suspended. Verify now at https://mcb-secure.top/verify
//       or call 5251 2345 within 24h. Rs 7,500 fee."
//      -> result shows a community_wave signal: "reported by 8 different
//         people ... Nx the usual rate", adjustedRiskScore, riskAdjustments
//         with an auditRef.
//   3. Analyze a GENUINE message linking only mcb.mu -> no community boost,
//      however often it is reported (anti-poisoning guard).
//   4. npm run seed:wave -- --clear

import { db } from "../src/db/index.js";
import { recordUserReport } from "../src/services/community-signals/index.js";

const SEED_CHANNEL = "demo_seed";
const MINUTE = 60 * 1000;

// Near-duplicate variants of one fictional campaign, as a real wave looks:
// same template and lookalike host, varying amounts/wording. Placeholders
// stand in for phone numbers, exactly as redacted client text arrives.
const VARIANTS = [
  "MCB: Your account is suspended. Verify now at https://mcb-secure.top/verify or call [phone 1] within 24h. Rs 5,000 fee.",
  "MCB: Your account is suspended. Verify now at https://mcb-secure.top/login or call [phone 1] within 12h. Rs 2,500 fee.",
  "MCB: Your account is blocked. Verify now at https://mcb-secure.top/verify or call [phone 1] within 24h. Rs 5,000 fee.",
  "MCB: Ou kont inn bloke. Verifye zordi lor https://mcb-secure.top/verify ouswa apel [phone 1]. Fre Rs 3,000.",
];

if (process.argv.includes("--clear")) {
  const { changes } = db
    .prepare("DELETE FROM report_events WHERE json_extract(evidence, '$.channel') = ?")
    .run(SEED_CHANNEL);
  console.log(`Removed ${changes} seeded demo report event(s).`);
} else {
  const now = Date.now();
  for (let i = 0; i < 8; i++) {
    recordUserReport({
      sender: "5251 2345",
      message: VARIANTS[i % VARIANTS.length],
      // RFC 5737 documentation range - never a real client address.
      ip: `198.51.100.${i + 10}`,
      now: now - i * 45 * MINUTE,
      channel: SEED_CHANNEL,
    });
  }
  console.log("Seeded 8 SYNTHETIC report events (8 distinct pseudonymous reporters, last ~6h).");
  console.log("Remove with: npm run seed:wave -- --clear");
}
