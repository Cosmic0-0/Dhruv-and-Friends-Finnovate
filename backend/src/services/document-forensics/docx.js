// DOCX inspection: parses an UNTRUSTED Office Open XML package into plain
// facts. Runs inside the document worker. Only named parts are inflated
// (zip.js enforces the entry/size limits) and parsed with small targeted
// regular expressions - no general XML parser, no macro execution, no
// network access: an external template's address is only read, never fetched.

import { DocumentInspectError } from "./sniff.js";
import { readZipDirectory, readZipPart, ZipError } from "./zip.js";
import { parseIsoDate, sanitizeMeta } from "./meta.js";

const XML_PART_MAX = 2 * 1024 * 1024;
const DOCUMENT_PART_MAX = 20 * 1024 * 1024;
const IMAGE_PART_MAX = 2 * 1024 * 1024;
export const MAX_DOCX_IMAGES = 4;

const WORD_MAIN_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml",
  "application/vnd.ms-word.document.macroenabled.main+xml",
  "application/vnd.ms-word.template.macroenabledtemplate.main+xml",
];

const decoder = new TextDecoder();

export function decodeXmlEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "amp") return "&";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const cp = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  });
}

function attr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decodeXmlEntities(m[1] ?? m[2]) : null;
}

function elementText(xml, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? decodeXmlEntities(m[1]).trim() : null;
}

function relationships(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => ({
    id: attr(tag, "Id"),
    type: attr(tag, "Type") ?? "",
    target: attr(tag, "Target") ?? "",
    external: (attr(tag, "TargetMode") ?? "").toLowerCase() === "external",
  }));
}

/**
 * Plain text of word/document.xml: <w:t> runs, a newline per paragraph or
 * break, a tab per <w:tab/> (tab-stop DEFINITIONS carry attributes and are
 * not characters, so only the bare element counts).
 */
export function extractDocxText(xml) {
  let text = "";
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>|<\/w:p>/g)) {
    if (m[1] !== undefined) text += decodeXmlEntities(m[1]);
    else if (m[0] === "<w:tab/>") text += "\t";
    else text += "\n";
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** PNGs that can carry transparency: colour type 4/6, or a tRNS chunk before the image data. */
export function pngCanHaveAlpha(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || !sig.every((b, i) => bytes[i] === b)) return false;
  const colorType = bytes[25];
  if (colorType === 4 || colorType === 6) return true;
  let p = 8;
  while (p + 8 <= bytes.length) {
    const length = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    if (type === "tRNS") return true;
    if (type === "IDAT" || type === "IEND" || length < 0) return false;
    p += 12 + length;
  }
  return false;
}

