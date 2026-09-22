/**
 * Learn tab content: a thin adapter over the Kreol language owner's scam
 * corpus (data/kreol-dataset/scam-corpus.jsonl). Nothing here is copied or
 * invented: lib/learn-data.ts reads that file at build time and these pure
 * functions map its rows onto the quiz. Unit-tested in lib/learn-content.test.ts.
 *
 * The corpus rows are synthetic (provenance "synthetic_claude") and, at the
 * time of writing, all "draft_generated" (not yet reviewed). The UI labels
 * them as made-up practice examples, per data/kreol-dataset/CLAUDE.md
 * ("Synthetic examples must be identified as synthetic"). When rows get
 * reviewed, reviewed ones are picked first automatically.
 *
 * DEMO NOTE (reliability fallback): the Learn tab makes no network call.
 * The corpus is baked in at build time, so it works with the backend down
 * and, once visited, offline via the service worker.
 */

import type { SignalKind } from "./result";

/** One row of scam-corpus.jsonl (schema: data/kreol-dataset/README.md). */
export interface CorpusRow {
  id: string;
  original_message: string;
  language_mix: string;
  english_meaning: string;
  scam_type: string;
  risk_signals: string[];
  status: string;
  provenance?: string;
}

export interface QuizItem {
  id: string;
  text: string;
  /** "mfe", "mfe+en", "en", ... (mfe = Kreol Morisien). */
  languageMix: string;
  englishMeaning: string;
  isScam: boolean;
  scamType: string;
  /** Result-screen signal kinds, most important first. Empty for genuine messages. */
  reasons: SignalKind[];
  reviewed: boolean;
}

/**
 * Corpus risk signals (VALID_RISK_SIGNALS in data/kreol-dataset/scripts/corpus_tool.py)
 * → the result screen's signal kinds, so the quiz explains a message with
 * exactly the words the result screen uses.
 */
const RISK_SIGNAL_KIND: Record<string, SignalKind> = {
  URGENCY: "urgency_language",
  THREAT: "urgency_language",
  AUTHORITY_PRESSURE: "urgency_language",
  SECRECY: "secrecy",
  OTP_REQUEST: "credential_request",
  SENSITIVE_INFO_REQUEST: "credential_request",
  PAYMENT_REQUEST: "payment_request",
  UNEXPECTED_PAYMENT: "payment_request",
  CRYPTO_REQUEST: "payment_request",
  PARCEL_FEE: "payment_request",
  CHANGED_PAYMENT_DETAILS: "payment_request",
  BENEFICIARY_MISMATCH: "payment_request",
  IMPERSONATION: "spoofed_identity",
  UNVERIFIED_IDENTITY: "spoofed_identity",
  UNKNOWN_SENDER: "sender_mismatch",
  NEW_PHONE_NUMBER: "sender_mismatch",
  DOMAIN_MISMATCH: "lookalike_url",
  LOOKALIKE_DOMAIN: "lookalike_url",
  SHORTENED_URL: "lookalike_url",
  SUSPICIOUS_URL: "lookalike_url",
  GUARANTEED_RETURN: "prize_offer",
  PRIZE_LURE: "prize_offer",
  REFUND_LURE: "prize_offer",
};

/** Order reasons are shown in: the most actionable warning first. */
const REASON_PRIORITY: SignalKind[] = [
  "lookalike_url",
  "credential_request",
  "secrecy",
  "urgency_language",
  "payment_request",
  "prize_offer",
  "sender_mismatch",
  "spoofed_identity",
];

const REVIEWED = new Set(["owner_reviewed", "ported_reviewed"]);

export function toQuizItems(rows: readonly CorpusRow[]): QuizItem[] {
  return rows
    .filter((r) => r && typeof r.original_message === "string" && r.original_message.trim() && r.status !== "rejected")
    .map((r) => {
      const kinds = new Set(
        (Array.isArray(r.risk_signals) ? r.risk_signals : [])
          .map((s) => RISK_SIGNAL_KIND[String(s).trim().toUpperCase()])
          .filter(Boolean),
      );
      const isScam = r.scam_type !== "legitimate";
      return {
        id: r.id,
        text: r.original_message.trim(),
        languageMix: r.language_mix,
        englishMeaning: r.english_meaning ?? "",
        isScam,
        scamType: r.scam_type,
        reasons: isScam ? REASON_PRIORITY.filter((k) => kinds.has(k)) : [],
        reviewed: REVIEWED.has(r.status),
      };
    });
}

// ---------- Language ----------

/** Quiz languages, matching the UI's EN / FR / KREOL switch. */
export type QuizLanguage = "en" | "fr" | "kreol";

/** Below this many messages a language gets a "more coming" note instead of a thin quiz. */
export const MIN_LANGUAGE_ITEMS = 4;

/**
 * Which quiz language a corpus row belongs to. `en` and `fr` are
 * single-language rows; every `mfe…` row is Kreol, including code-switched
 * ones (`mfe+en`, `mfe+fr`, `mfe+en+fr`), which the dataset tags Kreol-first.
 */
export function quizLanguageOf(languageMix: string): QuizLanguage | null {
  const mix = languageMix.trim().toLowerCase();
  if (mix === "en") return "en";
  if (mix === "fr") return "fr";
  if (mix === "mfe" || mix.startsWith("mfe+")) return "kreol";
  return null;
}

export function itemsInLanguage(items: readonly QuizItem[], lang: QuizLanguage): QuizItem[] {
  return items.filter((i) => quizLanguageOf(i.languageMix) === lang);
}

