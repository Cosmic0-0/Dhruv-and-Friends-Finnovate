// Matches script src/text against the trimmed Retire.js dataset
// (retire-js-dataset.js) to detect known-vulnerable library versions.
//
// This is a real (if reduced) implementation of retire.js's own matching
// approach: each library entry's `uri`/`filecontent` regexes contain a
// literal "§§version§§" placeholder that upstream retire.js replaces with a
// version-capturing group before compiling — this module does the same
// substitution, so the regexes themselves are unmodified from upstream.
//
// Deliberately NOT implemented (scope cut for the hackathon build, not a
// silent gap — see extension/README.md's Security Report section):
//   - `func` extractors (read a global like window.jQuery.fn.jquery) - these
//     need MAIN-world JS execution, not just DOM/text access, and pulling
//     that in for every candidate library was more surface than this pass
//     needed given `uri`/`filecontent` already cover the common CDN and
//     bundled-source cases.
//   - `hashes` extractors (exact-file SHA1 matching) - requires downloading
//     and hashing the full file; skipped for the same reason.
// A library that only ships a `func` or `hashes` signature upstream simply
// never matches here, which is a false-negative risk, not a false-positive
// one — this module only ever reports a library as vulnerable when it found
// a real regex match and a real version-range hit, never a guess.

import { RETIRE_JS_DATASET } from "./retire-js-dataset.js";

const VERSION_PLACEHOLDER = "§§version§§";
const VERSION_CAPTURE = "([0-9][0-9A-Za-z._\\-]*)";

function compileExtractor(pattern) {
  const withCapture = pattern.split(VERSION_PLACEHOLDER).join(VERSION_CAPTURE);
  try {
    return new RegExp(withCapture);
  } catch {
    return null; // a handful of upstream patterns use PCRE features (lookbehind on old engines, etc.) that may not compile everywhere
  }
}

function firstMatch(patterns, subject) {
  if (!subject) return null;
  for (const pattern of patterns) {
    const re = compileExtractor(pattern);
    const match = re?.exec(subject);
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseVersionPart(part) {
  const m = /^(\d*)(.*)$/.exec(part || "");
  return { num: m[1] ? parseInt(m[1], 10) : 0, suffix: m[2] || "" };
}

// A simplified (not fully spec-faithful) comparator - good enough for the
// dotted-numeric-with-optional-suffix versions ("1.9.0", "1.9.0b1",
// "2.999.999") that appear in this dataset's `below`/`atOrAbove` bounds.
function compareVersions(a, b) {
  const partsA = String(a).split(/[.\-]/);
  const partsB = String(b).split(/[.\-]/);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const pa = parseVersionPart(partsA[i]);
    const pb = parseVersionPart(partsB[i]);
    if (pa.num !== pb.num) return pa.num - pb.num;
    if (pa.suffix !== pb.suffix) return pa.suffix < pb.suffix ? -1 : 1;
  }
  return 0;
}

function isInRange(version, vuln) {
  if (vuln.below && compareVersions(version, vuln.below) >= 0) return false;
  if (vuln.atOrAbove && compareVersions(version, vuln.atOrAbove) < 0) return false;
  return true;
}

/**
 * @param {{src?: string, text?: string}[]} scripts - script tags observed on the page (see collect-signals.js), each with its resolved URL and/or fetched text
 * @returns {{name: string, version: string, vulnerabilities: {severity: string, info: string}[]}[]}
 */
export function detectVulnerableLibraries(scripts) {
  const findings = [];
  const matchedLibraries = new Set();

  for (const script of scripts) {
    for (const [key, lib] of Object.entries(RETIRE_JS_DATASET)) {
      if (matchedLibraries.has(key)) continue;

      const version = firstMatch(lib.extractors.uri ?? [], script.src) ?? firstMatch(lib.extractors.filecontent ?? [], script.text);
      if (!version) continue;
      matchedLibraries.add(key);

      const vulnerabilities = lib.vulnerabilities.filter((v) => isInRange(version, v));
      if (vulnerabilities.length > 0) {
        findings.push({
          name: lib.npmname || key,
          version,
          vulnerabilities: vulnerabilities.map((v) => ({ severity: v.severity, info: v.info ? `${v.summary} (${v.info})` : v.summary })),
        });
      }
    }
  }
  return findings;
}
