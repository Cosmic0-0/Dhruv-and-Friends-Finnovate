// Pure geometry / pixel helpers for document forensics: where an image lands
// on a page, how many pixels per inch it was drawn at, and what its alpha
// channel looks like. No I/O - unit-tested in overlay.test.js.
//
// Matrices use the PDF convention [a, b, c, d, e, f]:
//   x' = a*x + c*y + e,  y' = b*x + d*y + f
// An image XObject is drawn into the unit square, so the current
// transformation matrix (CTM) at the paint operator IS its placement.

/** A raster image covering at least this share of the page is a full-page image (a "scan"). */
export const FULL_PAGE_COVERAGE = 0.85;
/** An overlay drawn below this share of the scan's DPI has been upscaled beyond the scan. */
export const LOW_RES_RATIO = 0.5;
/** Overlays smaller than this share of the page area (dust, spacer pixels) are ignored. */
export const OVERLAY_MIN_AREA = 0.001;
/** ...and so are images narrower or shorter than this many pixels. */
export const OVERLAY_MIN_PIXELS = 8;
/** A page with a full-page image AND more visible text than this is a designed page, not a scan. */
export const SCAN_MAX_VISIBLE_CHARS = 400;
/** An image "has transparency" when at least this share of its pixels is not fully opaque. */
export const MIN_TRANSPARENT_SHARE = 0.01;

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/** m applied first, then ctm (PDF `cm` semantics: CTM' = m x CTM). */
export function compose(ctm, m) {
  return [
    ctm[0] * m[0] + ctm[2] * m[1],
    ctm[1] * m[0] + ctm[3] * m[1],
    ctm[0] * m[2] + ctm[2] * m[3],
    ctm[1] * m[2] + ctm[3] * m[3],
    ctm[0] * m[4] + ctm[2] * m[5] + ctm[4],
    ctm[1] * m[4] + ctm[3] * m[5] + ctm[5],
  ];
}

export function applyPoint(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Where an image drawn with this CTM lands: its axis-aligned bounding box
 * and its placed width/height in points (rotation-safe).
 */
export function placementFromCtm(ctm) {
  const corners = [applyPoint(ctm, 0, 0), applyPoint(ctm, 1, 0), applyPoint(ctm, 0, 1), applyPoint(ctm, 1, 1)];
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return {
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    widthPt: Math.hypot(ctm[0], ctm[1]),
    heightPt: Math.hypot(ctm[2], ctm[3]),
  };
}

/**
 * Pixels per inch the image was drawn at - the lower of the two axes, since
 * upscaling along either one pixelates it. Null when the placement is
 * degenerate (zero size).
 */
export function effectiveDpi(widthPx, heightPx, widthPt, heightPt) {
  if (!(widthPt > 0) || !(heightPt > 0) || !(widthPx > 0) || !(heightPx > 0)) return null;
  return Math.min(widthPx / (widthPt / 72), heightPx / (heightPt / 72));
}

function area(b) {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

export function intersection(a, b) {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}

/** Share of the page view box ([x1, y1, x2, y2]) that the bbox covers, 0..1. */
export function coverage(bbox, view) {
  const pageArea = area(view);
  return pageArea > 0 ? area(intersection(bbox, view)) / pageArea : 0;
}

export function intersects(a, b) {
  return area(intersection(a, b)) > 0;
}

/**
 * Alpha-channel facts for an RGBA buffer.
 *
 * hardEdgeRatio compares two kinds of edge pixel:
 *   hard = fully opaque pixels with a fully transparent 4-neighbour
 *   soft = partially transparent (anti-aliased) pixels
 * A cut-out pasted with a hard mask (thresholded or upscaled) is ~1; a
 * smoothly anti-aliased image is near 0. Null when the image has no edges.
 *
 * @param {Uint8Array|Uint8ClampedArray} rgba
 */
export function alphaStats(rgba, width, height) {
  const n = width * height;
  if (!(n > 0) || rgba.length < n * 4) return { transparentShare: 0, hardEdgeRatio: null };
  let transparent = 0;
  let soft = 0;
  let hard = 0;
  const alpha = (x, y) => rgba[(y * width + x) * 4 + 3];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = alpha(x, y);
      if (a < 255) transparent++;
      if (a > 0 && a < 255) soft++;
      else if (a === 255) {
        if ((x > 0 && alpha(x - 1, y) === 0) || (x < width - 1 && alpha(x + 1, y) === 0) ||
            (y > 0 && alpha(x, y - 1) === 0) || (y < height - 1 && alpha(x, y + 1) === 0)) hard++;
      }
    }
  }
  return { transparentShare: transparent / n, hardEdgeRatio: hard + soft > 0 ? hard / (hard + soft) : null };
}

/**
 * 8-bit greyscale copy of a decoded image in pdf.js's ImageKind layouts:
 * 1 = 1 bit per pixel (rows padded to whole bytes, 1 = white), 2 = RGB, 3 = RGBA.
 */
export function toGray(data, kind, width, height) {
  const out = new Uint8Array(width * height);
  if (kind === 1) {
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        out[y * width + x] = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
      }
    }
    return out;
  }
  const step = kind === 3 ? 4 : 3;
  for (let i = 0, p = 0; i < out.length; i++, p += step) {
    out[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
  }
  return out;
}
