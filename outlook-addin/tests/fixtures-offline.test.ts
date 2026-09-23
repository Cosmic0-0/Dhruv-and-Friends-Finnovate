// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { validResponse } from "../src/response";

interface Fixture {
  id: string;
  payload: { message: string; emailContext: unknown };
  expect: { codes?: string[]; families?: string[]; absentCodes?: string[]; level?: string };
}

type Analyse = (message: string, context: Record<string, unknown>) => Promise<{ risk: { level: string }; signals: Array<{ code: string }> }>;

let runPipeline: Analyse;
let validateEmailContext: (value: unknown) => { value?: unknown; error?: string };
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL("../demo/fixtures.json", import.meta.url), "utf8"));

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.LLM_MODE = "off";
  ({ runPipeline } = await import("../../backend/src/services/pipeline/index.js"));
  ({ validateEmailContext } = await import("../../backend/src/services/email-context/index.js"));
});

// Same expectations as `npm run smoke:demo`, but through the real validator
// and deterministic pipeline in-process, so the demo fixtures cannot silently
// drift from the API contract. The engine is not tuned to these fixtures.
describe("demo fixtures against the deterministic pipeline", () => {
  test("there is a spread of malicious, legitimate and ambiguous scenarios", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(9);
  });

  for (const fixture of fixtures) {
    test(fixture.id, async () => {
      const validated = validateEmailContext(fixture.payload.emailContext);
      expect(validated.error).toBeUndefined();
      const result = await runPipeline(fixture.payload.message, { emailContext: validated.value, semantic: { enabled: false }, now: Date.UTC(2026, 8, 23) });
      // The add-in's response check must accept every real pipeline response.
      expect(validResponse(JSON.parse(JSON.stringify(result)))).toBe(true);
      const codes = new Set(result.signals.map((signal) => signal.code));
      for (const code of fixture.expect.codes ?? []) expect(codes.has(code), `expected ${code}`).toBe(true);
      for (const family of fixture.expect.families ?? []) expect([...codes].some((code) => code.startsWith(`${family}-`)), `expected ${family}-*`).toBe(true);
      for (const code of fixture.expect.absentCodes ?? []) expect(codes.has(code), `unexpected ${code}`).toBe(false);
      if (fixture.expect.level) expect(result.risk.level).toBe(fixture.expect.level);
    });
  }
});
