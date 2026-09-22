const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");

function render(result) {
  if (!result) {
    statusEl.className = "status unknown";
    statusEl.textContent = "Not checked yet — reload the page.";
    return;
  }
  if (result.error) {
    statusEl.className = "status unknown";
    statusEl.textContent = `Backend unreachable: ${result.error}`;
    return;
  }
  if (result.flagged) {
    statusEl.className = "status flagged";
    statusEl.textContent = `⚠ ${result.hostname} looks like a lookalike domain`;
    for (const signal of result.signals ?? []) {
      const li = document.createElement("li");
      li.textContent = `${signal.description} (${signal.severity})`;
      signalsEl.appendChild(li);
    }
    return;
  }
  statusEl.className = "status safe";
  statusEl.textContent = `${result.hostname} — no known lookalike match`;
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (!tab) {
  render(null);
} else {
  const result = await chrome.runtime.sendMessage({ type: "GET_TAB_STATUS", tabId: tab.id });
  render(result);
}
