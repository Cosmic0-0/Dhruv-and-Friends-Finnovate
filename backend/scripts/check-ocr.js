import { readFile } from "node:fs/promises";
import { extractTextFromImage } from "../src/services/ocr/index.js";

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: npm run test:ocr -- <path-to-image>");
  process.exit(1);
}

const buffer = await readFile(imagePath);
console.time("extractTextFromImage");
const text = await extractTextFromImage(buffer);
console.timeEnd("extractTextFromImage");
console.log("--- extracted text ---");
console.log(text);
