// Serves the extension test pages at http://localhost:5500 (the extension
// can't scan file:// pages by default). Run: node serve.mjs
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const dir = import.meta.dirname;
http
  .createServer(async (req, res) => {
    const name = req.url === "/" ? "index.html" : req.url.slice(1).split("?")[0];
    try {
      const body = await readFile(join(dir, name.replace(/\.\./g, "")));
      res.writeHead(200, { "Content-Type": extname(name) === ".html" ? "text/html; charset=utf-8" : "text/plain" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(5500, () => console.log("Test pages on http://localhost:5500"));
