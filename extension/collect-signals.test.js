// collect-signals.js is a classic script injected by background.js; load it in
// a VM with a tiny fake page and check the code locations it records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SOURCE = readFileSync(fileURLToPath(new URL("./collect-signals.js", import.meta.url)), "utf8");

const PAGE = [
  "<html><head>",
  "<script>",
  "var a = 1;",
  "el.innerHTML = location.hash;",
  "</script>",
  '</head><body><form action="http://evil.example/post" method="post"><input type="password"></form>',
  '<button onclick="go()">Go</button>',
  "</body></html>",
].join("\n");

function load() {
  const inline = { src: "", textContent: "\nvar a = 1;\nel.innerHTML = location.hash;\n", hasAttribute: () => false };
  const form = { outerHTML: '<form action="http://evil.example/post" method="post"><input type="password"></form>', hasAttribute: () => true, action: "http://evil.example/post" };
  const button = { outerHTML: '<button onclick="go()">Go</button>', attributes: [{ name: "onclick" }] };
  const password = { outerHTML: '<input type="password">' };
  const context = {
    document: {
      documentElement: { outerHTML: PAGE },
      forms: [form],
      querySelectorAll: (sel) => (sel === "script" ? [inline] : sel === "*" ? [button] : sel.startsWith("input") ? [password] : []),
    },
    location: { href: "https://bank.example/login", search: "", protocol: "https:", origin: "https://bank.example", host: "bank.example" },
    performance: { getEntriesByType: () => [] },
    fetch: async () => ({ ok: false }),
    URL,
    URLSearchParams,
    Promise,
  };
  vm.createContext(context);
  const completion = new vm.Script(SOURCE, { filename: "collect-signals.js" }).runInContext(context);
  return { context, completion };
}

test("collect-signals: sinks, inline handlers and forms point at the line of page code responsible", async () => {
  const { completion } = load();
  const signals = await completion;
  const innerHTML = signals.domSinks.find((s) => s.sink === "innerHTML");
  assert.deepEqual(JSON.parse(JSON.stringify(innerHTML.locations)), [{ file: "https://bank.example/login", line: 4, code: "el.innerHTML = location.hash;" }]);
  const handler = signals.domSinks.find((s) => s.sink === "inlineEventHandler");
  assert.equal(handler.locations[0].line, 7);
  assert.match(handler.locations[0].code, /onclick="go\(\)"/);
  assert.equal(signals.insecureForms[0].locations[0].line, 6);
});

test("collect-signals: a long minified line is cut around the match, not from its start", () => {
  const { context } = load();
  const minified = `${"x=1;".repeat(200)}el.innerHTML=payload;${"y=2;".repeat(200)}`;
  const { line, code } = context.lineAt(minified, minified.indexOf("el.innerHTML"));
  assert.equal(line, 1);
  assert.ok(code.includes("el.innerHTML=payload;"));
  assert.ok(code.length <= 210);
});
