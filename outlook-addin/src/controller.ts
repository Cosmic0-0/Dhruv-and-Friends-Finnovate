import type { AnalyzePayload, AnalyzeResponse, ExtractionReport } from "./types";
import { renderError, renderIdle, renderLoading, renderResult } from "./render";

export interface ControllerDeps {
  root: HTMLElement;
  extract: () => Promise<{ payload: AnalyzePayload; extraction: ExtractionReport }>;
  analyze: (payload: AnalyzePayload) => Promise<AnalyzeResponse>;
  now?: () => Date;
}

/**
 * Owns the task pane state machine (idle, loading, result, error).
 *
 * Every screen change bumps a generation counter. An in-flight analysis
 * that is no longer the newest generation - because the user selected a
 * different message, or started a newer run - discards its outcome instead
 * of painting a result or error that belongs to another email.
 */
export function createController({ root, extract, analyze, now = () => new Date() }: ControllerDeps) {
  let generation = 0;

  async function run(): Promise<void> {
    const mine = ++generation;
    renderLoading(root);
    try {
      const { payload, extraction } = await extract();
      if (mine !== generation) return;
      const result = await analyze(payload);
      if (mine !== generation) return;
      try {
        renderResult(root, result, extraction, now(), run);
      } catch {
        // A response that passed validation but still cannot be drawn must
        // not leave a half-rendered pane or surface internal error text.
        renderError(root, "FraudLens returned a result this add-in could not display. Try again.", run);
      }
    } catch (error) {
      if (mine !== generation) return;
      const message = error instanceof Error && error.message ? error.message : "Check that an email is open and the FraudLens backend is reachable.";
      renderError(root, message, run);
    }
  }

  /** Back to the start screen; also cancels the outcome of any run in flight. */
  function showIdle(): void {
    generation++;
    renderIdle(root, run);
  }

  function showError(message: string): void {
    generation++;
    renderError(root, message, showIdle);
  }

  return { run, showIdle, showError };
}
