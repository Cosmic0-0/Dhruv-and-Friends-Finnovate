import { mkdir, readFile, writeFile } from "node:fs/promises";

const baseUrl = String(process.env.ADDIN_BASE_URL || "").trim().replace(/\/$/, "");
if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(baseUrl)) {
  throw new Error("ADDIN_BASE_URL must be an HTTPS origin, for example https://fraudlens-addin.example.com");
}

const source = await readFile(new URL("../manifest.xml", import.meta.url), "utf8");
const rendered = source.replaceAll("https://localhost:3001", baseUrl);
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/manifest.xml", import.meta.url), rendered, "utf8");
console.log(`Rendered dist/manifest.xml for ${baseUrl}`);
