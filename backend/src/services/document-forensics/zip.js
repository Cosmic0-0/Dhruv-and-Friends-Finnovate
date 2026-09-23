// Minimal, bounded ZIP reader for DOCX inspection (runs in the document
// worker). The central directory is read FIRST: entry count and declared
// sizes are checked before a single byte is inflated, and only the named
// parts the inspector asks for are ever inflated - in memory, never to disk.
//
// fflate does the inflating, but through its streaming Inflate fed 4 KB of
// compressed input at a time with a running output cap: fflate's one-shot
// unzipSync grows its buffer past a part's declared size, so a zip bomb that
// lies about its sizes could still balloon. Here it stops at the cap.

import { Inflate } from "fflate";

export const ZIP_LIMITS = Object.freeze({
  maxEntries: 500,
  maxTotalUncompressed: 50 * 1024 * 1024,
  maxPartBytes: 20 * 1024 * 1024,
});
const INPUT_CHUNK = 4096;

export class ZipError extends Error {
  constructor(reason) {
    super(`zip: ${reason}`);
    this.name = "ZipError";
    this.reason = reason;
  }
}

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const utf8 = new TextDecoder();

/**
 * @param {Uint8Array} bytes
 * @returns {Map<string, { name: string, flags: number, method: number, compressedSize: number, size: number, localOffset: number }>}
 */
export function readZipDirectory(bytes, limits = ZIP_LIMITS) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("no central directory");
  const count = u16(bytes, eocd + 10);
  const cdOffset = u32(bytes, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError("zip64 is not supported");
  if (count > limits.maxEntries) throw new ZipError("too many entries");

  const entries = new Map();
  let declaredTotal = 0;
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) throw new ZipError("corrupt central directory");
    const nameLength = u16(bytes, p + 28);
    const entry = {
      name: utf8.decode(bytes.subarray(p + 46, p + 46 + nameLength)),
      flags: u16(bytes, p + 8),
      method: u16(bytes, p + 10),
      compressedSize: u32(bytes, p + 20),
      size: u32(bytes, p + 24),
      localOffset: u32(bytes, p + 42),
    };
    declaredTotal += entry.size;
    if (declaredTotal > limits.maxTotalUncompressed) throw new ZipError("declared uncompressed size too large");
    entries.set(entry.name, entry);
    p += 46 + nameLength + u16(bytes, p + 30) + u16(bytes, p + 32);
  }
  return entries;
}

/** Inflates one entry, refusing to produce more than maxBytes whatever its header claims. */
export function readZipPart(bytes, entry, maxBytes = ZIP_LIMITS.maxPartBytes) {
  if (entry.flags & 1) throw new ZipError("encrypted entry");
  if (entry.size > maxBytes) throw new ZipError("part too large");
  const lh = entry.localOffset;
  if (lh + 30 > bytes.length || u32(bytes, lh) !== 0x04034b50) throw new ZipError("corrupt local header");
  const start = lh + 30 + u16(bytes, lh + 26) + u16(bytes, lh + 28);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (start + entry.compressedSize > bytes.length) throw new ZipError("truncated entry");

  if (entry.method === 0) {
    if (data.length > maxBytes) throw new ZipError("part too large");
    return data.slice();
  }
  if (entry.method !== 8) throw new ZipError("unsupported compression method");

  const chunks = [];
  let total = 0;
  const inflate = new Inflate((chunk) => {
    total += chunk.length;
    if (total > maxBytes) throw new ZipError("part too large");
    chunks.push(chunk.slice());
  });
  if (data.length === 0) inflate.push(new Uint8Array(0), true);
  for (let i = 0; i < data.length; i += INPUT_CHUNK) {
    inflate.push(data.subarray(i, i + INPUT_CHUNK), i + INPUT_CHUNK >= data.length);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
