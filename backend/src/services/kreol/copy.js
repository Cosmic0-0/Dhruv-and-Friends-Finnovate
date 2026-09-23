// Stable, reviewable Kreol product copy for structured FraudLens results:
// signal labels and recommended-action text, keyed by their stable ids
// (SEC-01, dont_share_code, ...). The wording lives in review CSVs under
// data/kreol-derived/copy/ - one row per id, never generated per request.
//
// Trust rule (data/kreol-dataset/CLAUDE.md): Kreol text is only presented as
// reviewed when a human set status = owner_reviewed. This loader therefore
//   - returns the Kreol text for owner_reviewed rows,
//   - returns it for draft_generated rows ONLY when the caller passes
//     { allowDraft: true } (e.g. an internal preview),
//   - otherwise falls back to the English source string, and says so
//     (`source: "english_fallback"`), so a screen can never silently mix
//     unreviewed AI Kreol into the product.
// Nothing here writes a status; AI never marks a row reviewed.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COPY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../data/kreol-derived/copy");
const FILES = { signal: "candidate-signal-translations.csv", action: "candidate-action-translations.csv" };
const SERVABLE = new Set(["owner_reviewed", "ported_reviewed"]);

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const cache = {};

function table(kind) {
  if (cache[kind]) return cache[kind];
  try {
    const rows = parseCsv(readFileSync(path.join(COPY_DIR, FILES[kind]), "utf8"));
    cache[kind] = new Map(rows.map((r) => [r.id, r]));
  } catch {
    cache[kind] = new Map();
  }
  return cache[kind];
}

/**
 * @param {"signal"|"action"} kind
 * @param {string} id stable id (signal code or action id)
 * @param {{ allowDraft?: boolean }} [options]
 * @returns {{ text: string|null, status: string, source: "kreol_reviewed"|"kreol_draft"|"english_fallback" }}
 */
export function getKreolCopy(kind, id, { allowDraft = false } = {}) {
  const row = FILES[kind] ? table(kind).get(id) : undefined;
  if (!row) return { text: null, status: "missing", source: "english_fallback" };
  const proposed = row.proposed_kreol?.trim();
  if (proposed && SERVABLE.has(row.status)) return { text: proposed, status: row.status, source: "kreol_reviewed" };
  if (proposed && row.status === "draft_generated" && allowDraft) return { text: proposed, status: row.status, source: "kreol_draft" };
  return { text: row.english || null, status: row.status || "missing", source: "english_fallback" };
}
