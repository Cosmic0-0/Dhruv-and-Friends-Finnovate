// Passive, server-side checks against a single already-fetched response
// (headers/cookies/body) plus a handful of one-shot GETs to well-known paths
// on the same host (exposed-artifacts/source-maps/security.txt). Nothing
// here sends crafted input, fuzzes, or brute-forces — see
// services/site-security/index.js for how these are composed into one report.
//
// Header coverage: CSP (presence, report-only, and directive-level
// weaknesses), clickjacking (frame-ancestors OR X-Frame-Options), HSTS,
// X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, CORS as
// volunteered to an Origin-less request, and software-version banners.

/**
 * Parses one Content-Security-Policy header value into Map<directive,
 * sources[]>. Several policies can arrive comma-joined in one value (Headers
 * .get() joins repeated headers with ", "); a browser enforces ALL of them,
 * so for "is this weak?" questions the strictest policy that sets a
 * directive wins - which, for the checks below, means "a directive counts as
 * set if any policy sets it".
 */
export function parseCsp(value) {
  const directives = new Map();
  for (const policy of String(value || "").split(",")) {
    for (const part of policy.split(";")) {
      const [name, ...sources] = part.trim().split(/\s+/);
      if (!name) continue;
      const key = name.toLowerCase();
      if (!directives.has(key)) directives.set(key, sources.map((s) => s.toLowerCase()));
    }
  }
  return directives;
}

