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

// Top-level declarations are `var`, never `const`/`let`/`class`: Chrome
// injects this file into the SAME isolated world on every click, and a
// second `const` declaration throws a SyntaxError before anything runs -
// which is exactly how the second Security Report / Scan This Page on a
// tab used to come back empty ("collector returned no result").
var MAX_FETCHED_SCRIPTS = 6;
var MAX_SCRIPT_TEXT_CHARS = 20_000;
var MAX_SCRIPTS_LISTED = 40;
var MAX_REFLECTED_PARAMS = 10;
var MAX_FORMS = 20;
var MAX_MIXED_CONTENT = 20;
var MAX_ELEMENTS_FOR_INLINE_HANDLERS = 4000;
// Where each finding is in the code: up to MAX_LOCATIONS per finding, each
// { file, line, code } - the script URL (or the page URL for inline code and
// HTML), the 1-based line, and that line of source (capped; long minified
// lines are cut around the match).
var MAX_LOCATIONS = 3;
var MAX_CODE_CHARS = 200;
var CODE_CONTEXT_BEFORE = 80;
// Serialized once per run (reset in collectSecuritySignals: `var` survives
// re-injection into the same world). It's the DOM as rendered, so line
// numbers match the browser's Elements view and are close to View Source.
var pageHtml = null;

function pageSource() {
  if (pageHtml === null) pageHtml = document.documentElement.outerHTML;
  return pageHtml;
}

/** 1-based line of `index` in `text`, and that line of code. */
function lineAt(text, index) {
  let line = 1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) line++;
  const start = text.lastIndexOf("\n", index - 1) + 1;
  let end = text.indexOf("\n", index);
  if (end === -1) end = text.length;
  let code = text.slice(start, end).trim();
  if (code.length > MAX_CODE_CHARS) {
    const from = Math.max(start, index - CODE_CONTEXT_BEFORE);
    code = `${from > start ? "…" : ""}${text.slice(from, Math.min(end, from + MAX_CODE_CHARS)).trim()}…`;
  }
  return { line, code };
}

/** Where `needle` first appears in the page's HTML, or null. */
function locateInPage(needle) {
  if (!needle) return null;
  const html = pageSource();
  let index = html.indexOf(needle);
  if (index === -1) index = html.indexOf(needle.replace(/&/g, "&amp;"));
  if (index === -1) return null;
  return { file: location.href, ...lineAt(html, index) };
}

/** An element's opening tag as serialized, e.g. <form action="http://…" method="post">. */
function openingTag(el) {
  const html = el.outerHTML || "";
  const end = html.indexOf(">");
  return end === -1 ? html.slice(0, MAX_CODE_CHARS) : html.slice(0, end + 1);
}

function locateElement(el) {
  return locateInPage(openingTag(el));
}

function compact(items) {
  return items.filter(Boolean).slice(0, MAX_LOCATIONS);
}

var SINK_PATTERNS = [
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

/**
 * @param {{ file: string, text: string, lineOffset: number }[]} sources inline scripts and fetched same-origin scripts
 */
function collectDomSinks(sources) {
  const findings = [];
  for (const { sink, re } of SINK_PATTERNS) {
    let count = 0;
    const locations = [];
    for (const { file, text, lineOffset } of sources) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        count++;
        if (locations.length < MAX_LOCATIONS) {
          const { line, code } = lineAt(text, m.index);
          locations.push({ file, line: line + lineOffset, code });
        }
      }
    }
    if (count > 0) findings.push({ sink, count, locations });
  }

  let inlineHandlerCount = 0;
  const handlerLocations = [];
  const elements = document.querySelectorAll("*");
  for (let i = 0; i < elements.length && i < MAX_ELEMENTS_FOR_INLINE_HANDLERS; i++) {
    let hasHandler = false;
    for (const attr of elements[i].attributes) {
      if (attr.name.length > 2 && attr.name.slice(0, 2).toLowerCase() === "on") {
        inlineHandlerCount++;
        hasHandler = true;
      }
    }
    if (hasHandler && handlerLocations.length < MAX_LOCATIONS) handlerLocations.push(locateElement(elements[i]));
  }
  if (inlineHandlerCount > 0) findings.push({ sink: "inlineEventHandler", count: inlineHandlerCount, locations: compact(handlerLocations) });

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
    if (html.includes(value)) found.push({ param, value: value.slice(0, 200), locations: compact([locateInPage(value)]) });
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
    found.push({ url: entry.name, locations: compact([locateInPage(entry.name)]) });
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
    if (httpAction || crossOrigin) found.push({ action: actionUrl.href, httpAction, crossOrigin, locations: compact([locateElement(form)]) });
  }
  return found;
}

