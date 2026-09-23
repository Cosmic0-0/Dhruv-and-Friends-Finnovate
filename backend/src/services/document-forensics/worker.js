// Worker-thread entry point for document parsing. analyzeDocument() starts
// one of these per upload with a heap limit and a hard timeout, so a hostile
// or enormous file can exhaust or hang only this worker - it is terminated,
// and the API process carries on. Pixel buffers are transferred, not copied.

import { parentPort, workerData } from "node:worker_threads";
import { inspectDocument } from "./inspect.js";

try {
  const facts = await inspectDocument(workerData.bytes);
  const transfer = [
    ...(facts.previews ?? []).map((p) => p.data),
    ...(facts.ocrImages ?? []).map((o) => o.data),
    ...(facts.images ?? []).map((i) => i.data),
  ];
  parentPort.postMessage({ ok: true, facts }, transfer);
} catch (err) {
  parentPort.postMessage({ ok: false, code: err?.code ?? "unreadable", detail: String(err?.message ?? err).slice(0, 300) });
}
