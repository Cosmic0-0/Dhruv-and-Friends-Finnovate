import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";
import { analyzeCurrentEmail, analyzeScreenshot } from "./api";
import { createController } from "./controller";
import { buildAnalyzePayload } from "./office-adapter";
import { buildScreenshotPayload } from "./screenshot";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("FraudLens task pane root is missing.");

const controller = createController({
  root,
  extract: () => buildAnalyzePayload(),
  analyze: analyzeCurrentEmail,
  buildScreenshotPayload,
  analyzeScreenshot,
});

Office.onReady((info) => {
  if (info.host !== Office.HostType.Outlook) {
    controller.showError("Open this add-in from Outlook with a message selected.");
    return;
  }
  controller.showIdle();
  // A pinned task pane stays open while the user moves between messages.
  // Reset to the start screen so the previous email's result never sits next
  // to a different email; analysis stays an explicit user action because it
  // sends the message to the FraudLens service.
  if (Office.context.requirements.isSetSupported("Mailbox", "1.5")) {
    Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, () => controller.showIdle());
  }
});