function collectScriptRefs() {
  const seen = new Set();
  const scripts = [];
  const inlineScripts = [];
  let inlineText = "";
  for (const el of document.querySelectorAll("script")) {
    if (!el.src) {
      const text = el.textContent || "";
      inlineText += `${text}\n`;
      if (text.trim()) {
        // Line numbers relative to the page: find where this script's text starts in the HTML.
        const start = pageSource().indexOf(text.slice(0, 200));
        inlineScripts.push({ file: location.href, text, lineOffset: start === -1 ? 0 : lineAt(pageSource(), start).line - 1 });
      }
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
    scripts.push({ src: url.href, host: url.host, isThirdParty: url.host !== location.host, hasIntegrity: el.hasAttribute("integrity"), element: el });
  }
  return { scripts, inlineScripts, inlineText: inlineText.slice(0, MAX_SCRIPT_TEXT_CHARS * 2) };
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

// ---------------- Page identity (pageMeta) ----------------
// Who the page says it is, and the tells a phishing kit leaves behind. The
// backend (services/site-security/page-identity.js) judges these; this only
// reads tags, link targets and code patterns - never form values.

var MAX_LINKS_SCANNED = 600;
var MAX_ASSET_HOSTS = 30;
var PRIVACY_RE = /privacy|confidentialit|vie priv[ée]e|donn[ée]es personnelles|data protection|konfidansialite/i;
var TERMS_RE = /terms|conditions|mentions l[ée]gales|\bcgu\b|\bcgv\b/i;
var CONTACT_RE = /contact|about us|[àa] propos|nous joindre/i;
var CARD_FIELD_RE = /\b(?:cc-?(?:number|num|csc|exp)|card-?(?:number|no|num)|cardnumber|cvv|cvc|csc)\b/i;
var EXFIL_PATTERNS = [
  { target: "Telegram bot API", re: /api\.telegram\.org\/bot/gi },
  { target: "a Discord webhook", re: /discord(?:app)?\.com\/api\/webhooks/gi },
];
var OBFUSCATION_RE = /\b(?:eval|Function)\s*\(\s*(?:window\.)?(?:atob|unescape)\s*\(/g;
var CONTEXT_MENU_RE = /contextmenu['"]?\s*,[\s\S]{0,120}?preventDefault|oncontextmenu\s*=\s*["']?\s*(?:return\s+false|function)/gi;

/** Every match of `re` across the page's scripts, with the first few locations. */
function scanSources(re, sources) {
  let count = 0;
  const locations = [];
  for (const { file, text, lineOffset } of sources) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      count++;
      if (locations.length < MAX_LOCATIONS) {
        const { line, code } = lineAt(text, m.index);
        locations.push({ file, line: line + lineOffset, code });
      }
    }
  }
  return { count, locations };
}

function metaContent(selector) {
  const el = document.querySelector(selector);
  return el ? (el.getAttribute("content") || el.getAttribute("href") || "").trim().slice(0, 500) : "";
}

function collectPolicyLinks() {
  const found = { privacyLinks: [], termsLinks: [], contactLinks: [] };
  const anchors = Array.from(document.querySelectorAll("a[href]")).slice(0, MAX_LINKS_SCANNED);
  for (const a of anchors) {
    const text = (a.textContent || "").trim().slice(0, 120);
    const href = a.getAttribute("href") || "";
    const haystack = `${text} ${href}`;
    let url;
    try {
      url = new URL(href, location.href).href;
    } catch {
      continue;
    }
    if (!/^https?:/.test(url)) continue;
    if (PRIVACY_RE.test(haystack) && found.privacyLinks.length < 3) found.privacyLinks.push({ href: url, text });
    else if (TERMS_RE.test(haystack) && found.termsLinks.length < 3) found.termsLinks.push({ href: url, text });
    else if (CONTACT_RE.test(haystack) && found.contactLinks.length < 3) found.contactLinks.push({ href: url, text });
  }
  return found;
}

/** Hosts other than this one that the page loads images, icons, styles or scripts from. */
function collectAssetHosts() {
  const byKey = new Map();
  const add = (el, raw, kind) => {
    if (!raw || byKey.size >= MAX_ASSET_HOSTS) return;
    let url;
    try {
      url = new URL(raw, location.href);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol) || url.host === location.host) return;
    const key = `${url.hostname}|${kind}`;
    if (!byKey.has(key)) byKey.set(key, { host: url.hostname, kind, locations: compact([locateElement(el)]) });
  };
  for (const el of document.querySelectorAll("img[src]")) add(el, el.getAttribute("src"), "image");
  for (const el of document.querySelectorAll('link[rel~="icon"][href]')) add(el, el.getAttribute("href"), "icon");
  for (const el of document.querySelectorAll('link[rel="stylesheet"][href]')) add(el, el.getAttribute("href"), "stylesheet");
  for (const el of document.querySelectorAll("script[src]")) add(el, el.getAttribute("src"), "script");
  return [...byKey.values()];
}

function collectPageMeta(sources) {
  const inputs = Array.from(document.querySelectorAll("input"));
  const hasCredentialField = inputs.some((i) => (i.getAttribute("type") || "").toLowerCase() === "password" || (i.getAttribute("autocomplete") || "").toLowerCase().startsWith("cc-") || CARD_FIELD_RE.test(`${i.name || ""} ${i.id || ""}`));

  const formText = Array.from(document.forms).map((f) => ({ file: location.href, text: `${openingTag(f)}\n`, lineOffset: 0 }));
  const exfil = [];
  for (const { target, re } of EXFIL_PATTERNS) {
    const hit = scanSources(re, [...sources, ...formText]);
    if (hit.count > 0) exfil.push({ target, locations: hit.locations });
  }

  const obfuscation = scanSources(OBFUSCATION_RE, sources);
  const menu = scanSources(CONTEXT_MENU_RE, sources);
  const menuAttr = document.querySelector("[oncontextmenu]");
  const contextMenuLocations = compact([...(menuAttr ? [locateElement(menuAttr)] : []), ...menu.locations]);

  return {
    title: (document.title || "").slice(0, 300),
    description: metaContent('meta[name="description"]'),
    siteName: metaContent('meta[property="og:site_name"]'),
    canonical: metaContent('link[rel="canonical"]'),
    ogUrl: metaContent('meta[property="og:url"]'),
    generator: metaContent('meta[name="generator"]'),
    ...collectPolicyLinks(),
    assetHosts: collectAssetHosts(),
    hasCredentialField,
    exfil,
    contextMenuBlocked: Boolean(menuAttr) || menu.count > 0,
    contextMenuLocations,
    obfuscation: obfuscation.count > 0,
    obfuscationLocations: obfuscation.locations,
  };
}

/** A metadata problem must never cost the rest of the report. */
function orNull(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

async function collectSecuritySignals() {
  pageHtml = null; // fresh serialization for this run
  const { scripts, inlineScripts, inlineText } = collectScriptRefs();
  const fetchedText = await fetchSameOriginScriptText(scripts);

  // Fed to Retire.js matching in background.js#runSecurityReport: every
  // external script's src (for URI-based detection, works cross-origin too)
  // plus fetched text where we have it (same-origin only), plus one
  // synthetic "script" for the page's inline JS.
  const scriptsForRetire = [
    { src: null, text: inlineText },
    ...scripts.map((s) => ({ src: s.src, text: fetchedText.get(s.src) || "" })),
  ];

  const sinkSources = [
    ...inlineScripts,
    ...[...fetchedText].filter(([, text]) => text).map(([file, text]) => ({ file, text, lineOffset: 0 })),
  ];
  const passwordInputs = document.querySelectorAll('input[type="password"]');

  return {
    domSinks: collectDomSinks(sinkSources),
    reflectedParams: collectReflectedParams(),
    mixedContent: collectMixedContent(),
    insecureForms: collectInsecureForms(),
    thirdPartyScripts: scripts.filter((s) => s.isThirdParty).map((s) => ({ src: s.src, host: s.host })),
    scriptsWithoutIntegrity: scripts
      .filter((s) => s.isThirdParty && !s.hasIntegrity)
      .map((s) => ({ src: s.src, host: s.host, locations: compact([locateElement(s.element)]) })),
    // Counted, never read: the field's value is not touched.
    passwordFields: passwordInputs.length,
    passwordFieldLocations: compact(Array.from(passwordInputs).slice(0, MAX_LOCATIONS).map(locateElement)),
    pageMeta: orNull(() => collectPageMeta(sinkSources)),
    pageProtocol: location.protocol,
    scriptsForRetire,
  };
}

// Completion value of the file — see content.js's header comment for why
// this works with chrome.scripting.executeScript (a returned Promise is
// awaited automatically before InjectionResult.result is set).
//
// Wrapped in its own try/catch: an uncaught rejection here would make the
// completion value itself `undefined` (indistinguishable, from
// background.js's side, from "the script never ran at all"), throwing away
// the actual reason. Returning `{ error }` on failure means the completion
// value is always a defined, structured-cloneable object, so
// background.js#runSecurityReport can tell "collection failed, here's why"
// apart from "collection never happened" and log/report the real cause
// instead of a generic message.
collectSecuritySignals().catch((err) => ({ error: err?.message || String(err) }));
