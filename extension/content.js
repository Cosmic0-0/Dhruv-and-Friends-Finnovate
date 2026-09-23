// FraudLens content script.
//
// IMPORTANT: this file is never listed in manifest.json's `content_scripts`,
// so it does NOT run automatically on page load for every site. It is only
// injected on demand, via chrome.scripting.executeScript, and only in
// response to an explicit user action (clicking "Scan This Page" in the
// popup). That action is itself the qualifying user gesture that grants the
// "activeTab" permission for this tab, which is what authorizes the
// injection — see manifest.json's permissions and extension/README.md.
//
// Two jobs, both opt-in:
//   1. On injection, immediately extract a bounded amount of VISIBLE page
//      text and hand it back as the script's completion value (read by
//      chrome.scripting.executeScript's InjectionResult.result).
//   2. Stay resident afterwards (content scripts persist until navigation)
//      and listen for a follow-up "FRAUDLENS_SHOW_BANNER" message so the
//      popup can ask it to show a dismissible warning banner once the
//      analysis result comes back — see 14G in the project brief.
//
// Privacy: only document.body.innerText is read. innerText reflects
// rendered text nodes only — it never includes <input>/<textarea> values,
// password fields, or hidden-input values, so there is nothing to filter
// out beyond the length cap. No HTML, no form data, no cookies, no page
// scripts are ever read or sent anywhere by this file.

const MAX_CHARS = 4000; // stays under the backend's 5000-char /api/analyze cap with headroom
const BANNER_ID = "fraudlens-warning-banner";

function extractPageText() {
  const raw = (document.body && document.body.innerText) || "";
  const trimmed = raw.trim();
  const text = trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;
  return {
    text,
    truncated: trimmed.length > MAX_CHARS,
    totalLength: trimmed.length,
    pageUrl: location.href,
  };
}

function removeBanner() {
  document.getElementById(BANNER_ID)?.remove();
}

/**
 * Injects a small, dismissible warning banner at the top of the page.
 * Built with DOM APIs (createElement/textContent) only — no innerHTML — so
 * nothing from the analysis result can execute as markup on the page.
 * Only called for strong DETERMINISTIC signals (lookalike domain / identity
 * mismatch), never for weak LLM-only signals — see 14G. Never blocks
 * interaction with the rest of the page, and never auto-repeats: one banner
 * per scan, dismissible, no re-injection until the next explicit scan.
 */
function showBanner({ headline, detail, severity }) {
  removeBanner();

  const bg = severity === "high-risk" ? "#a14a3a" : "#96772f";
  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.setAttribute("role", "alert");
  Object.assign(banner.style, {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    zIndex: "2147483647",
    background: bg,
    color: "#fff",
    font: "13px/1.4 system-ui, sans-serif",
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  });

  const icon = document.createElement("span");
  icon.textContent = severity === "high-risk" ? "⚠" : "❓";
  icon.style.fontSize = "16px";

  const text = document.createElement("span");
  text.style.flex = "1";
  const strong = document.createElement("strong");
  strong.textContent = headline; // textContent only — never HTML
  text.appendChild(strong);
  if (detail) {
    text.appendChild(document.createTextNode(" — " + detail));
  }
  const badge = document.createElement("span");
  badge.textContent = "FraudLens AI";
  badge.style.opacity = "0.85";
  badge.style.fontSize = "11px";
  badge.style.textTransform = "uppercase";
  badge.style.letterSpacing = "0.08em";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Dismiss";
  closeBtn.type = "button";
  Object.assign(closeBtn.style, {
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.5)",
    color: "#fff",
    borderRadius: "3px",
    padding: "4px 10px",
    cursor: "pointer",
    font: "inherit",
  });
  closeBtn.addEventListener("click", removeBanner);

  banner.append(icon, text, badge, closeBtn);
  document.documentElement.prepend(banner);
}

// Extraction happens immediately, synchronously, as the completion value of
// this script — this is the "explicit user click" moment (see header
// comment). Nothing else here runs until an explicit follow-up message.
(function fraudlensInit() {
  if (window.__fraudlensContentScriptActive) {
    // Already injected earlier in this tab (e.g. a second "Scan This Page"
    // click) — the listener below is already registered, just skip re-adding it.
    return;
  }
  window.__fraudlensContentScriptActive = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FRAUDLENS_SHOW_BANNER") {
      showBanner(message.payload);
      sendResponse({ ok: true });
    } else if (message?.type === "FRAUDLENS_DISMISS_BANNER") {
      removeBanner();
      sendResponse({ ok: true });
    }
    return false;
  });
})();

// Completion value of the file: chrome.scripting.executeScript captures the
// value of this final expression statement and returns it as
// InjectionResult.result to whoever called executeScript.
extractPageText();