function resolveTarget(baseDir, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${baseDir}/${target}`.split("/");
  const out = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  return out.join("/");
}

function hostOf(url) {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/**
 * @param {Uint8Array} bytes a ZIP whose [Content_Types].xml must declare a Word main document
 */
export function inspectDocx(bytes) {
  let entries;
  try {
    entries = readZipDirectory(bytes);
  } catch (err) {
    throw new DocumentInspectError("unreadable", err.message);
  }
  const read = (name, max = XML_PART_MAX) => {
    const entry = entries.get(name);
    if (!entry) return null;
    return readZipPart(bytes, entry, max);
  };
  const readXml = (name, max) => {
    const data = read(name, max);
    return data ? decoder.decode(data) : null;
  };

  try {
    const contentTypes = readXml("[Content_Types].xml");
    if (!contentTypes) throw new DocumentInspectError("unsupported", "no [Content_Types].xml");
    const mainOverride = [...contentTypes.matchAll(/<Override\b[^>]*>/g)]
      .map(([tag]) => ({ part: attr(tag, "PartName") ?? "", type: (attr(tag, "ContentType") ?? "").toLowerCase() }))
      .find((o) => WORD_MAIN_TYPES.includes(o.type));
    if (!mainOverride) throw new DocumentInspectError("unsupported", "not a Word document");

    const docPath = mainOverride.part.replace(/^\//, "");
    const docDir = docPath.includes("/") ? docPath.slice(0, docPath.lastIndexOf("/")) : "";
    const docName = docPath.slice(docPath.lastIndexOf("/") + 1);
    const documentXml = readXml(docPath, DOCUMENT_PART_MAX);
    if (documentXml === null) throw new DocumentInspectError("unreadable", "main document part missing");

    const appXml = readXml("docProps/app.xml");
    const coreXml = readXml("docProps/core.xml");
    const docRels = relationships(readXml(`${docDir ? `${docDir}/` : ""}_rels/${docName}.rels`));
    const settingsRels = relationships(readXml(`${docDir ? `${docDir}/` : ""}_rels/settings.xml.rels`));
    const names = [...entries.keys()];

    const activeVariants = new Set();
    const activeDetails = {};
    if (names.some((n) => /(^|\/)vbaProject\.bin$/i.test(n)) || /vbaProject/i.test(contentTypes)) activeVariants.add("macro");
    const template = settingsRels.find((r) => r.external && /\/attachedTemplate$/i.test(r.type));
    if (template) {
      activeVariants.add("external_template");
      activeDetails.templateHost = sanitizeMeta(hostOf(template.target), 120);
    }
    if (names.some((n) => /(^|\/)embeddings\/oleObject\d*\.bin$/i.test(n)) || docRels.some((r) => /\/oleObject$/i.test(r.type))) {
      activeVariants.add("ole_object");
    }

    // Floating (<wp:anchor>) pictures that can be transparent: how a pasted
    // signature or stamp sits over a Word document's text.
    const relById = new Map(docRels.map((r) => [r.id, r]));
    const images = [];
    for (const [anchor] of documentXml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)) {
      if (images.length >= MAX_DOCX_IMAGES) break;
      const embed = /\br:embed\s*=\s*"([^"]+)"/.exec(anchor)?.[1];
      const rel = embed ? relById.get(embed) : null;
      if (!rel || rel.external) continue;
      const path = resolveTarget(docDir, rel.target);
      const entry = entries.get(path);
      if (!entry || !/\.png$/i.test(path) || entry.size > IMAGE_PART_MAX) continue;
      const png = readZipPart(bytes, entry, IMAGE_PART_MAX);
      if (!pngCanHaveAlpha(png)) continue;
      const extent = /<wp:extent\b[^>]*>/.exec(anchor)?.[0] ?? "";
      images.push({
        key: `docx-${images.length}`,
        cx: Number(attr(extent, "cx")) || null,
        cy: Number(attr(extent, "cy")) || null,
        data: png.buffer,
      });
    }

    const pages = Number.parseInt(elementText(appXml ?? "", "Pages") ?? "", 10);
    return {
      fileType: "docx",
      pageCount: Number.isFinite(pages) && pages > 0 ? pages : null,
      pagesAnalyzed: null,
      metadata: {
        application: sanitizeMeta(elementText(appXml ?? "", "Application")),
        // Person fields (author, last editor) are read ONLY to match against
        // the editing-tool list; detectors never return their values.
        coreCreator: sanitizeMeta(elementText(coreXml ?? "", "dc:creator")),
        coreLastModifiedBy: sanitizeMeta(elementText(coreXml ?? "", "cp:lastModifiedBy")),
        created: parseIsoDate(elementText(coreXml ?? "", "dcterms:created")),
        modified: parseIsoDate(elementText(coreXml ?? "", "dcterms:modified")),
      },
      signed: names.some((n) => n.startsWith("_xmlsignatures/")),
      activeContent: { variants: [...activeVariants], complete: true, ...activeDetails },
      text: extractDocxText(documentXml),
      images,
    };
  } catch (err) {
    if (err instanceof DocumentInspectError) throw err;
    if (err instanceof ZipError) throw new DocumentInspectError("unreadable", err.message);
    throw new DocumentInspectError("unreadable", err?.message);
  }
}
