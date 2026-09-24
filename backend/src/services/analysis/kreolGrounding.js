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
import { normalizeKreol } from "../kreol/normalizer.js";

const DATASET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../data/kreol-dataset");

const REVIEWED_STATUSES = new Set(["owner_reviewed", "ported_reviewed"]);
const DRAFT_STATUS = "draft_generated";

const MAX_EXAMPLES = 3;
const MAX_TERMS = 5;

// Token weights. Nothing is thrown away: a word is either content (weight 1),
// a function word that says little about topic (0.25), or a negation (2).
// Negations are the most meaning-bearing tokens in this domain - "Partaz ou
// OTP" and "Pa partaz ou OTP" are opposite messages - so "pa", "pann", "zame",
// "zamai" are never treated as filler (an earlier version listed "pa" as a
// stopword). Retrieval also requires at least one content-word overlap, so
// function words alone can never pull a row in.
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "is", "are", "your", "you", "this", "that", "will",
  "ou", "la", "le", "les", "un", "une", "de", "des", "et", "pou", "ki", "sa", "ena", "dan", "lor", "av", "avek",
  "kot", "ar", "enn", "inn", "finn", "pe", "ek", "li", "mo", "to", "nou", "zot",
]);
const NEGATIONS = new Set(["pa", "pann", "zame", "zamai", "pena", "never", "not", "no", "jamais", "pas", "sans", "ne"]);
const NEGATION_WEIGHT = 2;
const FUNCTION_WEIGHT = 0.25;
const UNIGRAM_SHARE = 0.7;
const PHRASE_SHARE = 0.3;
// Trust and domain multipliers apply to ranking only; eligibility is decided by status alone.
const TRUST_MULTIPLIER = { owner_reviewed: 1, ported_reviewed: 0.9, draft_generated: 0.6 };
const DOMAIN_MULTIPLIER = { scam: 1, banking: 1, "mobile-money": 1, general: 0.6, ui: 0.6 };

function weightOf(token) {
  if (NEGATIONS.has(token)) return NEGATION_WEIGHT;
  return FUNCTION_WORDS.has(token) ? FUNCTION_WEIGHT : 1;
}

function isContent(token) {
  return !NEGATIONS.has(token) && !FUNCTION_WORDS.has(token);
}

// Lower-cased tokens of the spelling-normalised text (nu/nou, u/ou, accents
// ...), so a respelled message retrieves the same rows. Normalisation is for
// matching only; the message itself is never rewritten.
function tokenize(text) {
  if (!text) return [];
  const normalised = normalizeKreol(String(text)).normalizedText;
  return (normalised.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) || []).filter(
    (t) => t.length > 1
  );
}

function bigrams(tokens) {
  const out = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    if (isContent(tokens[i]) || isContent(tokens[i + 1]) || NEGATIONS.has(tokens[i])) out.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
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

function withTokens(rows, textsFor) {
  return rows.map((row) => {
    const tokens = tokenize(textsFor(row));
    return { row, tokens: new Set(tokens), bigrams: bigrams(tokens) };
  });
}

const corpusText = (row) => row.original_message;
const tmText = (row) => `${row.english} ${row.kreol_morisien}`;

const CORPUS_INDEX = {
  reviewed: withTokens(CORPUS_POOLS.reviewed, corpusText),
  reviewedPlusDraft: withTokens(CORPUS_POOLS.reviewedPlusDraft, corpusText),
};
const TM_INDEX = {
  reviewed: withTokens(TM_POOLS.reviewed, tmText),
  reviewedPlusDraft: withTokens(TM_POOLS.reviewedPlusDraft, tmText),
};

function weightedJaccard(a, b) {
  let inter = 0;
  let union = 0;
  for (const t of a) {
    const w = weightOf(t);
    union += w;
    if (b.has(t)) inter += w;
  }
  for (const t of b) if (!a.has(t)) union += weightOf(t);
  return union === 0 ? 0 : inter / union;
}

function setJaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function contentOverlap(a, b) {
  let n = 0;
  for (const t of a) if (isContent(t) && b.has(t)) n++;
  return n;
}

// Weighted unigram overlap + phrase overlap, scaled by trust and domain.
function similarity(message, entry) {
  const shared = contentOverlap(message.tokens, entry.tokens);
  if (shared === 0) return 0;
  const base = UNIGRAM_SHARE * weightedJaccard(message.tokens, entry.tokens) + PHRASE_SHARE * setJaccard(message.bigrams, entry.bigrams);
  const trust = TRUST_MULTIPLIER[entry.row.status] ?? 0.5;
  const domain = entry.row.domain ? DOMAIN_MULTIPLIER[entry.row.domain] ?? 0.8 : 1;
  return base * trust * domain;
}

function rank(message, indexed, limit, minShared) {
  return indexed
    .map((entry) => ({ row: entry.row, score: similarity(message, entry), shared: contentOverlap(message.tokens, entry.tokens) }))
    .filter(({ score, shared }) => score > 0 && shared >= minShared)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ row }) => row);
}

