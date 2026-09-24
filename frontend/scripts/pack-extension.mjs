/**
 * Zip the Link Guard extension (../extension) into public/ so the install
 * page can offer it as a download, instead of GitHub's archive of the whole
 * repository.
 *
 * Runs before `next dev` and `next build` (predev/prebuild). The zip is build
 * output and is not committed. Only what Chrome loads goes in: tests, the
 * package manifest and dev scripts stay out.
 *
 * Files sit at the zip root, so "Extract All" on Windows and Archive Utility
 * on macOS both produce one fraudlens-link-guard folder with manifest.json
 * directly inside, which is the folder "Load unpacked" wants.
 */
import { deflateRawSync, crc32 } from "node:zlib";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const EXTENSION_DIR = join(import.meta.dirname, "..", "..", "extension");
const OUT = join(import.meta.dirname, "..", "public", "fraudlens-link-guard.zip");
const SKIP_DIRS = new Set(["node_modules", "scripts"]);
const SKIP_FILES = new Set(["package.json", "package-lock.json"]);

if (!existsSync(join(EXTENSION_DIR, "manifest.json"))) {
  throw new Error(`pack-extension: no manifest.json in ${EXTENSION_DIR}`);
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : listFiles(full);
      if (SKIP_FILES.has(e.name) || e.name.endsWith(".test.js")) return [];
      return [full];
    });
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

const locals = [];
const centrals = [];
let offset = 0;

for (const file of listFiles(EXTENSION_DIR).sort()) {
  const name = Buffer.from(relative(EXTENSION_DIR, file).split(sep).join("/"));
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const { time, day } = dosDateTime(statSync(file).mtime);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + packed.length;
}

const directory = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length / 2, 8);
end.writeUInt16LE(centrals.length / 2, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);

writeFileSync(OUT, Buffer.concat([...locals, directory, end]));
console.log(`pack-extension: ${centrals.length / 2} files -> ${relative(process.cwd(), OUT)}`);
