// Metadata value helpers shared by the PDF and DOCX inspectors.

const META_MAX = 200;

/** Control characters out, whitespace collapsed, length capped. Null for empty/non-strings. */
export function sanitizeMeta(value, max = META_MAX) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

/** "D:20260901103000+04'00'" (PDF date) -> epoch ms, or null. */
export function parsePdfDate(value) {
  if (typeof value !== "string") return null;
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?\s*([Zz+-])?(\d{2})?'?(\d{2})?'?/.exec(value.trim());
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00", tz, th = "00", tm = "00"] = m;
  let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (tz === "+" || tz === "-") ms -= (tz === "+" ? 1 : -1) * ((+th * 60 + +tm) * 60_000);
  return Number.isFinite(ms) ? ms : null;
}

/** ISO 8601 (XMP) -> epoch ms, or null. */
export function parseIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}/.test(value.trim())) return null;
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? ms : null;
}