const SCHEME_ONLY_SOURCE = /^(?:https?|data|blob|filesystem):$/;
const isWildcardSource = (s) => s === "*" || SCHEME_ONLY_SOURCE.test(s);
const hasNonceOrHash = (sources) => sources.some((s) => /^'(?:nonce|sha256|sha384|sha512)-/.test(s));

/** Directive-level CSP weaknesses. Only called when an enforcing CSP exists. */
function cspWeaknesses(csp, evidence) {
  const findings = [];
  const push = (severity, title, description) => findings.push({ category: "headers", severity, title, description, evidence });

  const scriptSrc = csp.get("script-src") ?? csp.get("default-src");
  if (!scriptSrc) {
    push("medium", "CSP does not restrict scripts", "The Content-Security-Policy sets neither script-src nor default-src, so it places no limit on where scripts can load from.");
  } else {
    // 'unsafe-inline' is ignored by CSP2+ browsers when a nonce/hash is also
    // present, and 'strict-dynamic' makes host allowlists ignored - both are
    // the modern, correct way to write a CSP, so neither is flagged then.
    if (scriptSrc.includes("'unsafe-inline'") && !hasNonceOrHash(scriptSrc)) {
      push("medium", "CSP allows inline scripts", "script-src includes 'unsafe-inline' without a nonce or hash, so an injected <script> block would still run.");
    }
    if (scriptSrc.includes("'unsafe-eval'")) {
      push("medium", "CSP allows eval()", "script-src includes 'unsafe-eval', allowing strings to be executed as code (eval, new Function, string timers).");
    }
    if (!scriptSrc.includes("'strict-dynamic'") && scriptSrc.some(isWildcardSource)) {
      push("medium", "CSP allows scripts from any host", `script-src includes "${scriptSrc.find(isWildcardSource)}", which permits scripts from essentially anywhere and defeats the policy's purpose.`);
    }
  }

  const objectSrc = csp.get("object-src") ?? csp.get("default-src");
  if (!objectSrc) {
    push("low", "CSP does not restrict plugins (object-src)", "Neither object-src nor default-src is set, so legacy plugin content (<object>/<embed>) is unrestricted. object-src 'none' is the usual recommendation.");
  }
  // base-uri does NOT fall back to default-src.
  if (!csp.has("base-uri")) {
    push("low", "CSP does not set base-uri", "Without base-uri, an injected <base> tag can redirect every relative script URL on the page to an attacker's host.");
  }
  return findings;
}

function checkCsp(headers) {
  const value = headers.get("content-security-policy");
  if (!value) {
    if (headers.get("content-security-policy-report-only")) {
      return [{
        category: "headers",
        severity: "low",
        title: "Content-Security-Policy is report-only",
        description: "A Content-Security-Policy-Report-Only header is present but no enforcing policy is, so violations are logged but nothing is actually blocked.",
      }];
    }
    return [{
      category: "headers",
      severity: "medium",
      title: "Missing Content-Security-Policy",
      description: "No Content-Security-Policy header — the browser has no restriction on what scripts, styles, or frames this page may load, which widens the blast radius of any injection bug.",
    }];
  }
  return cspWeaknesses(parseCsp(value), value.slice(0, 200));
}

// Other headers, each checked independently. X-Frame-Options is NOT here:
// it is judged together with CSP frame-ancestors in checkFraming(), since
// either one alone is sufficient protection.
const HEADER_CHECKS = [
  {
    header: "strict-transport-security",
    title: "Strict-Transport-Security (HSTS)",
    missingSeverity: "medium",
    missingDescription: "No Strict-Transport-Security header on an HTTPS response — browsers won't remember to always use HTTPS for this site, leaving room for a downgrade to plain HTTP.",
    httpsOnly: true,
    evaluate(value) {
      const match = value.match(/max-age=(\d+)/i);
      const maxAge = match ? Number(match[1]) : 0;
      if (maxAge < 15_552_000) {
        // 180 days — a common minimum recommendation; short-lived HSTS offers little protection.
        return { severity: "low", title: "Short HSTS max-age", description: `Strict-Transport-Security max-age is ${maxAge || 0} seconds, below the commonly recommended 180-day minimum.` };
      }
      if (!/includesubdomains/i.test(value)) {
        return { severity: "info", title: "HSTS does not cover subdomains", description: "Strict-Transport-Security lacks includeSubDomains, so subdomains of this site can still be reached over plain HTTP." };
      }
      return null;
    },
  },
  {
    header: "x-content-type-options",
    title: "X-Content-Type-Options",
    missingSeverity: "low",
    missingDescription: "No X-Content-Type-Options header — browsers may MIME-sniff responses, which can turn an upload/response that isn't meant to be executable into script in some legacy browser contexts.",
    evaluate(value) {
      if (value.trim().toLowerCase() !== "nosniff") {
        return { severity: "low", title: "Unexpected X-Content-Type-Options value", description: `Expected "nosniff", got "${value}".` };
      }
      return null;
    },
  },
  {
    header: "referrer-policy",
    title: "Referrer-Policy",
    missingSeverity: "info",
    missingDescription: "No Referrer-Policy header — the browser default applies, which may leak the full referring URL (including any query-string data) to third parties on outbound links.",
    evaluate(value) {
      if (/^unsafe-url$/i.test(value.trim())) {
        return { severity: "low", title: "Permissive Referrer-Policy", description: 'Referrer-Policy is "unsafe-url", which always leaks the full referring URL, including any query-string data, to every destination.' };
      }
      return null;
    },
  },
  {
    header: "permissions-policy",
    title: "Permissions-Policy",
    missingSeverity: "info",
    missingDescription: "No Permissions-Policy header — powerful browser features (camera, microphone, geolocation, etc.) are not explicitly restricted for this page or any framed content.",
  },
  {
    header: "cross-origin-opener-policy",
    title: "Cross-Origin-Opener-Policy",
    missingSeverity: "info",
    missingDescription: "No Cross-Origin-Opener-Policy header — a page this site opens (or that opens it) can keep a handle to its window, which enables some cross-window attacks such as tabnabbing and XS-Leaks.",
  },
];

export function checkSecurityHeaders(headers, protocol) {
  const findings = [...checkCsp(headers)];
  for (const check of HEADER_CHECKS) {
    if (check.httpsOnly && protocol !== "https:") continue;
    const value = headers.get(check.header);
    if (!value) {
      findings.push({ category: "headers", severity: check.missingSeverity, title: `Missing ${check.title}`, description: check.missingDescription });
      continue;
    }
    const weak = check.evaluate?.(value);
    if (weak) findings.push({ category: "headers", ...weak, evidence: value.slice(0, 200) });
  }
  return findings;
}

/**
 * Clickjacking protection. Either CSP frame-ancestors (modern, takes
 * precedence in browsers that support it) or X-Frame-Options DENY/
 * SAMEORIGIN is sufficient on its own - only a page with neither, or with a
 * permissive value, is flagged.
 */
export function checkFraming(headers) {
  const finding = (severity, title, description, evidence) => [{ category: "framing", severity, title, description, ...(evidence ? { evidence } : {}) }];
  const csp = headers.get("content-security-policy");
  const frameAncestors = csp ? parseCsp(csp).get("frame-ancestors") : undefined;
  if (frameAncestors) {
    const open = frameAncestors.find(isWildcardSource);
    if (open) {
      return finding("medium", "CSP frame-ancestors allows framing from any site", `frame-ancestors includes "${open}", so any site can embed this page in a frame for clickjacking.`, `frame-ancestors ${frameAncestors.join(" ")}`);
    }
    return [];
  }

  const xfo = headers.get("x-frame-options");
  if (!xfo) {
    return finding("medium", "Page can be framed by any site", "Neither CSP frame-ancestors nor X-Frame-Options is set, so another site can load this page invisibly inside a frame and trick visitors into clicking on it (clickjacking).");
  }
  const value = xfo.trim();
  if (/^(deny|sameorigin)$/i.test(value)) return [];
  if (/^allow-from/i.test(value)) {
    return finding("medium", "X-Frame-Options ALLOW-FROM is ignored", "ALLOW-FROM is not supported by modern browsers, which treat it as if no X-Frame-Options header were set. Use CSP frame-ancestors instead.", value);
  }
  return finding("low", "Non-standard X-Frame-Options value", `X-Frame-Options is set to "${value}" rather than DENY or SAMEORIGIN.`, value);
}

/**
 * CORS, from the headers of the plain GET already made. No Origin header is
 * sent (that would be probing), so origin reflection can't be detected here -
 * only what the server volunteers to every caller.
 */
export function checkCors(headers) {
  const acao = headers.get("access-control-allow-origin")?.trim();
  if (!acao) return [];
  const credentials = headers.get("access-control-allow-credentials")?.trim().toLowerCase() === "true";
  const base = { category: "cors", evidence: `Access-Control-Allow-Origin: ${acao}${credentials ? "; Allow-Credentials: true" : ""}` };
  if (acao === "null") {
    return [{ ...base, severity: "medium", title: 'CORS trusts the "null" origin', description: 'Access-Control-Allow-Origin is "null", which sandboxed iframes and local files can present - effectively trusting any attacker who can create one.' }];
  }
  if (acao === "*" && credentials) {
    return [{ ...base, severity: "medium", title: "Contradictory CORS configuration", description: "The response allows any origin (*) and also allows credentials. Browsers refuse this combination, but it signals a CORS policy that may be reflecting origins elsewhere." }];
  }
  if (acao === "*") {
    return [{ ...base, severity: "info", title: "Response readable by any origin", description: "Access-Control-Allow-Origin is *, so any website can read this response with JavaScript. Fine for public content; a problem if the response ever contains user-specific data." }];
  }
  return [];
}

const DISCLOSURE_HEADERS = ["server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version", "x-generator"];

/** Software/version banners volunteered in response headers. One finding for all of them. */
export function checkDisclosure(headers) {
  const leaked = [];
  for (const name of DISCLOSURE_HEADERS) {
    const value = headers.get(name)?.trim();
    if (!value) continue;
    // A bare "Server: nginx" / "Server: cloudflare" names the product but no
    // version - common and harmless. Only versions (digits) or the
    // framework-specific banners count.
    if (name === "server" && !/\d/.test(value)) continue;
    leaked.push(`${name}: ${value.slice(0, 80)}`);
  }
  if (leaked.length === 0) return [];
  return [{
    category: "disclosure",
    severity: "low",
    title: "Server software version disclosed",
    description: "Response headers announce the server software and version, which lets an attacker look up known vulnerabilities for that exact version without probing.",
    evidence: leaked.join("; "),
  }];
}

/**
 * RFC 9116 security.txt - one GET of a fixed, standard path. Its absence is
 * informational: it only means there's no published way to report a
 * vulnerability to this site.
 */
export async function checkSecurityTxt(baseUrl, fetchOnce) {
  try {
    const result = await fetchOnce(new URL("/.well-known/security.txt", baseUrl).href, { maxRedirects: 1 });
    if (result.status === 200 && /^contact:/im.test(result.body || "")) return [];
  } catch {
    // Unreachable is the same answer as a 404 here.
  }
  return [{
    category: "policy",
    severity: "info",
    title: "No security.txt",
    description: "No /.well-known/security.txt with a Contact field was found, so there is no published way to report a security problem to this site's owner.",
  }];
}

function parseSetCookie(raw) {
  const parts = raw.split(";").map((p) => p.trim());
  const [name] = parts[0].split("=");
  const attrParts = parts.slice(1);
  const attrs = new Set(attrParts.map((p) => p.split("=")[0].toLowerCase()));
  const sameSiteAttr = attrParts.find((p) => p.toLowerCase().startsWith("samesite="));
  return {
    name: (name || "").trim(),
    secure: attrs.has("secure"),
    httpOnly: attrs.has("httponly"),
    sameSite: sameSiteAttr ? sameSiteAttr.split("=")[1]?.trim() : undefined,
  };
}

const SENSITIVE_COOKIE_NAME_RE = /session|auth|token|sid\b|jwt|login/i;
const MAX_COOKIES_CHECKED = 10;

export function checkCookies(headers, protocol) {
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : headers.get("set-cookie") ? [headers.get("set-cookie")] : [];
  const findings = [];
  for (const entry of raw.slice(0, MAX_COOKIES_CHECKED)) {
    const cookie = parseSetCookie(entry);
    if (!cookie.name) continue;

    if (protocol === "https:" && !cookie.secure) {
      findings.push({
        category: "cookies",
        severity: "medium",
        title: `Cookie "${cookie.name}" missing Secure flag`,
        description: "This cookie can be sent over an unencrypted HTTP connection, exposing it to interception on the network.",
        evidence: cookie.name,
      });
    }

    const sensitive = SENSITIVE_COOKIE_NAME_RE.test(cookie.name);
    if (!cookie.httpOnly) {
      findings.push({
        category: "cookies",
        severity: sensitive ? "medium" : "low",
        title: `Cookie "${cookie.name}" missing HttpOnly flag`,
        description: "This cookie is readable by page JavaScript, so a successful XSS on this site could steal it.",
        evidence: cookie.name,
      });
    }

    const sameSite = cookie.sameSite?.toLowerCase();
    if (!sameSite || (sameSite === "none" && !cookie.secure)) {
      findings.push({
        category: "cookies",
        severity: "medium",
        title: `Cookie "${cookie.name}" has weak SameSite protection`,
        description: `SameSite=${cookie.sameSite ?? "(not set)"} offers little to no protection against cross-site request forgery for this cookie.`,
        evidence: cookie.name,
      });
    }
  }
  return findings;
}

// Small, fixed list — one GET each, never brute-forced or expanded from a
// wordlist. See services/site-security/index.js's header comment for the
// "passive only" constraint this exists under.
const ARTIFACT_CHECKS = [
  {
    path: ".git/HEAD",
    title: "Exposed .git repository",
    severity: "high",
    isPositive: (status, body) => status === 200 && /^(ref:\s*refs\/|[0-9a-f]{40}\s*$)/m.test(body.trim()),
    description: "/.git/HEAD is publicly readable, which usually means the whole .git directory — including source history — can be pulled down.",
  },
  {
    path: ".env",
    title: "Exposed .env file",
    severity: "high",
    isPositive: (status, body, contentType) => status === 200 && !/text\/html/i.test(contentType || "") && /^[A-Z][A-Z0-9_]*\s*=/m.test(body),
    description: "A file at /.env is publicly readable. .env files commonly hold database credentials and API keys.",
  },
  {
    path: "phpmyadmin/",
    title: "phpMyAdmin reachable",
    severity: "medium",
    isPositive: (status, body) => status === 200 && /phpmyadmin/i.test(body),
    description: "A phpMyAdmin instance is reachable at this path without apparent access restriction.",
  },
  {
    path: "admin/",
    title: "Admin path reachable",
    severity: "info",
    isPositive: (status) => status === 200,
    description: "An /admin path responds with 200. Informational only — many sites intentionally expose an admin login page here.",
  },
  {
    path: "wp-admin/",
    title: "WordPress admin path reachable",
    severity: "info",
    isPositive: (status) => status === 200,
    description: "A /wp-admin path responds with 200. Informational only unless combined with other findings.",
  },
];

// The probes run in parallel: with no time limit, a slow site (5-6s per
// request) would otherwise make the report wait for each one in turn.
export async function checkExposedArtifacts(baseUrl, fetchOnce) {
  const results = await Promise.all(
    ARTIFACT_CHECKS.map(async (check) => {
      try {
        const result = await fetchOnce(new URL(check.path, baseUrl).href, { maxRedirects: 1 });
        const contentType = result.headers.get("content-type");
        return check.isPositive(result.status, result.body, contentType)
          ? { category: "exposed-artifacts", severity: check.severity, title: check.title, description: check.description, evidence: `/${check.path}` }
          : null;
      } catch {
        return null; // Unreachable/blocked path is not itself a finding — same as a 404.
      }
    })
  );
  return results.filter(Boolean);
}

const SCRIPT_SRC_RE = /<script[^>]+src=["']([^"']+)["']/gi;
const MAX_SCRIPTS_CHECKED = 5;

// Only checks .map siblings of scripts the page itself already references —
// not a guessed filename list, so this stays within "no brute forcing".
export async function checkSourceMaps(baseUrl, html, fetchOnce) {
  const base = new URL(baseUrl);
  const seen = new Set();
  const findings = [];
  for (const match of html.matchAll(SCRIPT_SRC_RE)) {
    if (seen.size >= MAX_SCRIPTS_CHECKED) break;
    let src;
    try {
      src = new URL(match[1], baseUrl);
    } catch {
      continue;
    }
    if (src.hostname !== base.hostname || seen.has(src.href)) continue;
    seen.add(src.href);

    try {
      const mapUrl = `${src.href}.map`;
      const result = await fetchOnce(mapUrl, { maxRedirects: 1 });
      const contentType = result.headers.get("content-type") || "";
      const looksLikeSourceMap = result.status === 200 && (/json/i.test(contentType) || /"mappings"\s*:/.test(result.body));
      if (looksLikeSourceMap) {
        findings.push({
          category: "exposed-artifacts",
          severity: "medium",
          title: "Source map exposed",
          description: `A source map is publicly reachable for ${src.pathname}, which can expose original (unminified) source structure and comments.`,
          evidence: mapUrl,
        });
      }
    } catch {
      continue;
    }
  }
  return findings;
}

// Passive only: these match against the response body of the single GET
// already performed for this URL. Nothing here sends crafted input to
// trigger an error — see services/site-security/index.js's header comment.
const ERROR_SIGNATURES = [
  { re: /SQL syntax.*?MySQL/i, engine: "MySQL" },
  { re: /Warning.*?\bmysqli?_/i, engine: "MySQL" },
  { re: /PostgreSQL.*?ERROR/i, engine: "PostgreSQL" },
  { re: /pg_query\(\)\s*\[/i, engine: "PostgreSQL" },
  { re: /Unclosed quotation mark after the character string/i, engine: "Microsoft SQL Server" },
  { re: /Microsoft OLE DB Provider for (ODBC Drivers|SQL Server)/i, engine: "Microsoft SQL Server" },
  { re: /ORA-\d{5}/, engine: "Oracle" },
  { re: /SQLITE_ERROR|SQLite\/JDBCDriver/i, engine: "SQLite" },
  { re: /Fatal error: Uncaught (Error|Exception)/i, engine: "PHP" },
  { re: /Traceback \(most recent call last\)/, engine: "Python" },
  { re: /\/bin\/(ba)?sh: .*?: (command not found|No such file or directory)/i, engine: "shell" },
  { re: /System\.Data\.SqlClient\.SqlException/i, engine: ".NET / SQL Server" },
];

export function scanForErrorSignatures(body) {
  const findings = [];
  const seenEngines = new Set();
  for (const { re, engine } of ERROR_SIGNATURES) {
    if (seenEngines.has(engine)) continue;
    const match = re.exec(body);
    if (!match) continue;
    seenEngines.add(engine);
    findings.push({
      category: "injection-signal",
      severity: "low",
      title: `Possible ${engine} error text in the response`,
      description: `The page response contains text resembling a ${engine} error message. This is a possible weakness, not a confirmed vulnerability — it would require authorized testing to confirm whether any parameter is actually injectable.`,
      evidence: match[0].slice(0, 160),
    });
  }
  return findings;
}

export const SEVERITY_DEDUCTION = { high: 25, medium: 10, low: 4, info: 0 };
const GRADE_THRESHOLDS = [
  [90, "A"],
  [75, "B"],
  [60, "C"],
  [40, "D"],
];

// Scoring model. A flat "-N per finding" over-punishes repetition: four
// cookies each missing SameSite is one configuration mistake, not four, and
// one noisy area shouldn't be able to zero the whole grade by itself. So:
//   - findings of the same KIND (same category + title, ignoring quoted
//     names and numbers) count in full once, then REPEAT_WEIGHT each;
//   - each category's total is capped at CATEGORY_CAP points.
// Distinct problems in one category (missing CSP AND missing HSTS) still
// each count in full, up to the cap.
const REPEAT_WEIGHT = 0.25;
export const CATEGORY_CAP = 35;

const kindOf = (f) => `${f.category}|${String(f.title || "").replace(/"[^"]*"/g, '""').replace(/\d+/g, "#")}`;

/** @returns {Map<string, number>} points actually lost per category, after repeat weighting and the cap */
export function pointsLostByCategory(findings) {
  const kinds = new Map(); // kind -> { category, deductions[] }
  for (const f of findings) {
    const d = SEVERITY_DEDUCTION[f.severity] ?? 0;
    if (d <= 0) continue;
    const key = kindOf(f);
    if (!kinds.has(key)) kinds.set(key, { category: f.category, deductions: [] });
    kinds.get(key).deductions.push(d);
  }
  const raw = new Map();
  for (const { category, deductions } of kinds.values()) {
    const sorted = [...deductions].sort((a, b) => b - a);
    const kindTotal = sorted.reduce((sum, d, i) => sum + (i === 0 ? d : d * REPEAT_WEIGHT), 0);
    raw.set(category, (raw.get(category) ?? 0) + kindTotal);
  }
  return new Map([...raw].map(([category, pts]) => [category, Math.min(CATEGORY_CAP, Math.round(pts))]));
}

export function computeGrade(findings) {
  let lost = 0;
  for (const pts of pointsLostByCategory(findings).values()) lost += pts;
  const score = Math.max(0, 100 - lost);
  for (const [min, grade] of GRADE_THRESHOLDS) {
    if (score >= min) return { grade, score };
  }
  return { grade: "F", score };
}
