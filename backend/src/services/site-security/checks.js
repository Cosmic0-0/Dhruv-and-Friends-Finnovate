// Passive, server-side checks against a single already-fetched response
// (headers/cookies/body) plus a handful of one-shot GETs to well-known paths
// on the same host (exposed-artifacts/source-maps). Nothing here sends
// crafted input, fuzzes, or brute-forces — see services/site-security/index.js
// for how these are composed into one report.

const HEADER_CHECKS = [
  {
    header: "content-security-policy",
    title: "Content-Security-Policy",
    missingSeverity: "medium",
    missingDescription:
      "No Content-Security-Policy header — the browser has no restriction on what scripts, styles, or frames this page may load, which widens the blast radius of any injection bug.",
    evaluate(value) {
      const weak = value.match(/unsafe-inline|unsafe-eval|(?:^|[\s;])\*(?=[\s;]|$)/i);
      if (weak) {
        return {
          severity: "medium",
          title: "Weak Content-Security-Policy",
          description: `The CSP includes "${weak[0].trim()}", which significantly weakens its protection against injected scripts.`,
        };
      }
      return null;
    },
  },
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
      return null;
    },
  },
  {
    header: "x-frame-options",
    title: "X-Frame-Options",
    missingSeverity: "low",
    missingDescription: "No X-Frame-Options header — the page can potentially be embedded in a frame on another site for clickjacking, unless CSP's frame-ancestors covers it instead.",
    evaluate(value) {
      if (!/^(deny|sameorigin)$/i.test(value.trim())) {
        return { severity: "low", title: "Non-standard X-Frame-Options value", description: `X-Frame-Options is set to "${value}" rather than DENY or SAMEORIGIN.` };
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
];

export function checkSecurityHeaders(headers, protocol) {
  const findings = [];
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

export async function checkExposedArtifacts(baseUrl, fetchOnce) {
  const findings = [];
  for (const check of ARTIFACT_CHECKS) {
    try {
      const target = new URL(check.path, baseUrl).href;
      const result = await fetchOnce(target, { maxRedirects: 1, timeoutMs: 4000 });
      const contentType = result.headers.get("content-type");
      if (check.isPositive(result.status, result.body, contentType)) {
        findings.push({ category: "exposed-artifacts", severity: check.severity, title: check.title, description: check.description, evidence: `/${check.path}` });
      }
    } catch {
      // Unreachable/blocked path is not itself a finding — same as a 404.
    }
  }
  return findings;
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
      const result = await fetchOnce(mapUrl, { maxRedirects: 1, timeoutMs: 4000 });
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

const SEVERITY_DEDUCTION = { high: 25, medium: 10, low: 4, info: 0 };
const GRADE_THRESHOLDS = [
  [90, "A"],
  [75, "B"],
  [60, "C"],
  [40, "D"],
];

export function computeGrade(findings) {
  let score = 100;
  for (const finding of findings) score -= SEVERITY_DEDUCTION[finding.severity] ?? 0;
  score = Math.max(0, score);
  for (const [min, grade] of GRADE_THRESHOLDS) {
    if (score >= min) return { grade, score };
  }
  return { grade: "F", score };
}
