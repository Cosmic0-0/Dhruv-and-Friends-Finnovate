// Permission / CSP hardening guard for the extension. Each assertion is a
// rule a future edit could quietly break (a broad host permission, an
// auto-injected content script, remote code, an inline script the CSP would
// block at runtime), so it fails here in CI instead of in a user's browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { API_BASE_URL } from "./config.js";

const dir = new URL("./", import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), "utf8");
const manifest = JSON.parse(read("manifest.json"));

// Every permission here is justified in README.md "Permissions".
const ALLOWED_PERMISSIONS = ["tabs", "contextMenus", "storage", "activeTab", "scripting"];

test("manifest is MV3 and requests only the documented permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), [...ALLOWED_PERMISSIONS].sort());
  assert.equal(manifest.optional_permissions, undefined);
});

test("host permissions cover the configured backend and nothing broader", () => {
  const backend = `${new URL(API_BASE_URL).origin}/*`;
  assert.ok(manifest.host_permissions.includes(backend), `host_permissions must include ${backend} (config.js API_BASE_URL)`);
  for (const pattern of manifest.host_permissions) {
    assert.doesNotMatch(pattern, /<all_urls>|^\*:|^https?:\/\/\*\//, `overly broad host permission: ${pattern}`);
  }
});

test("nothing is injected automatically and nothing is exposed to web pages", () => {
  assert.equal(manifest.content_scripts, undefined, "content scripts must only be injected on an explicit user action");
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.externally_connectable, undefined);
});

test("extension-page CSP allows only bundled scripts", () => {
  const csp = manifest.content_security_policy?.extension_pages ?? "";
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval|unsafe-inline|https?:/);
});

const htmlFiles = readdirSync(dir).filter((f) => f.endsWith(".html"));

test("every extension page loads only local scripts, with no inline script blocks the CSP would block", () => {
  for (const file of htmlFiles) {
    const html = read(file);
    for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
      const src = /src="([^"]+)"/.exec(tag)?.[1];
      assert.ok(src, `${file}: inline <script> is blocked by the extension CSP`);
      assert.doesNotMatch(src, /^(?:https?:)?\/\//, `${file}: remote script ${src}`);
      assert.ok(existsSync(new URL(src, dir)), `${file}: missing script ${src}`);
    }
    assert.doesNotMatch(html, /\son[a-z]+="/i, `${file}: inline event handler attributes are blocked by the CSP`);
  }
});

test("every file injected with chrome.scripting.executeScript exists", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"))) {
    for (const [, list] of read(file).matchAll(/files:\s*\[([^\]]+)\]/g)) {
      for (const [, injected] of list.matchAll(/"([^"]+)"/g)) {
        assert.ok(existsSync(new URL(injected, dir)), `${file} injects missing file ${injected}`);
      }
    }
  }
});

test("injected page scripts survive being injected twice into the same page (no top-level const/let/class)", async () => {
  const vm = await import("node:vm");
  for (const file of ["content.js", "collect-signals.js"]) {
    const src = read(file);
    assert.doesNotMatch(src, /^(?:const|let|class)\s/m, `${file}: top-level const/let/class breaks re-injection`);
    const ctx = vm.createContext({
      document: { querySelectorAll: () => [], body: null, getElementById: () => null, documentElement: {} },
      location: { href: "https://x.example/", search: "", protocol: "https:", host: "x.example", origin: "https://x.example" },
      performance: { getEntriesByType: () => [] },
      fetch: async () => ({ ok: false }),
      URL, URLSearchParams, setTimeout, Date, Promise,
      chrome: { runtime: { onMessage: { addListener() {} } } },
    });
    ctx.window = ctx;
    for (const run of [1, 2]) {
      const value = new vm.Script(src, { filename: file }).runInContext(ctx);
      assert.ok(value && typeof value.then === "function", `${file} injection ${run} must complete with a Promise`);
      assert.ok(await value, `${file} injection ${run} must resolve to a result`);
    }
  }
});
