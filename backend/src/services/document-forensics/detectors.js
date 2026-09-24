// Non-LLM, deterministic document-forensics rules: plain facts about an
// uploaded file (from pdf.js / docx.js, parsed in the worker) -> DOC-01..08
// registry signals. Pure functions of (facts, now) - unit-tested in
// detectors.test.js with synthetic facts, no PDF needed.
//
// Every signal is a WARNING SIGN, not proof: legitimate tools can leave some
// of these traces, and a forgery that was printed and scanned again leaves
// none. Descriptions say what was found, never "this is fake".

import { makeSignal } from "../signals/registry.js";
import { redact } from "../redact/index.js";
import { matchEditingTools } from "./tools.js";
import { LOW_RES_RATIO, MIN_TRANSPARENT_SHARE } from "./overlay.js";

export const DOCUMENT_DETECTOR_VERSION = "document-1.1";

export const RULES = Object.freeze({
  /** DOC-03: "modified before created" only beyond this clock slack. */
  modBeforeCreateToleranceMs: 60_000,
  /** DOC-03: dates later than now + this (time zones) are "in the future". */
  futureToleranceMs: 24 * 60 * 60_000,
  /** DOC-05: typed-on text needs at least this many non-space characters. */
  insertedTextMinChars: 2,
  /** DOC-06: at least this many hidden non-space characters on a page. */
  hiddenTextMinChars: 20,
  /** DOC-06: effective font sizes below this (points) cannot be read. */
  tinyFontPt: 1,
  /** DOC-08: conservative on purpose - see fontOutliers(). */
  fontOutlier: Object.freeze({ minItems: 10, dominantShare: 0.5, maxOutlierItems: 2 }),
  snippetMax: 120,
  maxSnippets: 3,
});

// DOC-08: text that looks like a money amount, account number, IBAN or date.
const AMOUNT = String.raw`(?:\d{1,3}(?:[ ,.]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2})`;
export const VALUE_RE = new RegExp(
  [
    String.raw`(?:\bRs\.?|\bMUR|\bEUR|\bUSD|\bGBP|[€$£])\s?\d`,
    String.raw`(?<![\d])${AMOUNT}(?![\d])`,
    String.raw`\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}`,
    String.raw`(?<![\d])\d(?:[ -]?\d){7,}(?![\d])`,
    String.raw`(?<![\d])\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?![\d])`,
    String.raw`\b\d{4}-\d{2}-\d{2}\b`,
    String.raw`\b\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s\d{4}\b`,
  ].join("|"),
);

const nonSpace = (s) => s.replace(/\s/g, "").length;
const isHiddenMode = (r) => r.renderMode === 3 || r.renderMode === 7;
// coveredByScan: painted before the scan image and hidden under it (pdf.js classifyPage).
const isVisible = (r) => !isHiddenMode(r) && r.fill === "color" && !r.coveredByScan;
const round = (n, digits = 0) => (typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(digits)) : null);

/** Redacted, whitespace-collapsed, length-capped text for evidence. */
export function snippet(text) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return redact(oneLine).redacted.slice(0, RULES.snippetMax);
}

/**
 * "ABCDEF+Arial-BoldMT" -> "arial". Subset tags and style suffixes are
 * stripped so a bold heading in the same family is never an outlier.
 */
export function fontFamily(name) {
  if (typeof name !== "string" || name === "") return "";
  return name
    .replace(/^[A-Z]{6}\+/, "")
    .split(/[-,]/)[0]
    .replace(/(?:PSMT|PS|MT)$/, "")
    .replace(/(?:Bold|Italic|Oblique|Regular|Medium|Light|Semibold|Black|Condensed|Narrow)+$/i, "")
    .toLowerCase();
}

/** Consecutive runs in the same font on the same baseline are one item (a line fragment). */
export function mergeRuns(runs) {
  const items = [];
  for (const r of runs) {
    const last = items[items.length - 1];
    const sameLine = last && Math.abs(last.y - r.y) < Math.max(1, 0.3 * (r.fontSize || 1));
    if (last && sameLine && last.font === r.font && last.renderMode === r.renderMode && last.fill === r.fill) {
      last.text += r.text;
    } else {
      items.push({ ...r });
    }
  }
  return items;
}

