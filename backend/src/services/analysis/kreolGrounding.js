// Lightweight, in-memory retrieval grounding for Kreol/French/English
// code-switched messages. Reads the (read-only, teammate-owned)
// data/kreol-dataset/*.jsonl files once at module load and does simple
// token-overlap scoring against the incoming message - no embeddings, no
// vector DB, per data/kreol-dataset/CLAUDE.md section 23 ("Do Not
// Over-Engineer") and section 12 ("Retrieval-Assisted Translation").
//
// Ownership: data/kreol-dataset/ belongs to the Kreol-language owner and is
// read-only from here - this module never writes to it and never changes a
// row's review status (data/kreol-dataset/CLAUDE.md section 7, "Never
// Fabricate Review").
//
// Trust tiers (data/kreol-dataset/CLAUDE.md section 6 + 12): by default only
// "owner_reviewed" and "ported_reviewed" rows are eligible for retrieval.
// "rejected" rows are never eligible. "draft_generated" rows are only
// eligible when a caller explicitly passes { includeDraft: true }.
//
// Every export here is defensive: malformed/missing dataset files, an empty
// corpus, or no relevant matches all resolve to an empty/undefined result
// rather than throwing - this must never turn into a hard dependency for
// POST /api/analyze (root CLAUDE.md "Judging Priorities": reliability of the
// core analyze path outranks this enrichment).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATASET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../data/kreol-dataset");

const REVIEWED_STATUSES = new Set(["owner_reviewed", "ported_reviewed"]);
const DRAFT_STATUS = "draft_generated";

const MAX_EXAMPLES = 3;
const MAX_TERMS = 5;

// Purely to stop very common filler words (in English/French/Kreol) from
// dominating the token-overlap score - not a linguistic tool.
const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "is", "are", "your", "you", "this", "that", "will",
  "ou", "la", "le", "les", "un", "une", "de", "des", "et", "pou", "pa", "ki", "sa", "ena", "dan", "lor", "av", "avek",
  "kot", "ar", "enn", "inn", "pe",
]);

function tokenize(text) {
  if (!text) return [];
  const matches = String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return matches.filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function loadJsonl(filename) {
  try {
    const raw = readFileSync(path.join(DATASET_DIR, filename), "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    // Missing/unreadable dataset file - degrade to no grounding data.
    return [];
  }
}

// Loaded once, synchronously, at module init - these files are small (tens
// of rows) so this is fast and avoids re-parsing on every /api/analyze call.
const RAW_CORPUS = loadJsonl("scam-corpus.jsonl");
const RAW_TM = loadJsonl("translation-memory.jsonl");

function buildPools(rows) {
  const reviewed = rows.filter((row) => REVIEWED_STATUSES.has(row.status));
  // "rejected" is never eligible, with or without includeDraft - only
  // reviewed + draft_generated rows are ever addable via includeDraft.
  const reviewedPlusDraft = rows.filter((row) => REVIEWED_STATUSES.has(row.status) || row.status === DRAFT_STATUS);
  return { reviewed, reviewedPlusDraft };
}

const CORPUS_POOLS = buildPools(RAW_CORPUS);
const TM_POOLS = buildPools(RAW_TM);

function withTokens(rows, tokensFor) {
  return rows.map((row) => ({ row, tokens: tokensFor(row) }));
}

function corpusTokens(row) {
  return new Set(tokenize(row.original_message));
}

function tmTokens(row) {
  return new Set([...tokenize(row.english), ...tokenize(row.kreol_morisien)]);
}

const CORPUS_INDEX = {
  reviewed: withTokens(CORPUS_POOLS.reviewed, corpusTokens),
  reviewedPlusDraft: withTokens(CORPUS_POOLS.reviewedPlusDraft, corpusTokens),
};
const TM_INDEX = {
  reviewed: withTokens(TM_POOLS.reviewed, tmTokens),
  reviewedPlusDraft: withTokens(TM_POOLS.reviewedPlusDraft, tmTokens),
};

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function topExamples(messageTokens, indexed, limit) {
  return indexed
    .map(({ row, tokens }) => ({ row, score: jaccard(messageTokens, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => row);
}

function topTerms(messageTokens, indexed, limit) {
  return indexed
    .map(({ row, tokens }) => {
      let overlap = 0;
      for (const t of tokens) if (messageTokens.has(t)) overlap++;
      return { row, overlap };
    })
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map(({ row }) => row);
}

function formatPromptBlock(examples, terms) {
  const parts = [
    "Kreol/French/English reference material (SYNTHETIC, reviewed dataset " +
      "examples for grounding only - NOT evidence about the current message, " +
      "and must never be presented to the user as if it were a real report). " +
      "Use it only to recognise natural code-switching patterns and to help " +
      "preserve entities (URLs, OTPs, amounts, phone numbers, organisation " +
      "names) exactly as written in the user's message, never translate or " +
      "normalise them away.",
  ];

  if (examples.length > 0) {
    parts.push("Reviewed example scam messages:");
    for (const ex of examples) {
      const signals = Array.isArray(ex.risk_signals) ? ex.risk_signals.join(", ") : "";
      parts.push(
        `- "${ex.original_message}" -> meaning: ${ex.english_meaning}` + (signals ? ` [signals: ${signals}]` : "")
      );
    }
  }

  if (terms.length > 0) {
    parts.push("Relevant reviewed terminology (English <-> Kreol Morisien):");
    for (const t of terms) {
      parts.push(`- "${t.english}" <-> "${t.kreol_morisien}"`);
    }
  }

  return parts.join("\n");
}

const EMPTY_RESULT = { examples: [], terms: [], promptBlock: undefined };

// Given an incoming message, retrieves a small number of relevant reviewed
// scam-corpus examples plus matching translation-memory terminology, for use
// as prompt grounding. Never throws - any failure resolves to EMPTY_RESULT
// so callers can splice promptBlock into a prompt unconditionally.
//
// opts.includeDraft: when true, also considers draft_generated rows (never
// rejected rows, which are excluded unconditionally). Default false -
// callers must opt in explicitly per data/kreol-dataset/CLAUDE.md section 12.
export function getKreolGrounding(message, opts = {}) {
  try {
    if (!message || typeof message !== "string") return EMPTY_RESULT;
    const messageTokens = new Set(tokenize(message));
    if (messageTokens.size === 0) return EMPTY_RESULT;

    const includeDraft = opts.includeDraft === true;
    const corpusIndex = includeDraft ? CORPUS_INDEX.reviewedPlusDraft : CORPUS_INDEX.reviewed;
    const tmIndex = includeDraft ? TM_INDEX.reviewedPlusDraft : TM_INDEX.reviewed;

    const examples = topExamples(messageTokens, corpusIndex, MAX_EXAMPLES);
    const terms = topTerms(messageTokens, tmIndex, MAX_TERMS);

    if (examples.length === 0 && terms.length === 0) return EMPTY_RESULT;

    return { examples, terms, promptBlock: formatPromptBlock(examples, terms) };
  } catch {
    return EMPTY_RESULT;
  }
}
