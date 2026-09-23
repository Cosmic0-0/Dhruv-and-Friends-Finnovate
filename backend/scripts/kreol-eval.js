// Kreol language-layer evaluation. Deterministic (no LLM), reproducible.
//
//   npm run eval:kreol                       # print report
//   npm run eval:kreol -- --out ../data/kreol-derived/reports/kreol-after.json --label after
//
// Fixtures live in data/evaluation/kreol/ (draft_generated / synthetic_claude,
// NOT production grounding data). Each case has a `split`: "dev" cases may be
// used while iterating on rules; "heldout" cases are only read for the final
// number, never to shape a rule around their exact wording.
//
// Sections the code under test does not implement yet are reported as
// "no baseline implementation" rather than scored - nothing is faked.

process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = process.env.DOMAIN_AGE_TIMEOUT_MS || "1";

import { readFileSync, writeFileSync } from "node:fs";

const { runPipeline } = await import("../src/services/pipeline/index.js");
const lexicon = await import("../src/services/lexicon/index.js");

const args = process.argv.slice(2);
const argOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const outPath = argOf("--out");
const label = argOf("--label") || "run";
const root = new URL("../../data/evaluation/kreol/", import.meta.url);

const loadJsonl = (file) =>
  readFileSync(new URL(file, root), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const optional = async (spec) => {
  try {
    return await import(spec);
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND") return null;
    throw err;
  }
};

const fraudCases = loadJsonl("fraud-cases.jsonl");
const langCases = loadJsonl("language-classification.jsonl");
const pct = (n, d) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);
const fmt = (v) => (v === null || v === undefined ? "n/a" : `${v}%`);

// ---------------------------------------------------------------- fraud cases
const results = [];
for (const c of fraudCases) {
  const r = await runPipeline(c.message, { semantic: { enabled: false } });
  const codes = new Set(r.signals.map((s) => s.code));
  const missing = c.expectedSignals.filter((x) => !codes.has(x));
  const forbidden = c.forbiddenSignals.filter((x) => codes.has(x));
  results.push({ ...c, level: r.risk.level, codes: [...codes].sort(), missing, forbidden, pass: missing.length === 0 && forbidden.length === 0 });
}

function summarise(rows) {
  const expected = rows.reduce((n, r) => n + r.expectedSignals.length, 0);
  const found = rows.reduce((n, r) => n + (r.expectedSignals.length - r.missing.length), 0);
  const forbiddenChecks = rows.reduce((n, r) => n + r.forbiddenSignals.length, 0);
  const forbiddenHits = rows.reduce((n, r) => n + r.forbidden.length, 0);
  const legit = rows.filter((r) => r.expectedSignals.length === 0);
  return {
    cases: rows.length,
    casesPassed: rows.filter((r) => r.pass).length,
    casePassRate: pct(rows.filter((r) => r.pass).length, rows.length),
    expectedSignalRecall: pct(found, expected),
    forbiddenSignalViolations: `${forbiddenHits}/${forbiddenChecks}`,
    legitCases: legit.length,
    legitLevelFalsePositiveRate: pct(legit.filter((r) => r.level !== "low").length, legit.length),
  };
}

const byFamily = {};
for (const fam of [...new Set(results.map((r) => r.family))]) byFamily[fam] = summarise(results.filter((r) => r.family === fam));
const bySplit = {};
for (const s of ["dev", "heldout"]) bySplit[s] = summarise(results.filter((r) => r.split === s));
const kreolRows = results.filter((r) => r.language_mix.startsWith("mfe"));
const controlRows = results.filter((r) => !r.language_mix.startsWith("mfe"));

// variant consistency: within a group, every member must produce the identical code set
const groups = {};
for (const r of results.filter((x) => x.family === "orthographic_variant")) (groups[r.group] ||= []).push(r);
const variantGroups = Object.entries(groups).map(([g, rows]) => {
  const sets = new Set(rows.map((r) => r.codes.join(",")));
  return { group: g, split: rows[0].split, members: rows.length, consistent: sets.size === 1, allPass: rows.every((r) => r.pass) };
});
const negationRows = results.filter((r) => r.family === "negation");
const conditionalRows = results.filter((r) => r.family === "conditional_threat");
const codeSwitchRows = results.filter((r) => r.family === "code_switch");

// ------------------------------------------------------- language classification
const mixMod = await optional("../src/services/kreol/language.js");
function classify(text) {
  if (mixMod?.detectLanguageMix) return mixMod.detectLanguageMix(text);
  const legacy = lexicon.detectLanguage(text); // "en" | "fr" | "kreol"
  return { primary: legacy === "kreol" ? "mfe" : legacy, languages: null, mixed: null };
}
const langRows = langCases.map((c) => {
  const got = classify(c.text);
  return {
    ...c,
    got,
    primaryOk: got.primary === c.expectedPrimary,
    mixedOk: got.mixed === null ? null : got.mixed === c.expectedMixed,
    langsOk: got.languages ? [...got.languages].sort().join() === [...c.expectedLanguages].sort().join() : null,
  };
});
const langSummary = (rows) => ({
  cases: rows.length,
  primaryAccuracy: pct(rows.filter((r) => r.primaryOk).length, rows.length),
  mixedDetectionAccuracy: rows[0].mixedOk === null ? "no baseline implementation (detector cannot represent 'mixed')" : pct(rows.filter((r) => r.mixedOk).length, rows.length),
  languageSetAccuracy: rows[0].langsOk === null ? "no baseline implementation" : pct(rows.filter((r) => r.langsOk).length, rows.length),
  kreolRecall: pct(
    rows.filter((r) => r.expectedLanguages.includes("mfe") && (r.got.primary === "mfe" || r.got.languages?.includes("mfe"))).length,
    rows.filter((r) => r.expectedLanguages.includes("mfe")).length
  ),
});