function doc01(facts) {
  const m = facts.metadata ?? {};
  const fields =
    facts.fileType === "pdf"
      ? [["Producer", m.producer], ["Creator", m.creator], ["XMP producer", m.xmpProducer], ["XMP creator tool", m.xmpCreatorTool]]
      : // Person fields are only matched, never echoed: a hit reports the field name and the tool.
        [["Application", m.application], ["Author field", m.coreCreator], ["Last saved by", m.coreLastModifiedBy]];
  const tools = new Set();
  const hitFields = [];
  for (const [field, value] of fields) {
    const hits = matchEditingTools(value);
    if (hits.length) hitFields.push(field);
    hits.forEach((t) => tools.add(t));
  }
  if (tools.size === 0) return [];
  const list = [...tools];
  return [
    makeSignal("DOC-01", {
      sourceType: "rule",
      description: `The file was produced or saved with ${list.join(", ")}, a consumer editing tool. Official documents normally come straight from the issuer's own systems.`,
      metadata: { tools: list, fields: hitFields },
    }),
  ];
}

function doc02(facts) {
  const s = facts.structure;
  if (!s) return [];
  if (s.afterSignature) {
    return [
      makeSignal("DOC-02", {
        sourceType: "rule",
        severity: "high",
        description: `The file was changed after it was digitally signed: ${s.bytesAfterSignature} bytes were added after the signed part, so what you see may not be what was signed.`,
        metadata: { variant: "after_signature", bytesAfterSignature: s.bytesAfterSignature, revisions: s.incrementalUpdates },
      }),
    ];
  }
  if (s.unexplainedUpdates > 0) {
    return [
      makeSignal("DOC-02", {
        sourceType: "rule",
        description: `The file was edited and saved again after it was first created (${s.unexplainedUpdates} later revision${s.unexplainedUpdates === 1 ? "" : "s"}).`,
        metadata: { variant: "incremental_update", revisions: s.incrementalUpdates, unexplained: s.unexplainedUpdates },
      }),
    ];
  }
  return [];
}

