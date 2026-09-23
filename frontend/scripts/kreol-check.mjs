/**
 * Fail if the app's Kreol uses a word that no real Kreol Morisien source has.
 *
 * Kreol is the hardest copy in this app to review by eye: a French- or
 * English-shaped guess looks plausible to anyone who does not speak it, and
 * that is exactly how "eskrokri", "pelman" and "siny" got into the app in the
 * first place — none of them are words. This check is the safety net.
 *
 * `kreol-lexicon.txt` is every word attested in:
 *   - KreolMorisienMT (Dabre & Sukhoo, Findings of AACL-IJCNLP 2022),
 *     38,549 Kreol Morisien sentences: https://aclanthology.org/2022.findings-aacl.3/
 *   - data/kreol-dataset/translation-memory.csv and scam-corpus.csv, the
 *     project's own Kreol, reviewed by the Kreol owner.
 *
 * Run: npm run kreol:check
 *
 * A new word is not automatically wrong — it may be a term the sources never
 * needed. Add it to ALLOWED below with a reason, or ask the Kreol owner.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Words that are correct despite being absent from the sources. Brand and
 * product names, file formats, and the handful of English terms Mauritians
 * use untranslated. Anything added here should be one of those, not a Kreol
 * word someone could not find.
 */
const ALLOWED = new Set([
  // The product, and the team.
  "fraudlens", "fraudlensbot", "dhruv", "friends", "logo",
  // Real Mauritian banks, telecoms and services named in the scam examples.
  "mcb", "sbm", "absa", "bank", "one", "juice", "my", "t", "emtel", "telekom",
  // Fictional names from the Kreol owner's scam corpus.
  "oceanbank",
  // Domains invented for the example scam messages.
  "mcb-secure", "myt-prize", "win", "top",
  // Channels and platforms, used untranslated in Mauritius.
  "sms", "email", "whatsapp", "telegram", "app", "iphone", "safari", "android",
  "cloud", "server", "ai", "pdf", "docx", "word", "ocr", "javascript",
  // File formats and units.
  "png", "jpeg", "webp", "mo", "kb", "mb", "min", "rs",
  // Wording quoted verbatim, because that is the label on the button the
  // reader has to find: iOS share sheet, and Word's macro warning bar.
  "add", "to", "home", "screen", "enable", "content",
  // Ordinary Kreol the sources happen not to contain. KreolMorisienMT is
  // folklore and news, so it has bonzour but no evening greeting, though it
  // does have swar and aswar. Flagged for the Kreol owner, not a guess.
  "bonswar",
]);

const lexicon = new Set(
  readFileSync(join(here, "kreol-lexicon.txt"), "utf8").split("\n").map((w) => w.trim()).filter(Boolean),
);

const source = readFileSync(join(here, "..", "lib", "i18n.ts"), "utf8");
const start = source.indexOf("\n  kreol: {");
if (start === -1) {
  console.error("kreol:check — could not find the kreol block in lib/i18n.ts");
  process.exit(1);
}
const kreol = source.slice(start);

// Double-quoted string literals, minus the quoted ones used as object keys
// (the document findings are keyed "DOC-07:macro" and friends). A literal
// followed by a colon is a key, not copy that reaches a screen.
const literals = [...kreol.matchAll(/"((?:[^"\\]|\\.)*)"(\s*:)?/g)]
  .filter((m) => !m[2])
  .map((m) => m[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));

const unknown = new Map();
for (const literal of literals) {
  // Interpolation placeholders are code, not copy: {provider}, ${n}.
  const copy = literal.replace(/\$?\{[^}]*\}/g, " ");
  for (const raw of copy.match(/[A-Za-zÀ-ÿ'’-]+/g) ?? []) {
    const word = raw.replace(/^[-'’]+|[-'’]+$/g, "").toLowerCase();
    if (!word || lexicon.has(word) || ALLOWED.has(word)) continue;
    // A hyphenated compound is fine if both halves are attested.
    if (word.includes("-") && word.split("-").every((p) => !p || lexicon.has(p) || ALLOWED.has(p))) continue;
    unknown.set(word, (unknown.get(word) ?? 0) + 1);
  }
}

// English that arrives by reference rather than inline. TODO_KREOL(X) renders
// the English X, so a Kreol user sees English — but there is no English string
// in the kreol block to find, which is how the whole document forensics screen
// stayed English through an earlier sweep that only grepped for literals.
const todo = [...kreol.matchAll(/TODO_KREOL\(([^)]*)/g)].map((m) => m[1].trim().slice(0, 48));

if (unknown.size === 0 && todo.length === 0) {
  console.log(`kreol:check — ${literals.length} strings, every word attested in a real Kreol source.`);
  process.exit(0);
}

if (todo.length) {
  console.error(`kreol:check — ${todo.length} string(s) still render English to a Kreol user:\n`);
  for (const what of todo) console.error(`  TODO_KREOL(${what})`);
  console.error("");
}

if (unknown.size) {
  console.error(`kreol:check — ${unknown.size} word(s) in the Kreol copy are in no Kreol source:\n`);
  for (const [word, count] of [...unknown].sort((a, b) => b[1] - a[1])) {
    console.error(`  ${word.padEnd(24)} used ${count}x`);
  }
  console.error(
    "\nEach one is either a misspelling, a French or English word that slipped in,\n" +
      "or a name that belongs in ALLOWED in this script. Check it against\n" +
      "data/kreol-dataset/translation-memory.csv before adding it.",
  );
}
process.exit(1);