export interface LanguagePool {
  lang: QuizLanguage;
  /** Items in the selected language (possibly too few to play). */
  items: QuizItem[];
  enough: boolean;
  /**
   * Offered (never applied silently) when the language has too few items:
   * English if English has enough, otherwise the largest language that does,
   * so the offer is always playable. Absent if nothing has enough.
   */
  fallback?: QuizLanguage;
}

export function languagePool(items: readonly QuizItem[], lang: QuizLanguage): LanguagePool {
  const own = itemsInLanguage(items, lang);
  if (own.length >= MIN_LANGUAGE_ITEMS) return { lang, items: own, enough: true };
  const others = (["en", "fr", "kreol"] as const).filter((l) => l !== lang);
  const playable = others.filter((l) => itemsInLanguage(items, l).length >= MIN_LANGUAGE_ITEMS);
  const fallback = playable.includes("en")
    ? "en"
    : [...playable].sort((a, b) => itemsInLanguage(items, b).length - itemsInLanguage(items, a).length)[0];
  return { lang, items: own, enough: false, ...(fallback ? { fallback } : {}) };
}

// ---------- Rounds ----------

export const ROUND_SIZE = 8;
const GENUINE_PER_ROUND = 3;

function shuffle<T>(list: T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Take scams round-robin across scam types, so a round isn't five bank messages. */
function spreadByType(scams: QuizItem[], count: number): QuizItem[] {
  const groups = new Map<string, QuizItem[]>();
  for (const s of scams) groups.set(s.scamType, [...(groups.get(s.scamType) ?? []), s]);
  const queues = [...groups.values()];
  const out: QuizItem[] = [];
  while (out.length < count && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && out.length < count) out.push(q.shift() as QuizItem);
  }
  return out;
}

const byTrust = (a: QuizItem, b: QuizItem) => Number(b.reviewed) - Number(a.reviewed) || a.id.localeCompare(b.id);

/**
 * A round of up to ROUND_SIZE questions in ONE language, with a few genuine
 * messages mixed in (so "always scam" doesn't win). A language with fewer
 * items gets a shorter round; it's never padded with other languages.
 * Without `random` the round is deterministic per language, so the first
 * play is the same every time (rehearsable for the demo); "Play again"
 * passes Math.random to reshuffle.
 */
export function buildRound(items: readonly QuizItem[], lang: QuizLanguage, random?: () => number): QuizItem[] {
  const pool = itemsInLanguage(items, lang);
  const order = (list: QuizItem[]) => (random ? shuffle(list, random) : [...list].sort(byTrust));
  const genuine = order(pool.filter((i) => !i.isScam));
  const scams = order(pool.filter((i) => i.isScam));

  const g = Math.min(GENUINE_PER_ROUND, genuine.length, ROUND_SIZE);
  const pickedScams = spreadByType(scams, Math.min(ROUND_SIZE - g, scams.length));
  const pickedGenuine = genuine.slice(0, g);

  if (random) return shuffle([...pickedScams, ...pickedGenuine], random);

  // Deterministic: genuine messages evenly spaced among the scams.
  const n = pickedScams.length + pickedGenuine.length;
  const slots = new Set(pickedGenuine.map((_, i) => Math.floor(((i + 1) * n) / (pickedGenuine.length + 1))));
  const out: QuizItem[] = [];
  let si = 0;
  let gi = 0;
  for (let i = 0; i < n; i++) out.push(slots.has(i) && gi < pickedGenuine.length ? pickedGenuine[gi++] : pickedScams[si++]);
  return out;
}

// ---------- "Common scam patterns" ----------

export type TrendCategory = "parcel_fee" | "fake_relative" | "investment";

/** Each card's example line is a real corpus row of the matching scam_type. */
const TREND_SOURCES: ReadonlyArray<{ category: TrendCategory; scamType: string; preferId: string }> = [
  { category: "parcel_fee", scamType: "parcel_customs", preferId: "FL-KM-0015" },
  { category: "fake_relative", scamType: "family_impersonation", preferId: "FL-KM-0012" },
  { category: "investment", scamType: "investment", preferId: "FL-KM-0017" },
];

export interface TrendCard {
  category: TrendCategory;
  /** Omitted if the corpus has no row of that type. */
  example?: { id: string; text: string };
}

export function trendCards(items: readonly QuizItem[]): TrendCard[] {
  return TREND_SOURCES.map(({ category, scamType, preferId }) => {
    const match = items.find((i) => i.id === preferId && i.scamType === scamType) ?? items.find((i) => i.scamType === scamType);
    return match ? { category, example: { id: match.id, text: match.text } } : { category };
  });
}

// ---------- Streak ----------

/** Local calendar day as YYYY-MM-DD. */
export function localDay(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayNumber(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return Math.round(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() / 86_400_000);
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD), or null if either is malformed. */
export function dayGap(from: string, to: string): number | null {
  const a = dayNumber(from);
  const b = dayNumber(to);
  return a === null || b === null ? null : b - a;
}

/** Streak after playing on `today`: same day unchanged, next day +1, any gap resets to 1. */
export function nextStreak(prev: { streak: number; lastDay: string | null }, today: string): number {
  const t = dayNumber(today);
  const l = prev.lastDay ? dayNumber(prev.lastDay) : null;
  if (t === null || l === null || prev.streak < 1) return 1;
  const gap = t - l;
  if (gap === 0) return prev.streak;
  if (gap === 1) return prev.streak + 1;
  return 1;
}

/** The streak pill only appears from 2 days: "1 day streak" on a fresh install looks broken. */
export const STREAK_PILL_MIN = 2;
