// Writes the document-forensics demo fixtures to data/test-payloads/documents/
// (see the README there for what each one should show). The same builders
// generate these files in memory for the unit tests, so the tests never
// depend on the committed copies.
//
// Run with: npm run fixtures:documents (from backend/)

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DEMO_FIXTURES } from "../src/services/document-forensics/fixture-builders.js";

const outDir = fileURLToPath(new URL("../../data/test-payloads/documents/", import.meta.url));
await mkdir(outDir, { recursive: true });
for (const [name, build] of Object.entries(DEMO_FIXTURES)) {
  const bytes = await build();
  await writeFile(`${outDir}${name}`, bytes);
  console.log(`${name.padEnd(24)} ${String(bytes.length).padStart(7)} bytes`);
}
console.log(`\nWrote ${Object.keys(DEMO_FIXTURES).length} fixtures to ${outDir}`);
