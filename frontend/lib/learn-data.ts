/**
 * Server-only loader for the Learn tab. Reads the Kreol language owner's
 * corpus in place (it is not copied into frontend/). Called from the
 * /learn server component, so it runs at build time and the result is
 * baked into the static page: no runtime file access, no backend call.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { toQuizItems, trendCards, type CorpusRow, type QuizItem, type TrendCard } from "./learn-content";

const CORPUS_PATH = path.resolve(process.cwd(), "..", "data", "kreol-dataset", "scam-corpus.jsonl");

export interface LearnContent {
  items: QuizItem[];
  trends: TrendCard[];
}

export function loadLearnContent(): LearnContent {
  let raw: string;
  try {
    raw = readFileSync(CORPUS_PATH, "utf8");
  } catch (err) {
    // Fail the build loudly rather than ship an empty or made-up quiz.
    throw new Error(
      `Learn tab: couldn't read the scam corpus at ${CORPUS_PATH}. It's owned by the Kreol language owner ` +
        `(data/kreol-dataset/). Make sure it's present in the checkout.\n${String(err)}`,
    );
  }
  const rows: CorpusRow[] = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    try {
      rows.push(JSON.parse(line) as CorpusRow);
    } catch {
      console.warn(`[learn] skipping unparseable line ${i + 1} in scam-corpus.jsonl`);
    }
  });
  const items = toQuizItems(rows);
  return { items, trends: trendCards(items) };
}
