// Seeds SYNTHETIC daily counters into radar_daily/radar_domain_daily for the
// live demo of the Radar page (services/radar), which is otherwise honestly
// empty until real checked messages accumulate.
//
//   npm run seed:radar            add ~13 months of synthetic daily counts
//   npm run seed:radar -- --clear remove every seeded row (and nothing else)
//
// Honesty rule: these are simulated counts, not real Mauritius scam
// activity. Every row is tagged source = "demo_seed" (radar/index.js), the
// same pattern scripts/seed-wave-demo.js uses for its own synthetic report
// events, so seeded rows are always distinguishable from and removable
// without touching genuine ones. Say so out loud when showing seeded Radar
// data live.
//
// Every value used (scam types, institutions, channels) comes from this
// app's own real taxonomies (services/playbooks SCAM_TYPES, services/channel
// CHANNELS, data/institution-registry.json display names) rather than
// invented categories, so the shape of the data matches what the pipeline
// would actually produce - only the volume and dates are synthetic.

import { recordRadarObservation, purgeExpiredRadarData } from "../src/services/radar/index.js";
import { db } from "../src/db/index.js";

const SOURCE = "demo_seed";
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_BACK = 13;

if (process.argv.includes("--clear")) {
  const a = db.prepare("DELETE FROM radar_daily WHERE source = ?").run(SOURCE).changes;
  const b = db.prepare("DELETE FROM radar_domain_daily WHERE source = ?").run(SOURCE).changes;
  console.log(`Removed ${a} seeded radar_daily row(s) and ${b} seeded radar_domain_daily row(s).`);
  process.exit(0);
}

// { scamType, claimedIdentity, channels, domain, imitates, weight }. weight
// is the relative frequency in recent months; MOBILE_MONEY_FRAUD ramps up
// separately below so "Rising fast" has something real to point at.
const PROFILES = [
  { scamType: "MCB_IMPERSONATION", claimedIdentity: "MCB", channels: ["sms", "whatsapp"], domain: "mcb-secure.top", imitates: "MCB", weight: 5 },
  { scamType: "SBM_IMPERSONATION", claimedIdentity: "SBM", channels: ["sms", "whatsapp"], domain: "sbm-verify.online", imitates: "SBM", weight: 4 },
  { scamType: "ABSA_IMPERSONATION", claimedIdentity: "Absa", channels: ["sms", "email"], domain: "absa-alert.info", imitates: "Absa", weight: 2 },
  { scamType: "BANK_ONE_IMPERSONATION", claimedIdentity: "Bank One", channels: ["sms", "email"], domain: "bankone-secure.net", imitates: "Bank One", weight: 2 },
  { scamType: "TELCO_PRIZE_SCAM", claimedIdentity: "my.t", channels: ["sms", "call"], domain: "myt-prizes.com", imitates: "my.t", weight: 4 },
  { scamType: "FAKE_PARCEL", claimedIdentity: "", channels: ["sms", "whatsapp"], domain: "mu-post-delivery.com", imitates: "", weight: 6 },
  { scamType: "MARKETPLACE_PAYMENT_FRAUD", claimedIdentity: "", channels: ["facebook", "whatsapp"], domain: "", imitates: "", weight: 5 },
];
const RISING = { scamType: "MOBILE_MONEY_FRAUD", claimedIdentity: "my.t", channels: ["sms", "whatsapp"], domain: "myt-money-refund.com", imitates: "my.t" };

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const weightedProfile = () => {
  const total = PROFILES.reduce((s, p) => s + p.weight, 0);
  let r = rand(total);
  for (const p of PROFILES) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return PROFILES[0];
};

const now = Date.now();
let count = 0;

for (let daysAgo = MONTHS_BACK * 30; daysAgo >= 0; daysAgo--) {
  const day = now - daysAgo * DAY_MS;
  const monthsAgo = daysAgo / 30;
  // Background traffic: 1-4/day, mildly busier in the most recent ~2 months.
  const base = monthsAgo < 2 ? 2 + rand(3) : 1 + rand(3);
  for (let i = 0; i < base; i++) {
    const p = weightedProfile();
    const verdict = rand(10) < 8 ? "scam" : "suspicious";
    const result = {
      verdict,
      scamProfile: { type: p.scamType, claimedIdentity: p.claimedIdentity || null },
      analysis: { channel: pick(p.channels) },
      signals: p.domain
        ? [{ type: "lookalike_url", domain: p.domain, officialDomain: null, claimedIdentity: p.imitates }]
        : [],
    };
    recordRadarObservation(result, day - rand(DAY_MS), SOURCE);
    count++;
  }
  // MOBILE_MONEY_FRAUD: near-absent until ~6 weeks ago, then ramps up hard -
  // a real "Rising fast" story for the most recent 7d/30d ranges.
  const risingCount = monthsAgo > 1.5 ? 0 : monthsAgo > 0.7 ? rand(2) : 2 + rand(4);
  for (let i = 0; i < risingCount; i++) {
    recordRadarObservation(
      {
        verdict: "scam",
        scamProfile: { type: RISING.scamType, claimedIdentity: RISING.claimedIdentity },
        analysis: { channel: pick(RISING.channels) },
        signals: [{ type: "lookalike_url", domain: RISING.domain, officialDomain: null, claimedIdentity: RISING.imitates }],
      },
      day - rand(DAY_MS),
      SOURCE,
    );
    count++;
  }
}

purgeExpiredRadarData(now);
console.log(`Seeded ${count} SYNTHETIC radar observations across ~${MONTHS_BACK} months (source = "${SOURCE}").`);
console.log("Remove with: npm run seed:radar -- --clear");
