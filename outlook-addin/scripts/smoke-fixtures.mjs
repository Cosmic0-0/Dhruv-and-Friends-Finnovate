import { readFile } from "node:fs/promises";

const api = String(process.env.FRAUDLENS_API_URL || "http://localhost:4000/api").replace(/\/$/, "");
const fixtures = JSON.parse(await readFile(new URL("../demo/fixtures.json", import.meta.url), "utf8"));
let failures = 0;

for (const fixture of fixtures) {
  const response = await fetch(`${api}/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fixture.payload),
  });
  const result = await response.json();
  const codes = new Set((result.signals || []).map((signal) => signal.code));
  const missing = (fixture.expect.codes || []).filter((code) => !codes.has(code));
  const missingFamilies = (fixture.expect.families || []).filter((family) => ![...codes].some((code) => code.startsWith(`${family}-`)));
  const forbidden = (fixture.expect.absentCodes || []).filter((code) => codes.has(code));
  const levelMismatch = fixture.expect.level && result.risk?.level !== fixture.expect.level;
  const ok = response.ok && !missing.length && !missingFamilies.length && !forbidden.length && !levelMismatch;
  console.log(`${ok ? "PASS" : "FAIL"} ${fixture.id}: ${result.risk?.level ?? response.status} [${[...codes].join(", ")}]`);
  if (!ok) {
    failures++;
    console.error(JSON.stringify({ missing, missingFamilies, forbidden, expectedLevel: fixture.expect.level, actualLevel: result.risk?.level, error: result.error }));
  }
}

if (failures) process.exitCode = 1;
else console.log(`All ${fixtures.length} Outlook demo fixtures passed.`);
