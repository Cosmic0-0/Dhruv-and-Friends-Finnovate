import { describe, expect, test } from "vitest";
import { renderError, renderIdle, renderLoading, renderResult } from "../src/render";
import type { AnalyzeResponse, AnalyzeScreenshotResponse } from "../src/types";

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
    renderResult(root, response(), { bodyFormat: "text", bodyTruncated: false, quotedContextRemoved: false, headersAvailable: false, unavailable: ["internet headers"], urlsOmitted: 2, urlsShortened: 1, subject: "Updated payroll portal", fromAddress: "finance@demo-compan1.example" }, new Date(2026, 8, 23, 9, 5));
    expect(root.textContent).toContain("Verified / deterministic");
    expect(root.textContent).toContain("AI-inferred");
    expect(root.textContent).toContain("demo-company.example");
    expect(root.textContent).toContain("demo-compan1.example");
    expect(root.textContent).toContain("AI language analysis was unavailable");
    expect(root.textContent).toContain("2 approvals required");
    expect(root.textContent).toContain("Outlook evidence supplied: From, Subject");
    expect(root.textContent).toContain("Deterministic decision policy output");
    expect(root.textContent).toContain("AI did not calculate this score");
    expect(root.textContent).toContain("Updated payroll portal");
    expect(root.textContent).toContain("finance@demo-compan1.example");
    expect(root.textContent).toContain("2 very long links not submitted");
  });

  test("renders backend text as text, never as markup", () => {
    const root = document.createElement("main");
    const hostile = response();
    hostile.signals[0].description = "<img src=x onerror=alert(1)>";
    hostile.signals[0].severity = 'high" onclick="x';
    renderResult(root, hostile);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(root.querySelector("[onclick]")).toBeNull();
  });

  test("zero signals still render a result and the re-analyse button calls back", () => {
    const root = document.createElement("main");
    let clicks = 0;
    renderResult(root, response("low"), undefined, new Date(), () => { clicks++; });
    root.querySelector<HTMLButtonElement>(".secondary-button")!.click();
    expect(clicks).toBe(1);
    expect(root.querySelector(".finding")).toBeNull();
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

  test("idle screen offers a screenshot alternative that never claims uploads never happen", () => {
    const root = document.createElement("main");
    let picked: File | null = null;
    renderIdle(root, () => undefined, (file) => { picked = file; });
    const screenshotButton = root.querySelector<HTMLButtonElement>(".screenshot-button");
    expect(screenshotButton?.textContent).toBe("Check a screenshot instead");
    expect(root.textContent).not.toContain("Attachment contents are never uploaded.");
    expect(root.textContent).toContain("never uploaded as an attachment");
    expect(root.textContent).toContain("never stored");

    const input = root.querySelector<HTMLInputElement>(".screenshot-input")!;
    expect(input.accept).toContain("image/png");
    const file = new File([new Uint8Array(4)], "shot.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));
    expect(picked).toBe(file);
  });

  test("idle screen without a screenshot handler renders only the email button", () => {
    const root = document.createElement("main");
    renderIdle(root, () => undefined);
    expect(root.querySelector(".screenshot-button")).toBeNull();
    expect(root.querySelector(".screenshot-input")).toBeNull();
  });

  test("loading state names the screenshot path when analysing a screenshot", () => {
    const root = document.createElement("main");
    renderLoading(root, "screenshot");
    expect(root.textContent).toContain("Analysing screenshot");
  });

  function screenshotResponse(): AnalyzeScreenshotResponse {
    return { ...response("low"), extractedText: "redacted ocr text", imageForensics: { status: "unavailable", checksRun: [], checksSkipped: [{ check: "trufor", reason: "service down" }] } };
  }

  test("a screenshot result shows a minimal analysed note instead of a fabricated email extraction", () => {
    const root = document.createElement("main");
    renderResult(root, screenshotResponse(), undefined, new Date(2026, 8, 24, 10, 0));
    expect(root.textContent).toContain("Analysed screenshot");
    expect(root.textContent).not.toContain("Analysed email");
    expect(root.textContent).toContain("never stored");
    expect(root.querySelector(".analysed__subject")).toBeNull();
    expect(root.textContent).not.toContain("redacted ocr text"); // extractedText must never be shown, per the API contract
  });

  test("a screenshot result surfaces an unavailable imageForensics status like semantic status", () => {
    const root = document.createElement("main");
    renderResult(root, screenshotResponse());
    expect(root.textContent).toContain("Image forensics checks were unavailable");
  });

  test("an ok imageForensics status is not called out as a problem", () => {
    const root = document.createElement("main");
    const okResult: AnalyzeScreenshotResponse = { ...response("low"), extractedText: "text", imageForensics: { status: "ok", checksRun: ["error_level_analysis"], checksSkipped: [] } };
    renderResult(root, okResult);
    expect(root.textContent).not.toContain("Image forensics checks were unavailable");
  });
});
