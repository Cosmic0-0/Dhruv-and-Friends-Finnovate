import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";
import { analyzeCurrentEmail } from "./api";
import { buildAnalyzePayload } from "./office-adapter";
import { renderError, renderIdle, renderLoading, renderResult } from "./render";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("FraudLens task pane root is missing.");

let running = false;

async function analyze(): Promise<void> {
  if (running) return;
  running = true;
  renderLoading(root!);
  try {
    const { payload, extraction } = await buildAnalyzePayload();
    const result = await analyzeCurrentEmail(payload);
    renderResult(root!, result, extraction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check that an email is open and the FraudLens backend is reachable.";
    renderError(root!, message, analyze);
  } finally {
    running = false;
  }
}

function ready(): void {
  renderIdle(root!, analyze);
  if (Office.context.requirements.isSetSupported("Mailbox", "1.5")) {
    Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, () => {
      running = false;
      renderIdle(root!, analyze);
    });
  }
}

Office.onReady((info) => {
  if (info.host !== Office.HostType.Outlook) {
    renderError(root!, "Open this add-in from Outlook with a message selected.", ready);
    return;
  }
  ready();
});