function producerTokens(value) {
  const stop = new Set(["pdf", "for", "and", "the", "with", "version", "using", "modified"]);
  return new Set((value.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((t) => !stop.has(t)));
}

function doc03(facts, now) {
  const m = facts.metadata ?? {};
  const created = m.created ?? m.xmpCreated ?? null;
  const modified = m.modified ?? m.xmpModified ?? null;
  const out = [];
  if (created !== null && modified !== null && modified < created - RULES.modBeforeCreateToleranceMs) {
    out.push(makeSignal("DOC-03", {
      sourceType: "rule",
      description: "The file says it was last modified before it was created.",
      metadata: { variant: "mod_before_create", created: new Date(created).toISOString(), modified: new Date(modified).toISOString() },
    }));
  }
  const future = [["created", m.created], ["modified", m.modified], ["created", m.xmpCreated], ["modified", m.xmpModified]]
    .find(([, t]) => typeof t === "number" && t > now + RULES.futureToleranceMs);
  if (future) {
    out.push(makeSignal("DOC-03", {
      sourceType: "rule",
      description: `The file's ${future[0]} date is in the future (${new Date(future[1]).toISOString().slice(0, 10)}).`,
      metadata: { variant: "future_date", field: future[0], date: new Date(future[1]).toISOString() },
    }));
  }
  if (facts.fileType === "pdf" && m.producer && m.xmpProducer) {
    const a = producerTokens(m.producer);
    const b = producerTokens(m.xmpProducer);
    if (a.size > 0 && b.size > 0 && ![...a].some((t) => b.has(t))) {
      out.push(makeSignal("DOC-03", {
        sourceType: "rule",
        description: `The file's two metadata records disagree about which tool produced it ("${m.producer}" and "${m.xmpProducer}") - one of them was not updated when the file was re-saved.`,
        metadata: { variant: "producer_mismatch", infoProducer: m.producer, xmpProducer: m.xmpProducer },
      }));
    }
  }
  return out;
}

function doc04(facts, docxImages) {
  const out = [];
  if (facts.fileType === "pdf") {
    for (const page of facts.pages ?? []) {
      for (const o of page.overlays ?? []) {
        const transparent = !o.stencil && o.transparentShare >= MIN_TRANSPARENT_SHARE;
        const ratio = o.effectiveDpi && o.backgroundDpi ? o.backgroundDpi / o.effectiveDpi : null;
        const lowRes = ratio !== null && o.effectiveDpi < LOW_RES_RATIO * o.backgroundDpi;
        const variant = transparent ? "transparent_overlay" : lowRes ? "resolution_mismatch" : "overlay";
        const res = lowRes ? ` at ${ratio.toFixed(1)}x lower resolution than the scan around it (upscaled)` : "";
        const description =
          variant === "transparent_overlay"
            ? `Page ${o.page}: an image with a transparent background was placed on top of the scanned page${res}. Pasted signatures and stamps look like this.`
            : variant === "resolution_mismatch"
              ? `Page ${o.page}: an image was placed on top of the scanned page${res}.`
              : `Page ${o.page}: a separate image was placed on top of the scanned page.`;
        out.push(makeSignal("DOC-04", {
          sourceType: "rule",
          severity: variant === "overlay" ? "low" : "high",
          description,
          metadata: {
            variant,
            page: o.page,
            widthPx: o.widthPx,
            heightPx: o.heightPx,
            effectiveDpi: round(o.effectiveDpi),
            backgroundDpi: round(o.backgroundDpi),
            resolutionRatio: round(ratio, 1),
            hasAlpha: transparent,
            hardEdgeRatio: round(o.hardEdgeRatio, 2),
            ...(o.previewKey ? { previewKey: o.previewKey } : {}),
          },
        }));
      }
    }
  }
  for (const img of docxImages) {
    if (!(img.transparentShare >= MIN_TRANSPARENT_SHARE)) continue;
    out.push(makeSignal("DOC-04", {
      sourceType: "rule",
      severity: "low",
      description: "A picture with a transparent background floats over the document's text - often a pasted signature or stamp. Real Word signatures can look like this too.",
      metadata: {
        variant: "docx_transparent_image",
        page: null,
        widthPx: img.widthPx,
        heightPx: img.heightPx,
        effectiveDpi: round(img.effectiveDpi),
        backgroundDpi: null,
        resolutionRatio: null,
        hasAlpha: true,
        hardEdgeRatio: round(img.hardEdgeRatio, 2),
        ...(img.previewKey ? { previewKey: img.previewKey } : {}),
      },
    }));
  }
  return out;
}

function doc05(facts) {
  const out = [];
  for (const page of facts.pages ?? []) {
    if (!page.isScanPage) continue;
    const items = mergeRuns((page.runs ?? []).filter(isVisible)).filter((it) => nonSpace(it.text) >= RULES.insertedTextMinChars);
    if (items.length === 0) continue;
    const snippets = items.slice(0, RULES.maxSnippets).map((it) => snippet(it.text));
    out.push(makeSignal("DOC-05", {
      sourceType: "rule",
      evidence: snippets[0],
      description: `Page ${page.page}: text was typed on top of the scanned page ("${snippets[0]}"). Scans carry their text inside the image; typed-on text is a common way to change amounts, names or dates.`,
      metadata: { page: page.page, snippets, characters: items.reduce((n, it) => n + nonSpace(it.text), 0) },
    }));
  }
  return out;
}

function doc06(facts) {
  const out = [];
  for (const page of facts.pages ?? []) {
    // OCR'd scans legitimately put invisible text over the page image.
    if (page.scan) continue;
    // Page content only: annotation text (filled fields, comments) is shown by viewers.
    const runs = (page.runs ?? []).filter((r) => !r.annotation);
    const groups = [
      // Invisible text over a photo or partial-page scan is its OCR layer (overImage, pdf.js classifyPage).
      ["invisible_render_mode", runs.filter((r) => isHiddenMode(r) && !r.overImage), "drawn invisibly"],
      // White text only counts when nothing coloured is painted on the page:
      // white-on-a-dark-banner is ordinary design.
      ["white_text", page.imageCount === 0 && !page.nonWhiteFill ? runs.filter((r) => !isHiddenMode(r) && r.fill === "white") : [], "drawn in white on a white page"],
      ["tiny_font", runs.filter((r) => !isHiddenMode(r) && r.fontSize > 0 && r.fontSize < RULES.tinyFontPt), "drawn too small to read"],
    ];
    for (const [variant, hidden, how] of groups) {
      const chars = hidden.reduce((n, r) => n + nonSpace(r.text), 0);
      if (chars < RULES.hiddenTextMinChars) continue;
      const sample = snippet(hidden.map((r) => r.text).join(" "));
      out.push(makeSignal("DOC-06", {
        sourceType: "rule",
        evidence: sample,
        description: `Page ${page.page}: ${chars} characters of text are ${how}. Hidden text can carry instructions meant for automated checkers rather than for you.`,
        metadata: { variant, page: page.page, characters: chars },
      }));
    }
  }
  return out;
}

const ACTIVE = Object.freeze({
  javascript: ["high", "The PDF contains JavaScript that can run when it is opened."],
  launch_action: ["high", "The PDF contains an action that tries to open another file or program."],
  embedded_file: ["medium", "The PDF has other files attached inside it."],
  submit_form: ["medium", "The PDF contains a form that sends what you type to an outside web address."],
  macro: ["high", "The Word file contains macros - code that runs if you enable editing or content."],
  external_template: ["high", "The Word file loads a template from the internet when it is opened, a known way to deliver malware."],
  ole_object: ["medium", "The Word file contains an embedded object that can run content when opened."],
});

function doc07(facts) {
  const ac = facts.activeContent ?? { variants: [] };
  return ac.variants
    .filter((v) => ACTIVE[v])
    .map((variant) => {
      const [severity, text] = ACTIVE[variant];
      const host = variant === "external_template" && ac.templateHost ? ` (${ac.templateHost})` : "";
      return makeSignal("DOC-07", {
        sourceType: "rule",
        severity,
        description: text.replace(/\.$/, `${host}.`),
        metadata: { variant, ...(host ? { host: ac.templateHost } : {}) },
      });
    });
}

/**
 * A money/identity value in a font family used almost nowhere else on a page
 * whose text is dominated by one family - the classic trace of a statement
 * edited in a PDF editor that could not reuse the original embedded font.
 * Native pages only: on a scan page, typed-on text is already DOC-05.
 */
export function fontOutliers(page) {
  const { minItems, dominantShare, maxOutlierItems } = RULES.fontOutlier;
  // Page content only: form-field values in their own font are ordinary.
  const items = mergeRuns((page.runs ?? []).filter((r) => isVisible(r) && !r.annotation)).filter((it) => nonSpace(it.text) > 0);
  if (items.length < minItems) return [];
  const counts = new Map();
  for (const it of items) {
    const fam = fontFamily(it.font);
    counts.set(fam, (counts.get(fam) ?? 0) + 1);
  }
  const [dominant, dominantCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (dominantCount / items.length < dominantShare) return [];
  return items.filter((it) => {
    const fam = fontFamily(it.font);
    return fam !== dominant && (counts.get(fam) ?? 0) <= maxOutlierItems && VALUE_RE.test(it.text);
  }).map((it) => ({ ...it, dominantFont: items.find((x) => fontFamily(x.font) === dominant)?.font ?? dominant }));
}

function doc08(facts) {
  const out = [];
  for (const page of facts.pages ?? []) {
    if (page.scan) continue;
    const outliers = fontOutliers(page);
    if (outliers.length === 0) continue;
    const snippets = outliers.slice(0, RULES.maxSnippets).map((it) => snippet(it.text));
    const cleanFont = (f) => (typeof f === "string" ? f.replace(/^[A-Z]{6}\+/, "").slice(0, 60) : "unknown");
    out.push(makeSignal("DOC-08", {
      sourceType: "rule",
      evidence: snippets[0],
      description: `Page ${page.page}: "${snippets[0]}" is set in ${cleanFont(outliers[0].font)} while the rest of the page uses ${cleanFont(outliers[0].dominantFont)} - a common trace of an edited amount, account number or date.`,
      metadata: { page: page.page, snippets, font: cleanFont(outliers[0].font), dominantFont: cleanFont(outliers[0].dominantFont) },
    }));
  }
  return out;
}

/**
 * @param {object} facts from inspectPdf()/inspectDocx()
 * @param {{ now: number, docxImages?: object[] }} ctx docxImages: alpha facts for DOCX pictures (images.js)
 * @returns {object[]} DOC-* registry signals
 */
export function detectDocumentSignals(facts, { now, docxImages = [] }) {
  return [
    ...doc01(facts),
    ...doc02(facts),
    ...doc03(facts, now),
    ...doc04(facts, docxImages),
    ...doc05(facts),
    ...doc06(facts),
    ...doc07(facts),
    ...doc08(facts),
  ];
}