// External general-purpose sentence pairs (MorisienMT, Bible/news text). Not reviewed and not
// scam-domain: loaded lazily, only when a caller asks for them, ranked strictly after reviewed
// FraudLens data, and never used by the fraud-analysis prompt.
const EXTERNAL_MIN_SHARED = 3;
let externalIndex;
function loadExternalIndex() {
  if (externalIndex) return externalIndex;
  const rows = loadJsonl("../kreol-derived/morisienmt-clean.jsonl").filter(
    (r) => r.split === "train" && r.direction === "mfe-en" && r.classification === "natural_sentence"
  );
  externalIndex = withTokens(rows, (r) => r.source);
  return externalIndex;
}

function formatPromptBlock(examples, terms, externalExamples = []) {
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

  if (externalExamples.length > 0) {
    parts.push(
      "General Kreol <-> English sentence pairs from an external corpus (NOT reviewed by FraudLens, not scam-domain; " +
        "wording reference only):"
    );
    for (const ex of externalExamples) parts.push(`- "${ex.source}" <-> "${ex.target}"`);
  }

  return parts.join("\n");
}

const EMPTY_RESULT = { examples: [], terms: [], externalExamples: [], promptBlock: undefined };
const MIN_SHARED_EXAMPLE = 2;
const MIN_SHARED_TERM = 1;

// Given an incoming message, retrieves a small number of relevant reviewed
// scam-corpus examples plus matching translation-memory terminology, for use
// as prompt grounding. Never throws - any failure resolves to EMPTY_RESULT
// so callers can splice promptBlock into a prompt unconditionally.
//
// Priority: reviewed FraudLens rows always come first (owner_reviewed ahead of
// ported_reviewed through the trust multiplier). External sentences are
// considered only when opts.includeExternal is true, and never displace a
// reviewed row.
//
// opts.includeDraft: when true, also considers draft_generated rows (never
// rejected rows, which are excluded unconditionally). Default false -
// callers must opt in explicitly per data/kreol-dataset/CLAUDE.md section 12.
// opts.maxTerms: cap on returned terminology rows (default MAX_TERMS); the
// translation prompt asks for more because a message names many words.
// opts.includeExternal: when true, adds up to MAX_EXTERNAL general MorisienMT
// sentence pairs (translation/generation prompts; not the fraud-analysis prompt).
const MAX_EXTERNAL = 2;
export function getKreolGrounding(message, opts = {}) {
  try {
    if (!message || typeof message !== "string") return EMPTY_RESULT;
    const tokens = tokenize(message);
    if (tokens.length === 0) return EMPTY_RESULT;
    const query = { tokens: new Set(tokens), bigrams: bigrams(tokens) };

    const includeDraft = opts.includeDraft === true;
    const corpusIndex = includeDraft ? CORPUS_INDEX.reviewedPlusDraft : CORPUS_INDEX.reviewed;
    const tmIndex = includeDraft ? TM_INDEX.reviewedPlusDraft : TM_INDEX.reviewed;

    const examples = rank(query, corpusIndex, MAX_EXAMPLES, MIN_SHARED_EXAMPLE);
    const termLimit = Number.isInteger(opts.maxTerms) && opts.maxTerms > 0 ? opts.maxTerms : MAX_TERMS;
    const terms = rank(query, tmIndex, termLimit, MIN_SHARED_TERM);
    const externalExamples = opts.includeExternal === true ? rank(query, loadExternalIndex(), MAX_EXTERNAL, EXTERNAL_MIN_SHARED) : [];

    if (examples.length === 0 && terms.length === 0 && externalExamples.length === 0) return EMPTY_RESULT;

    return { examples, terms, externalExamples, promptBlock: formatPromptBlock(examples, terms, externalExamples) };
  } catch {
    return EMPTY_RESULT;
  }
}