// ------------------------------------------------------ optional capabilities
async function entitySection() {
  const mod = await optional("../src/services/kreol/entities.js");
  if (!mod) return "no baseline implementation";
  const samples = [
    ["Ou finn gagn Rs 8,500. Call 52581234. Visit https://example.test/login", ["Rs 8,500", "52581234", "https://example.test/login"]],
    ["Avoy mwa OTP 482911 lor a.b@example.test", ["482911", "a.b@example.test"]],
    ["Pey Rs 12,500 lor secure-mcb-login.top avan 24h", ["Rs 12,500", "secure-mcb-login.top"]],
    ["Send MUR 3 000 to account 000123456789", ["MUR 3 000", "000123456789"]],
  ];
  let total = 0;
  let kept = 0;
  let roundTrip = 0;
  let mutationsCaught = 0;
  let mutations = 0;
  for (const [text, ents] of samples) {
    const p = mod.protectEntities(text);
    total += ents.length;
    kept += ents.filter((e) => p.entities.some((x) => x.value === e)).length;
    if (mod.restoreEntities(p.text, p.entities) === text) roundTrip++;
    for (const e of p.entities) {
      mutations++;
      const alteredValue = e.value.replace(/\d/, (d) => String((Number(d) + 1) % 10)) + "x";
      const mutated = p.text.replace(e.placeholder, alteredValue);
      if (!mod.validateEntities(mutated, p.entities).ok) mutationsCaught++;
    }
  }
  return { entitiesExpected: total, entitiesProtected: kept, protectedPct: pct(kept, total), roundTripExact: `${roundTrip}/${samples.length}`, alteredEntityRejected: `${mutationsCaught}/${mutations}` };
}

const report = {
  label,
  node: process.version,
  fixtures: { fraudCases: fraudCases.length, languageCases: langCases.length, status: "draft_generated/synthetic_claude - not human reviewed" },
  fraud: {
    all: summarise(results),
    bySplit,
    kreolSubset: summarise(kreolRows),
    englishFrenchControls: summarise(controlRows),
    byFamily,
    negation: summarise(negationRows),
    conditionalThreat: summarise(conditionalRows),
    codeSwitch: summarise(codeSwitchRows),
    orthographicVariantGroups: {
      groups: variantGroups.length,
      consistent: variantGroups.filter((g) => g.consistent).length,
      consistentAndCorrect: variantGroups.filter((g) => g.consistent && g.allPass).length,
      detail: variantGroups,
    },
  },
  languageClassification: { all: langSummary(langRows), dev: langSummary(langRows.filter((r) => r.split === "dev")), heldout: langSummary(langRows.filter((r) => r.split === "heldout")) },
  entityPreservation: await entitySection(),
  failures: results.filter((r) => !r.pass).map((r) => ({ id: r.id, split: r.split, family: r.family, message: r.message, missing: r.missing, forbidden: r.forbidden, level: r.level })),
  languageMisses: langRows.filter((r) => !r.primaryOk || r.mixedOk === false).map((r) => ({ id: r.id, text: r.text, expected: [r.expectedPrimary, r.expectedMixed], got: r.got })),
};

console.log(`Kreol evaluation [${label}] node ${process.version}`);
const line = (name, s) =>
  console.log(`${name.padEnd(26)} cases=${String(s.cases).padStart(2)} pass=${fmt(s.casePassRate).padStart(6)} signalRecall=${fmt(s.expectedSignalRecall).padStart(6)} forbiddenViolations=${s.forbiddenSignalViolations} legitFPR=${fmt(s.legitLevelFalsePositiveRate)}`);
line("ALL fraud cases", report.fraud.all);
line("  dev", bySplit.dev);
line("  heldout", bySplit.heldout);
line("  kreol (mfe*) rows", report.fraud.kreolSubset);
line("  en/fr controls", report.fraud.englishFrenchControls);
for (const [fam, s] of Object.entries(byFamily)) line(`  family ${fam}`, s);
const vg = report.fraud.orthographicVariantGroups;
console.log(`variant groups consistent  ${vg.consistent}/${vg.groups} (consistent AND correct: ${vg.consistentAndCorrect})`);
console.log("language classification   ", JSON.stringify(report.languageClassification.all));
console.log("entity preservation       ", JSON.stringify(report.entityPreservation));
console.log(`failures: ${report.failures.length}`);
for (const f of report.failures) console.log(`  ${f.id} [${f.split}/${f.family}] missing=${f.missing.join(",") || "-"} forbidden=${f.forbidden.join(",") || "-"} :: ${f.message.slice(0, 70)}`);

if (outPath) {
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
}
process.exit(0);
