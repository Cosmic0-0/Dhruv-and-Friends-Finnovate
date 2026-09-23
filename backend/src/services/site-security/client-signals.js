// Maps the already-collected clientSignals payload from the extension's
// content-script collector (extension/collect-signals.js) into findings in
// the same shape the server-side checks (checks.js) produce. This module
// never talks to the network or re-derives anything — it only classifies
// data the extension already gathered client-side, mirroring the project
// rule that detection logic lives in the backend (see CLAUDE.md) while the
// raw collection stays in the extension because only the page's own JS
// context can see it (rendered DOM, wrapped fetch/XHR calls).

const MAX_ITEMS = 25;

function arr(value) {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : [];
}

function str(value, maxLen = 300) {
  return typeof value === "string" ? value.slice(0, maxLen) : "";
}

// These come from a text search of the page's scripts, so they show a sink
// is USED, not that untrusted data reaches it - most sites ship a library
// containing innerHTML or eval somewhere. Weighted accordingly: a
// string-to-code sink is worth a look (medium), an HTML sink is a hint (low),
// and inline handlers are context only (info). Confirmed-precondition signals
// such as a reflected parameter stay high.
const SINK_SEVERITY = {
  eval: "medium",
  "new Function": "medium",
  "setTimeout(string)": "medium",
  "setInterval(string)": "medium",
  innerHTML: "low",
  outerHTML: "low",
  "document.write": "low",
  insertAdjacentHTML: "low",
  dangerouslySetInnerHTML: "low",
  inlineEventHandler: "info",
};

export function mapClientSignals(clientSignals) {
  const findings = [];
  if (!clientSignals || typeof clientSignals !== "object") return findings;

  for (const sink of arr(clientSignals.domSinks)) {
    const name = str(sink?.sink, 60);
    if (!name) continue;
    const count = typeof sink.count === "number" && Number.isFinite(sink.count) ? Math.max(1, Math.floor(sink.count)) : undefined;
    findings.push({
      category: "client-dom",
      severity: SINK_SEVERITY[name] ?? "low",
      title: `Page uses ${name}`,
      description: `The page's rendered DOM shows use of ${name}${count ? ` (observed ${count}x)` : ""}. This is a potential injection sink if untrusted data reaches it — not a confirmed vulnerability on its own.`,
      evidence: name,
    });
  }

  for (const reflected of arr(clientSignals.reflectedParams)) {
    const param = str(reflected?.param, 100);
    if (!param) continue;
    findings.push({
      category: "client-dom",
      severity: "high",
      title: `URL parameter "${param}" reflected unencoded in the page`,
      description: "A value from the page's own URL query string appears in the rendered DOM without apparent HTML-encoding — a common precondition for reflected XSS.",
      evidence: param,
    });
  }

  const mixed = arr(clientSignals.mixedContent);
  if (mixed.length > 0) {
    const examples = mixed
      .slice(0, 3)
      .map((m) => str(m?.url, 200))
      .filter(Boolean);
    findings.push({
      category: "mixed-content",
      severity: "medium",
      title: "Mixed content: HTTPS page loads HTTP resources",
      description: `${mixed.length} resource(s) load over plain HTTP on an HTTPS page, which a network attacker could tamper with.${examples.length ? ` Example: ${examples.join(", ")}` : ""}`,
    });
  }

  for (const form of arr(clientSignals.insecureForms)) {
    const action = str(form?.action, 300);
    if (!action) continue;
    if (form.httpAction) {
      findings.push({
        category: "forms",
        severity: "medium",
        title: "Form submits over plain HTTP",
        description: `A form on this page submits to ${action} over unencrypted HTTP.`,
        evidence: action,
      });
    } else if (form.crossOrigin) {
      findings.push({
        category: "forms",
        severity: "low",
        title: "Form submits to a different origin",
        description: `A form on this page submits to a different origin (${action}), worth double-checking before entering payment or credential details.`,
        evidence: action,
      });
    }
  }

  for (const lib of arr(clientSignals.vulnerableLibraries)) {
    const name = str(lib?.name, 80);
    if (!name) continue;
    const version = str(lib?.version, 40);
    const vulns = Array.isArray(lib.vulnerabilities) ? lib.vulnerabilities.slice(0, 5) : [];
    const severity = vulns.some((v) => v?.severity === "critical" || v?.severity === "high") ? "high" : vulns.some((v) => v?.severity === "medium") ? "medium" : "low";
    findings.push({
      category: "vulnerable-library",
      severity,
      title: `Vulnerable library: ${name}${version ? ` ${version}` : ""}`,
      description: vulns.length
        ? `Matches ${vulns.length} known vulnerabilit${vulns.length === 1 ? "y" : "ies"} in the Retire.js dataset for this version.`
        : `${name}${version ? ` ${version}` : ""} matched a known-vulnerable entry in the Retire.js dataset.`,
      evidence:
        vulns
          .map((v) => str(v?.info, 200))
          .filter(Boolean)
          .join("; ") || undefined,
    });
  }

  // Subresource Integrity: a third-party script without an integrity hash
  // runs whatever that host serves today - a compromised CDN becomes code on
  // this page.
  const noSri = arr(clientSignals.scriptsWithoutIntegrity);
  if (noSri.length > 0) {
    const hosts = [...new Set(noSri.map((s) => str(s?.host, 200)).filter(Boolean))].slice(0, 5);
    findings.push({
      category: "sri",
      severity: "low",
      title: `${noSri.length} third-party script(s) without Subresource Integrity`,
      description: `These scripts have no integrity="" hash, so if ${hosts.length === 1 ? "that host is" : "any of those hosts is"} compromised the browser will run whatever it serves.${hosts.length ? ` Hosts: ${hosts.join(", ")}` : ""}`,
      evidence: noSri
        .slice(0, 3)
        .map((s) => str(s?.src, 200))
        .filter(Boolean)
        .join("; ") || undefined,
    });
  }

  // A password field on a page that isn't HTTPS is the single clearest
  // credential-theft precondition a passive scan can see.
  const passwordFields = typeof clientSignals.passwordFields === "number" && Number.isFinite(clientSignals.passwordFields) ? Math.max(0, Math.floor(clientSignals.passwordFields)) : 0;
  if (passwordFields > 0 && clientSignals.pageProtocol === "http:") {
    findings.push({
      category: "credentials",
      severity: "high",
      title: "Password field on an unencrypted page",
      description: `This page shows ${passwordFields} password field(s) but was loaded over plain HTTP, so anything typed into it can be read or altered on the network.`,
    });
  }

  const thirdParty = arr(clientSignals.thirdPartyScripts);
  if (thirdParty.length > 0) {
    const hosts = [...new Set(thirdParty.map((s) => str(s?.host, 200)).filter(Boolean))].slice(0, 5);
    findings.push({
      category: "third-party",
      severity: "info",
      title: `${thirdParty.length} third-party script(s) loaded`,
      description: `Scripts are loaded from ${hosts.length} distinct third-party host(s)${hosts.length ? `: ${hosts.join(", ")}` : ""}. Informational — each third party can run code on this page.`,
    });
  }

  const apiSurface = arr(clientSignals.apiSurface);
  if (apiSurface.length > 0) {
    const sameOrigin = apiSurface.filter((e) => e?.sameOrigin).length;
    findings.push({
      category: "api-surface",
      severity: "info",
      title: `${apiSurface.length} API call(s) observed`,
      description: `${sameOrigin} same-origin and ${apiSurface.length - sameOrigin} third-party fetch/XHR call(s) were observed while the page rendered. Recorded for visibility only — never replayed or probed.`,
    });
  }

  return findings;
}
