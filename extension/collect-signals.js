// FraudLens "Security Report" client-side signal collector.
//
// Like content.js, this is never listed in manifest.json's content_scripts
// — it only runs on an explicit "Security Report" click, injected by
// background.js#runSecurityReport via chrome.scripting.executeScript.
// Isolated-world (the default), not MAIN-world: everything here reads the
// DOM (shared between worlds) or does same-origin fetches from the page's
// own origin — it never needs the page's actual JS globals. The one signal
// that DOES need MAIN-world access, the fetch/XHR API-surface observer, is
// injected separately by background.js as its own small function.
//
// PASSIVE ONLY, same constraint as the backend's services/site-security:
// this reads whatever the page already rendered and fetches only the
// page's own already-referenced SAME-ORIGIN scripts (to check their text
// for sink patterns / Retire.js signatures) — it never adds query
// parameters, submits forms, or otherwise pokes the page to see what
// happens.
//
// Known scope cut: cross-origin scripts are identified by URL only (their
// src still feeds Retire.js's URI-based version detection in
// background.js), their text is never fetched here — avoids relying on
// third-party CORS headers being present, and avoids content-script fetch
// attribution ambiguity for a hackathon-timeline build. See
// extension/README.md.

const MAX_FETCHED_SCRIPTS = 6;
const MAX_SCRIPT_TEXT_CHARS = 20_000;
const MAX_SCRIPTS_LISTED = 40;
const MAX_REFLECTED_PARAMS = 10;
const MAX_FORMS = 20;
const MAX_MIXED_CONTENT = 20;
const MAX_ELEMENTS_FOR_INLINE_HANDLERS = 4000;

const SINK_PATTERNS = [
  { sink: "eval", re: /\beval\s*\(/g },
  { sink: "new Function", re: /\bnew\s+Function\s*\(/g },
  { sink: "innerHTML", re: /\.innerHTML\s*=/g },
  { sink: "outerHTML", re: /\.outerHTML\s*=/g },
  { sink: "document.write", re: /\bdocument\.writeln?\s*\(/g },
  { sink: "insertAdjacentHTML", re: /\.insertAdjacentHTML\s*\(/g },
  { sink: "dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML/g },
  { sink: "setTimeout(string)", re: /\bsetTimeout\s*\(\s*['"`]/g },
  { sink: "setInterval(string)", re: /\bsetInterval\s*\(\s*['"`]/g },
];

function collectDomSinks(scriptText) {
  const findings = [];
  for (const { sink, re } of SINK_PATTERNS) {
    const count = (scriptText.match(re) || []).length;
    if (count > 0) findings.push({ sink, count });
  }

  let inlineHandlerCount = 0;
  const elements = document.querySelectorAll("*");
  for (let i = 0; i < elements.length && i < MAX_ELEMENTS_FOR_INLINE_HANDLERS; i++) {
    for (const attr of elements[i].attributes) {
      if (attr.name.length > 2 && attr.name.slice(0, 2).toLowerCase() === "on") inlineHandlerCount++;
    }
  }
  if (inlineHandlerCount > 0) findings.push({ sink: "inlineEventHandler", count: inlineHandlerCount });

  return findings;
}

function collectReflectedParams() {
  const found = [];
  const params = new URLSearchParams(location.search);
  const html = document.documentElement.outerHTML;
  let checked = 0;
  for (const [param, value] of params) {
    if (checked >= MAX_REFLECTED_PARAMS) break;
    checked++;
    if (value.length < 3 || !/[<>"']/.test(value)) continue; // only values that would need HTML-encoding are worth flagging
    if (html.includes(value)) found.push({ param, value: value.slice(0, 200) });
  }
  return found;
}

function collectMixedContent() {
  if (location.protocol !== "https:") return [];
  const seen = new Set();
  const found = [];
  for (const entry of performance.getEntriesByType("resource")) {
    if (!entry.name.startsWith("http://") || seen.has(entry.name)) continue;
    seen.add(entry.name);
    found.push({ url: entry.name });
    if (found.length >= MAX_MIXED_CONTENT) break;
  }
  return found;
}

function collectInsecureForms() {
  const found = [];
  for (const form of Array.from(document.forms).slice(0, MAX_FORMS)) {
    if (!form.hasAttribute("action") || !form.action) continue;
    let actionUrl;
    try {
      actionUrl = new URL(form.action, location.href);
    } catch {
      continue;
    }
    const httpAction = actionUrl.protocol === "http:";
    const crossOrigin = actionUrl.origin !== location.origin;
    if (httpAction || crossOrigin) found.push({ action: actionUrl.href, httpAction, crossOrigin });
  }
  return found;
}

function collectScriptRefs() {
  const seen = new Set();
  const scripts = [];
  let inlineText = "";
  for (const el of document.querySelectorAll("script")) {
    if (!el.src) {
      inlineText += `${el.textContent || ""}\n`;
      continue;
    }
    let url;
    try {
      url = new URL(el.src, location.href);
    } catch {
      continue;
    }
    if (seen.has(url.href) || scripts.length >= MAX_SCRIPTS_LISTED) continue;
    seen.add(url.href);
    scripts.push({ src: url.href, host: url.host, isThirdParty: url.host !== location.host });
  }
  return { scripts, inlineText: inlineText.slice(0, MAX_SCRIPT_TEXT_CHARS * 2) };
}

async function fetchSameOriginScriptText(scripts) {
  const sameOrigin = scripts.filter((s) => !s.isThirdParty).slice(0, MAX_FETCHED_SCRIPTS);
  const results = await Promise.all(
    sameOrigin.map(async (s) => {
      try {
        const res = await fetch(s.src, { credentials: "omit" });
        if (!res.ok) return [s.src, ""];
        return [s.src, (await res.text()).slice(0, MAX_SCRIPT_TEXT_CHARS)];
      } catch {
        return [s.src, ""];
      }
    })
  );
  return new Map(results);
}

async function collectSecuritySignals() {
  const { scripts, inlineText } = collectScriptRefs();
  const fetchedText = await fetchSameOriginScriptText(scripts);

  // Fed to Retire.js matching in background.js#runSecurityReport: every
  // external script's src (for URI-based detection, works cross-origin too)
  // plus fetched text where we have it (same-origin only), plus one
  // synthetic "script" for the page's inline JS.
  const scriptsForRetire = [
    { src: null, text: inlineText },
    ...scripts.map((s) => ({ src: s.src, text: fetchedText.get(s.src) || "" })),
  ];

  const combinedText = `${inlineText}\n${[...fetchedText.values()].join("\n")}`;

  return {
    domSinks: collectDomSinks(combinedText),
    reflectedParams: collectReflectedParams(),
    mixedContent: collectMixedContent(),
    insecureForms: collectInsecureForms(),
    thirdPartyScripts: scripts.filter((s) => s.isThirdParty).map((s) => ({ src: s.src, host: s.host })),
    scriptsForRetire,
  };
}

// Completion value of the file — see content.js's header comment for why
// this works with chrome.scripting.executeScript (a returned Promise is
// awaited automatically before InjectionResult.result is set).
collectSecuritySignals();
