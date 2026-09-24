import { describe, expect, test } from "vitest";
import { createController } from "../src/controller";
import type { AnalyzePayload, AnalyzeResponse, AnalyzeScreenshotResponse, ExtractionReport } from "../src/types";

const extraction = (subject: string): ExtractionReport => ({
  bodyFormat: "text", bodyTruncated: false, quotedContextRemoved: false, headersAvailable: true,
  unavailable: [], urlsOmitted: 0, urlsShortened: 0, subject, fromAddress: "a@b.example",
});
const payload = (message: string): AnalyzePayload => ({ source: "email", message, emailContext: {} as AnalyzePayload["emailContext"] });
const result = (level: AnalyzeResponse["risk"]["level"]): AnalyzeResponse => ({
  verdict: level, riskScore: 5, risk: { score: 5, level, confidence: "high" }, decision: "allow", signals: [], trace: [],
  actions: [{ id: "a", text: "Do the thing." }], analysis: { rulesetVersion: "rs", source: "email", semantic: { status: "ok" } },
});
const screenshotResult = (level: AnalyzeResponse["risk"]["level"]): AnalyzeScreenshotResponse => ({ ...result(level), extractedText: "OCR text" });
const aFile = () => new File([new Uint8Array(4)], "shot.png", { type: "image/png" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(overrides: Partial<Parameters<typeof createController>[0]> = {}) {
  const root = document.createElement("main");
  const controller = createController({
    root,
    extract: async () => ({ payload: payload("hi"), extraction: extraction("Subject A") }),
    analyze: async () => result("low"),
    ...overrides,
  });
  return { root, controller };
}

describe("task pane controller", () => {
  test("idle, loading, then a result showing the analysed subject", async () => {
    const { root, controller } = setup();
    controller.showIdle();
    expect(root.querySelector(".analyze-button")).not.toBeNull();
    await controller.run();
    expect(root.textContent).toContain("LOW RISK");
    expect(root.textContent).toContain("Subject A");
  });

  test("selecting another message discards an in-flight result instead of showing it", async () => {
    const slow = deferred<AnalyzeResponse>();
    const { root, controller } = setup({ analyze: () => slow.promise });
    controller.showIdle();
    const running = controller.run();
    await tick();
    expect(root.textContent).toContain("Analysing current message");
    controller.showIdle(); // what ItemChanged does
    slow.resolve(result("critical"));
    await running;
    expect(root.textContent).not.toContain("CRITICAL");
    expect(root.querySelector(".analyze-button")).not.toBeNull();
  });

  test("an older slow request cannot overwrite a newer result", async () => {
    const first = deferred<AnalyzeResponse>();
    const calls: Array<Promise<AnalyzeResponse>> = [first.promise, Promise.resolve(result("low"))];
    const { root, controller } = setup({ analyze: () => calls.shift()! });
    const older = controller.run();
    await tick();
    await controller.run();
    first.resolve(result("critical"));
    await older;
    expect(root.textContent).toContain("LOW RISK");
    expect(root.textContent).not.toContain("CRITICAL");
  });

  test("a stale failure does not replace the screen for the current message", async () => {
    const first = deferred<AnalyzeResponse>();
    const { root, controller } = setup({ analyze: () => first.promise });
    const older = controller.run();
    await tick();
    controller.showIdle();
    first.reject(new Error("boom"));
    await older;
    expect(root.textContent).not.toContain("boom");
  });

  test("a failure shows a retry that succeeds without reloading the add-in", async () => {
    let fail = true;
    const { root, controller } = setup({
      extract: async () => {
        if (fail) throw new Error("Open an email in Outlook before running FraudLens.");
        return { payload: payload("hi"), extraction: extraction("S") };
      },
    });
    await controller.run();
    expect(root.textContent).toContain("Open an email in Outlook");
    fail = false;
    root.querySelector<HTMLButtonElement>(".retry-button")!.click();
    await tick();
    await tick();
    expect(root.textContent).toContain("LOW RISK");
  });

  test("non-Error rejections still produce a readable message", async () => {
    const { root, controller } = setup({ analyze: () => Promise.reject("nope") });
    await controller.run();
    expect(root.querySelector(".error-state__copy")?.textContent).toMatch(/backend is reachable/);
  });
});

describe("screenshot analysis path", () => {
  test("picking a screenshot shows loading, then a result with no email extraction metadata", async () => {
    const { root, controller } = setup({
      buildScreenshotPayload: async (file) => ({ image: `data:${file.type};base64,aGk=` }),
      analyzeScreenshot: async () => screenshotResult("elevated"),
    });
    controller.showIdle();
    expect(root.querySelector(".screenshot-button")).not.toBeNull();
    const running = controller.runScreenshot(aFile());
    await Promise.resolve();
    expect(root.textContent).toContain("Analysing screenshot");
    await running;
    expect(root.textContent).toContain("ELEVATED RISK");
    expect(root.querySelector(".analysed__subject")).toBeNull();
  });

  test("a rejected file (wrong type/too large) shows a retryable error without calling the API", async () => {
    let analyzed = false;
    const { root, controller } = setup({
      buildScreenshotPayload: async () => { throw new Error("Choose a PNG, JPEG, or WEBP image."); },
      analyzeScreenshot: async () => { analyzed = true; return screenshotResult("low"); },
    });
    await controller.runScreenshot(aFile());
    expect(analyzed).toBe(false);
    expect(root.textContent).toContain("Choose a PNG, JPEG, or WEBP image.");
    expect(root.querySelector(".retry-button")).not.toBeNull();
  });

  test("selecting the current message while a screenshot analysis is in flight discards its result", async () => {
    const slow = deferred<AnalyzeScreenshotResponse>();
    const { root, controller } = setup({
      buildScreenshotPayload: async () => ({ image: "data:image/png;base64,aGk=" }),
      analyzeScreenshot: () => slow.promise,
    });
    const running = controller.runScreenshot(aFile());
    await tick();
    controller.showIdle();
    slow.resolve(screenshotResult("critical"));
    await running;
    expect(root.textContent).not.toContain("CRITICAL");
    expect(root.querySelector(".analyze-button")).not.toBeNull();
  });

  test("calling runScreenshot without configuring it fails cleanly instead of throwing", async () => {
    const root = document.createElement("main");
    const controller = createController({
      root,
      extract: async () => ({ payload: payload("hi"), extraction: extraction("S") }),
      analyze: async () => result("low"),
    });
    await controller.runScreenshot(aFile());
    expect(root.textContent).toContain("not configured");
  });
});
