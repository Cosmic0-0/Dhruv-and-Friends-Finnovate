import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { extractDocxText, inspectDocx, pngCanHaveAlpha } from "./docx.js";
import { inspectDocument } from "./inspect.js";
import { CFB_MAGIC } from "./sniff.js";
import { readZipDirectory, readZipPart, ZIP_LIMITS } from "./zip.js";
import * as B from "./fixture-builders.js";

test("clean DOCX: text, tool and dates - never the author's name", () => {
  const facts = inspectDocx(new Uint8Array(B.buildCleanDocx()));
  assert.equal(facts.fileType, "docx");
  assert.equal(facts.pageCount, 1);
  assert.equal(facts.metadata.application, "Microsoft Office Word");
  assert.equal(facts.metadata.created, Date.parse("2026-09-01T09:30:00Z"));
  assert.match(facts.text, /^SAMPLE - FICTIONAL TEST DOCUMENT\nNorthbridge Savings Bank/);
  assert.deepEqual(facts.activeContent.variants, []);
  assert.deepEqual(facts.images, []);
});

test("macro and remote-template DOCX files are recognised without running or fetching anything", () => {
  assert.deepEqual(inspectDocx(new Uint8Array(B.buildMacroDocx())).activeContent.variants, ["macro"]);
  const tpl = inspectDocx(new Uint8Array(B.buildExternalTemplateDocx())).activeContent;
  assert.deepEqual(tpl.variants, ["external_template"]);
  assert.equal(tpl.templateHost, "templates.example.invalid");
});

test("floating transparent PNGs are collected with their placed size", async () => {
  const png = await B.renderPastedSignature();
  const facts = inspectDocx(new Uint8Array(B.buildDocx({ anchoredPng: png })));
  assert.equal(facts.images.length, 1);
  assert.equal(facts.images[0].cx, 1828800);
  assert.ok(pngCanHaveAlpha(new Uint8Array(facts.images[0].data)));
});

test("a ZIP that is not a Word document is unsupported; a broken one unreadable", () => {
  const xlsxLike = zipSync({ "[Content_Types].xml": strToU8('<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>') });
  assert.throws(() => inspectDocx(xlsxLike), { code: "unsupported" });
  assert.throws(() => inspectDocx(zipSync({ "hello.txt": strToU8("hi") })), { code: "unsupported" });
  assert.throws(() => inspectDocx(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])), { code: "unreadable" });
});

test("password-protected Office files (compound files) are reported as encrypted", async () => {
  const cfb = new Uint8Array([...CFB_MAGIC, ...Buffer.from("....EncryptedPackage....", "utf16le")]);
  await assert.rejects(inspectDocument(cfb), { code: "encrypted" });
  await assert.rejects(inspectDocument(new Uint8Array([...CFB_MAGIC, 0, 0, 0])), { code: "unsupported" });
  await assert.rejects(inspectDocument(new Uint8Array(Buffer.from("just text"))), { code: "unsupported" });
});

test("extractDocxText keeps paragraphs and tabs, ignores tab-stop definitions", () => {
  const xml = '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>A</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">B &amp; C</w:t></w:r></w:p><w:p><w:r><w:t>D</w:t><w:br/><w:t>E</w:t></w:r></w:p>';
  assert.equal(extractDocxText(xml), "A\tB & C\nD\nE");
});

// ---------- ZIP bomb guards ----------

function patchDeclaredSize(zip, name, size) {
  const out = new Uint8Array(zip);
  const view = new DataView(out.buffer);
  for (let p = 0; p < out.length - 46; p++) {
    if (view.getUint32(p, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(p + 28, true);
    if (Buffer.from(out.subarray(p + 46, p + 46 + nameLength)).toString() === name) view.setUint32(p + 24, size, true);
  }
  return out;
}

test("zip: entry count and declared size are checked before anything is inflated", () => {
  const many = Object.fromEntries(Array.from({ length: ZIP_LIMITS.maxEntries + 1 }, (_, i) => [`f${i}.txt`, new Uint8Array(1)]));
  assert.throws(() => readZipDirectory(zipSync(many)), { reason: "too many entries" });
  const big = zipSync({ "a.bin": new Uint8Array(1024) });
  assert.throws(() => readZipDirectory(patchDeclaredSize(big, "a.bin", ZIP_LIMITS.maxTotalUncompressed + 1)), { reason: "declared uncompressed size too large" });
});

test("zip: a part that lies about its size stops inflating at the cap", () => {
  // 8 MB of zeros compresses to a few KB; the header claims 100 bytes.
  const bomb = patchDeclaredSize(zipSync({ "word/document.xml": new Uint8Array(8 * 1024 * 1024) }), "word/document.xml", 100);
  const entry = readZipDirectory(bomb).get("word/document.xml");
  assert.equal(entry.size, 100);
  assert.throws(() => readZipPart(bomb, entry, 1024 * 1024), { reason: "part too large" });
  // Within the cap it inflates normally.
  const ok = zipSync({ "a.txt": strToU8("hello") });
  assert.equal(Buffer.from(readZipPart(ok, readZipDirectory(ok).get("a.txt"))).toString(), "hello");
});
