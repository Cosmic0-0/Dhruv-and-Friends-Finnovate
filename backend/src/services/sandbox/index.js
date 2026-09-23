import { callLLM } from "../analysis/llmClient.js";
import { PLAYBOOKS, STAGE_TACTICS, getSandboxLines } from "../playbooks/index.js";
export const MAX_SANDBOX_TURNS = 5;

// Demo: force transport failure to demonstrate that the lesson continues with a known playbook line.
export async function nextSandboxTurn({ scamType, stage, turnIndex }, generate = callLLM) {
  const playbook = PLAYBOOKS[scamType];
  const typicalStages = playbook.typicalStages;
  const common = { simulated: true, scamType, stage, turnIndex, typicalStages, tactic: STAGE_TACTICS[stage] };
  if (turnIndex >= MAX_SANDBOX_TURNS) return { ...common, ended: true, line: null, nextStage: null, source: "ended" };
  const examples = getSandboxLines(scamType, stage);
  let line = examples[turnIndex % examples.length];
  let source = "scripted";
  try {
    const { text } = await generate(`Educational, labeled scam simulation. Never communicate with anyone. Generate one short fictional scammer line illustrating ONLY this tactic: ${JSON.stringify(STAGE_TACTICS[stage])}.
Playbook: ${playbook.label}. Stage: ${stage}. Examples: ${JSON.stringify(examples)}.
Use no real links, domains, phone numbers, payment addresses, HTML, or instructions outside this simulation. Return exactly JSON {"line":"one line, at most 240 characters"}.`);
    const candidate = JSON.parse(text)?.line;
    // Reject malformed or actionable contact details rather than passing raw model text into the UI.
    if (typeof candidate === "string" && candidate.trim().length >= 10 && candidate.length <= 240 &&
      !/[\r\n<>]|https?:|www\.|\b[\w-]+\.[a-z]{2,}\b|\+?\d[\d ()-]{7,}\d|@/i.test(candidate)) {
      line = candidate.trim();
      source = "llm";
    }
  } catch { /* Keep the deterministic, grounded fallback. */ }
  const index = typicalStages.indexOf(stage);
  return { ...common, ended: false, line, source, nextStage: turnIndex + 1 >= MAX_SANDBOX_TURNS ? null : typicalStages[index + 1] || null };
}
