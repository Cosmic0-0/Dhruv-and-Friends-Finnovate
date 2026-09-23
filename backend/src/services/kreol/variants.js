// Loader for the classified Kreol spelling-variant resource
// (data/kreol-derived/spelling-variants.classified.json, built by
// data/kreol-dataset/scripts/build_variant_resource.py from Kaikki candidates
// plus MorisienMT training-text behaviour).
//
// Safety classes:
//   safe              rewrite anywhere (variant is essentially Kreol-only)
//   ambiguous         rewrite only when the message is Kreol-dominant
//   do_not_normalize  never rewrite
//
// The resource is external candidate evidence, not reviewed data. A missing or
// unreadable file falls back to a tiny built-in table, so normalisation degrades
// gracefully and can never break /api/analyze.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RESOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../data/kreol-derived/spelling-variants.classified.json");

/** @typedef {{ canonical: string, variant: string, kind: string, safety: "safe"|"ambiguous"|"do_not_normalize" }} VariantEntry */

/**
 * Only true spelling variants are used for rewriting ("medial forms" such as
 * gagn/gagne are both valid and are left alone). A variant that maps to two
 * different canonical forms is unsafe to rewrite and is dropped.
 * @param {VariantEntry[]} rows
 * @returns {Map<string, VariantEntry>}
 */
export function buildVariantTable(rows) {
  const byVariant = new Map();
  const conflicted = new Set();
  for (const row of rows) {
    if (row.kind !== "alternative_spelling") continue;
    const seen = byVariant.get(row.variant);
    if (seen && seen.canonical !== row.canonical) conflicted.add(row.variant);
    else byVariant.set(row.variant, row);
  }
  for (const variant of conflicted) byVariant.delete(variant);
  return byVariant;
}

// The derived resource is regenerated from external data that is not redistributed with the
// repository (see data/kreol-derived/README.md), so a fresh clone may not have it. These three
// respellings are attested in Kaikki and in the reviewed FraudLens conventions, and are
// short/ambiguous, so they stay gated on Kreol-dominant messages.
const FALLBACK = [
  { canonical: "nou", variant: "nu", kind: "alternative_spelling", safety: "ambiguous" },
  { canonical: "pou", variant: "pu", kind: "alternative_spelling", safety: "ambiguous" },
  { canonical: "ou", variant: "u", kind: "alternative_spelling", safety: "ambiguous" },
];

let cached;

/** @returns {Map<string, VariantEntry>} */
export function getVariantTable() {
  if (cached) return cached;
  try {
    const doc = JSON.parse(readFileSync(RESOURCE, "utf8"));
    cached = buildVariantTable(Array.isArray(doc.variants) ? doc.variants : []);
  } catch {
    cached = buildVariantTable(FALLBACK);
  }
  return cached;
}
