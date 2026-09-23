import { describe, expect, test } from "vitest";
import { createController } from "../src/controller";
import { renderResult } from "../src/render";
import { validResponse } from "../src/response";
import type { AnalyzePayload, AnalyzeResponse, ExtractionReport } from "../src/types";

const report = (subject: string, fromAddress = "a@b.example"): ExtractionReport => ({
  bodyFormat: "text", bodyTruncated: false, quotedContextRemoved: false, headersAvailable: true,
  unavailable: [], urlsOmitted: 0, urlsShortened: 0, subject, fromAddress,
});
const payload = {} as AnalyzePayload;
const good = (level: AnalyzeResponse["risk"]["level"] = "low"): AnalyzeResponse => ({
  verdict: level, riskScore: 5, risk: { score: 5, level, confidence: "high" }, decision: "allow", signals: [], trace: [],
  actions: [{ id: "a", text: "Do the thing." }], analysis: { rulesetVersion: "rs", source: "email", semantic: { status: "ok" } },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A fake mailbox whose "current item" the tests can switch, like Outlook does. */
function mailbox() {
  const state = { subject: "Email A" };
  let extractions = 0;
  const pending: Array<ReturnType<typeof deferred<AnalyzeResponse>>> = [];
  const root = document.createElement("main");
  const clock = { t: 0 };
  const controller = createController({
    root,
    extract: async () => { extractions++; return { payload, extraction: report(state.subject) }; },
    analyze: () => { const d = deferred<AnalyzeResponse>(); pending.push(d); return d.promise; },
    now: () => new Date(2026, 8, 23, 9, clock.t++),
  });
  return { root, controller, state, pending, extractions: () => extractions };
}

describe("message-switch state machine", () => {
  test("B: analyse A, switch to B, analyse B, B resolves, A resolves later: B stays", async () => {
    const m = mailbox();
    m.controller.showIdle();
    const a = m.controller.run();
    await tick();
    m.state.subject = "Email B";
    m.controller.showIdle();
    const b = m.controller.run();
    await tick();
    m.pending[1].resolve(good("low"));
    await b;
    m.pending[0].resolve(good("critical"));
    await a;
    expect(m.root.textContent).toContain("Email B");
    expect(m.root.textContent).toContain("LOW RISK");
    expect(m.root.textContent).not.toContain("CRITICAL");
  });

  test("C: analyse A, switch to B, A fails: no error appears for B", async () => {
    const m = mailbox();
    const a = m.controller.run();
    await tick();
    m.controller.showIdle();
    m.pending[0].reject(new Error("A exploded"));
    await a;
    expect(m.root.textContent).not.toContain("A exploded");
    expect(m.root.querySelector(".analyze-button")).not.toBeNull();
  });

  test("D: rapid repeated runs are deterministic: the newest wins and each re-reads the item", async () => {
    const m = mailbox();
    const first = m.controller.run();
    await tick();
    const second = m.controller.run();
    await tick();
    expect(m.extractions()).toBe(2);
    m.pending[1].resolve(good("elevated"));
    await second;
    m.pending[0].resolve(good("critical"));
    await first;
    expect(m.root.textContent).toContain("ELEVATED RISK");
    expect(m.root.textContent).not.toContain("CRITICAL");
  });

  test("E: a response arriving after the pane reset never resurrects a result", async () => {
    const m = mailbox();
    const running = m.controller.run();
    await tick();
    m.controller.showIdle();
    m.controller.showError("Open this add-in from Outlook with a message selected.");
    m.pending[0].resolve(good("high"));
    await running;
    expect(m.root.textContent).toContain("Open this add-in from Outlook");
    expect(m.root.textContent).not.toContain("HIGH RISK");
  });

  test("Analyse again re-reads the item, shows loading and refreshes the timestamp", async () => {
    const m = mailbox();
    const first = m.controller.run();
    await tick();
    m.pending[0].resolve(good("low"));
    await first;
    const firstTime = m.root.querySelector(".analysed__meta")?.textContent;
    expect(m.root.textContent).toContain("Email A");

    m.state.subject = "Email A (edited view)";
    m.root.querySelector<HTMLButtonElement>(".secondary-button")!.click();
    await tick();
    expect(m.root.textContent).toContain("Analysing current message");
    expect(m.root.querySelector(".secondary-button")).toBeNull();
    m.pending[1].resolve(good("low"));
    await tick();
    expect(m.extractions()).toBe(2);
    expect(m.root.textContent).toContain("Email A (edited view)");
    expect(m.root.querySelector(".analysed__meta")?.textContent).not.toBe(firstTime);
  });

  test("a render failure is reported generically instead of leaving a half-drawn pane", async () => {
    const root = document.createElement("main");
    const controller = createController({
      root,
      extract: async () => ({ payload, extraction: report("S") }),
      analyze: async () => ({ ...good(), signals: [{ code: "X", description: "d", severity: "high", sourceType: "rule", metadata: { comparison: 5 as never } }] }),
    });
    await controller.run();
    expect(root.textContent).not.toMatch(/TypeError|undefined/);
  });
});

describe("API response boundary", () => {
  const mutate = (change: (r: Record<string, unknown>) => void) => {
    const copy = JSON.parse(JSON.stringify(good())) as Record<string, unknown>;
    change(copy);
    return copy;
  };
  test.each([
    ["null response", null],
    ["array response", []],
    ["risk level", mutate((r) => { (r.risk as Record<string, unknown>).level = "meh"; })],
    ["string score", mutate((r) => { (r.risk as Record<string, unknown>).score = "high"; })],
    ["missing risk", mutate((r) => { delete r.risk; })],
    ["null signal", mutate((r) => { r.signals = [null]; })],
    ["signal without severity", mutate((r) => { r.signals = [{ code: "X", description: "d", sourceType: "rule" }]; })],
    ["object evidence", mutate((r) => { r.signals = [{ code: "X", description: "d", severity: "low", sourceType: "rule", evidence: { a: 1 } }]; })],
    ["string corroboration", mutate((r) => { r.signals = [{ code: "X", description: "d", severity: "low", sourceType: "rule", corroboratedBy: "ORG-01" }]; })],
    ["object instead of trace array", mutate((r) => { r.trace = {}; })],
    ["trace entry without reason", mutate((r) => { r.trace = [{ id: "x" }]; })],
    ["action without id", mutate((r) => { r.actions = [{ text: "x" }]; })],
    ["missing analysis", mutate((r) => { delete r.analysis; })],
    ["semantic not an object", mutate((r) => { (r.analysis as Record<string, unknown>).semantic = "ok"; })],
    ["workflow steps not strings", mutate((r) => { r.verification = { workflows: [{ title: "t", steps: [1], requiredApprovals: 1 }] }; })],
    ["decision missing", mutate((r) => { delete r.decision; })],
  ])("rejects malformed %s", (_name, value) => {
    expect(validResponse(value)).toBe(false);
  });

  test("accepts null optional fields", () => {
    expect(validResponse(mutate((r) => {
      r.verification = null;
      r.signals = [{ code: "X", description: "d", severity: "low", sourceType: "rule", evidence: null, metadata: null }];
    }))).toBe(true);
  });
});

describe("what the pane says about the analysed email", () => {
  test("hostile, long, emoji and right-to-left subjects and senders render as plain text", () => {
    const root = document.createElement("main");
    const subject = `<script>alert(1)</script> ${"very long subject ".repeat(40)} 🚨 שלום עולם مرحبا`;
    renderResult(root, good(), report(subject, "<img src=x onerror=alert(1)>@evil.example"), new Date());
    expect(root.querySelector("script, img")).toBeNull();
    expect(root.querySelector(".analysed__subject")?.textContent).toBe(subject);
    expect(root.querySelector(".analysed__meta")?.textContent).toContain("onerror=alert(1)");
  });

  test("hostile backend evidence, trace, actions and labels render as text", () => {
    const root = document.createElement("main");
    const evil = "<img src=x onerror=alert(1)>";
    const response = good("high");
    response.signals = [{ code: evil, description: evil, severity: "high", sourceType: "rule", evidence: evil }];
    response.trace = [{ id: evil, reason: evil }];
    response.actions = [{ id: evil, text: evil }];
    renderResult(root, response, report(evil));
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain(evil);
  });
});
