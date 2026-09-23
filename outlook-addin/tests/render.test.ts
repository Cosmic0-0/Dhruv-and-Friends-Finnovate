import { describe, expect, test } from "vitest";
import { renderError, renderIdle, renderLoading, renderResult } from "../src/render";
import type { AnalyzeResponse } from "../src/types";

function response(level: "low" | "high" = "high"): AnalyzeResponse {
  return {
    verdict: `${level.toUpperCase()} RISK`, riskScore: level === "low" ? 3 : 79,
    risk: { score: level === "low" ? 3 : 79, level, confidence: "high" }, decision: level === "low" ? "allow" : "verify",
    signals: level === "low" ? [] : [
      {
        code: "ORG-01", description: "Protected organisation domain lookalike", severity: "high", sourceType: "rule",
        evidence: "demo-compan1.example", metadata: { comparison: { protectedDomain: "demo-company.example", observedDomain: "demo-compan1.example", technique: "character_substitution" } },
      },
      { code: "SOC-03", description: "Urgency pressure", severity: "medium", sourceType: "semantic_model" },
    ],
    trace: [{ id: "base-ORG-01", points: 24, reason: "Verified domain mismatch" }],
    actions: [{ id: "verify", text: "Verify through a known channel." }],
    verification: {
      policyVersion: "verification-1.0", required: true, reportTo: "security@demo-company.example",
      workflows: [{ id: "payment", title: "Urgent payment request", owner: "Finance", steps: ["Hold payment.", "Call the known number."], requiredApprovals: 2, triggeredBy: ["ORG-01"] }],
    },
    analysis: {
      rulesetVersion: "rs-1.2", source: "email", semantic: { status: "unavailable" },
      email: { availableEvidence: ["from", "subject"], checks: {} },
      organisation: { campaigns: [], senderRelation: "external_lookalike" },
    },
  };
}

describe("task pane rendering", () => {
  test("separates verified facts from AI interpretation and explains comparisons", () => {
    const root = document.createElement("main");
    renderResult(root, response(), { bodyFormat: "text", bodyTruncated: false, quotedContextRemoved: false, headersAvailable: false, unavailable: ["internet headers"] });
    expect(root.textContent).toContain("Verified / deterministic");
    expect(root.textContent).toContain("AI-inferred");
    expect(root.textContent).toContain("demo-company.example");
    expect(root.textContent).toContain("demo-compan1.example");
    expect(root.textContent).toContain("AI language analysis was unavailable");
    expect(root.textContent).toContain("2 approvals required");
    expect(root.textContent).toContain("Outlook evidence supplied: From, Subject");
    expect(root.textContent).toContain("Deterministic decision policy output");
    expect(root.textContent).toContain("AI did not calculate this score");
  });

  test("low risk copy never claims an email is guaranteed safe", () => {
    const root = document.createElement("main");
    renderResult(root, response("low"));
    expect(root.textContent).toContain("not a guarantee of authenticity");
    expect(root.textContent).not.toMatch(/guaranteed safe/i);
  });

  test("idle, loading and retry states stay actionable", () => {
    const root = document.createElement("main");
    renderIdle(root, () => undefined);
    expect(root.querySelector("button")?.textContent).toBe("Analyse email");
    renderLoading(root);
    expect(root.textContent).toContain("Checking facts");
    renderError(root, "Backend unavailable", () => undefined);
    expect(root.querySelector("button")?.textContent).toBe("Try again");
  });
});
