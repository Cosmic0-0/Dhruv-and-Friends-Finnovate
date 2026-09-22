"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildRound,
  languagePool,
  localDay,
  STREAK_PILL_MIN,
  type LanguagePool,
  type QuizItem,
  type QuizLanguage,
  type TrendCard,
} from "@/lib/learn-content";
import { redact } from "@/lib/redact";
import { safeChecks } from "@/lib/result";
import { DAILY_GOAL, recordAnswer, visibleStreak, type Mistake, type StreakState } from "@/lib/streak";
import { getStreakState, resetStreakState, saveStreakState, seedStreakEndingYesterday } from "@/lib/storage";
import type { Copy, UiLanguage } from "@/lib/i18n";
import { useLanguage } from "../LanguageProvider";
import { CheckIcon } from "../icons";
import Celebration from "./Celebration";

type CelebrationData = { streak: number; right: number; total: number; mistakes: Mistake[] };

/**
 * Learn tab. Fully client-side over build-time corpus data: no API call.
 * Explanations reuse the result screen's exact wording (copy.result.*), so
 * a player recognises the same phrases when they check a real message.
 *
 * The quiz only ever shows messages in the selected language. If that
 * language has too few, a note says more are coming and offers another set;
 * it's never swapped in silently.
 */
export default function LearnScreen({ items, trends }: { items: QuizItem[]; trends: TrendCard[] }) {
  const { lang, copy, ready } = useLanguage();
  // null until mounted: localStorage isn't available during server render.
  const [state, setState] = useState<StreakState | null>(null);
  const [acceptedFallback, setAcceptedFallback] = useState<QuizLanguage | null>(null);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const today = localDay();

  useEffect(() => setState(getStreakState()), []);
  // A fallback accepted for one language doesn't carry over to another.
  useEffect(() => setAcceptedFallback(null), [lang]);

  const save = (next: StreakState) => {
    setState(next);
    saveStreakState(next);
  };

  const pool = languagePool(items, lang);
  const quizLang: QuizLanguage | null = pool.enough ? lang : acceptedFallback;
  const streakShown = state ? visibleStreak(state, today) : 0;
  const doneToday = state?.lastCompletedDay === today;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4 pt-2">
        <h1>{copy.learn.headline}</h1>
        {streakShown >= STREAK_PILL_MIN && (
          <span className="mt-2 shrink-0 rounded-pill bg-caution-soft px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-caution">
            {copy.learn.streak(streakShown)}
          </span>
        )}
      </header>

      {/* Wait for the saved language so a wrong-language question never flashes. */}
      {!ready ? (
        <div className="h-72 rounded-card bg-ink" aria-hidden="true" />
      ) : !quizLang ? (
        <LanguageNote pool={pool} copy={copy} onAccept={() => pool.fallback && setAcceptedFallback(pool.fallback)} />
      ) : (
        <div className="flex flex-col gap-3">
          {quizLang !== lang && (
            <p className="w-fit rounded-pill bg-muted-surface px-3 py-1 text-xs font-semibold text-ink-soft">
              {copy.learn.practisingIn(copy.learn.languageName[quizLang])}
            </p>
          )}
          <Quiz
            key={quizLang}
            items={items}
            quizLang={quizLang}
            copy={copy}
            lang={lang}
            onAnswered={(item, correct) => {
              const { state: next, completedNow } = recordAnswer(getStreakState(today), { item, correct }, today);
              const celebrate = completedNow && !next.today.celebrated;
              if (celebrate) next.today = { ...next.today, celebrated: true }; // once per day, even across reloads
              save(next);
              if (celebrate) {
                setCelebration({
                  streak: next.streak,
                  right: next.today.correct,
                  total: next.today.answered,
                  mistakes: next.today.mistakes,
                });
              }
            }}
            onFinished={(score, total) => {
              const current = getStreakState(today);
              const prev = current.best;
              if (!prev || score / total > prev.score / prev.total || (score / total === prev.score / prev.total && total > prev.total)) {
                save({ ...current, best: { score, total } });
              }
            }}
            best={state?.best ?? null}
          />
        </div>
      )}

      {state && ready && quizLang && (
        <p className="-mt-5 flex items-center gap-2 px-1 text-[0.8125rem] font-medium text-ink-soft" aria-live="polite">
          {doneToday ? (
            <>
              <CheckIcon className="size-4 shrink-0 text-safe" strokeWidth={2.5} />
              {copy.learn.dailyDone}
            </>
          ) : (
            copy.learn.dailyProgress(Math.min(state.today.answered, DAILY_GOAL), DAILY_GOAL)
          )}
        </p>
      )}
      <p className="-mt-5 px-1 text-[0.8125rem] leading-snug text-ink-muted">{copy.learn.syntheticNote}</p>

      <Trends trends={trends} copy={copy} />

      {process.env.NODE_ENV === "development" && (
        <DevTools
          copy={copy}
          onReset={() => {
            resetStreakState();
            setState(getStreakState());
          }}
          onSeed={() => {
            seedStreakEndingYesterday(2);
            setState(getStreakState());
          }}
        />
      )}

      {celebration && <Celebration {...celebration} copy={copy} onClose={() => setCelebration(null)} />}
    </div>
  );
}

/** Too few practice messages in this language: say so, and offer another set (never swap silently). */
function LanguageNote({ pool, copy, onAccept }: { pool: LanguagePool; copy: Copy; onAccept: () => void }) {
  const L = copy.learn;
  return (
    <section className="flex flex-col gap-4 rounded-card bg-ink p-6 text-on-ink" aria-labelledby="quiz-label">
      <p id="quiz-label" className="text-[0.6875rem] font-semibold tracking-[0.14em] text-on-ink/60 uppercase">
        {L.quizLabel}
      </p>
      <p className="font-serif text-[1.3125rem] leading-snug">{L.fewItems(L.languageName[pool.lang])}</p>
      {pool.fallback && (
        <>
          <button
            type="button"
            onClick={onAccept}
            className="flex min-h-14 items-center justify-center rounded-card bg-on-ink px-5 font-semibold text-ink"
          >
            {L.offerOther(L.languageName[pool.fallback])}
          </button>
          {pool.fallback === "kreol" && <p className="text-sm leading-relaxed text-on-ink/70">{L.kreolMixNote}</p>}
        </>
      )}
    </section>
  );
}

/**
 * `next dev` only (compiled out of production builds): replay the daily
 * celebration. "Reset streak" forgets everything, so 5 answers show the day-one
 * tick; "Pretend 2 days done" makes today day 3, so 5 answers show the flame.
 */
function DevTools({ copy, onReset, onSeed }: { copy: Copy; onReset: () => void; onSeed: () => void }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-dashed border-ink/25 p-4" aria-label={copy.learn.dev.title}>
      <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-muted uppercase">{copy.learn.dev.title}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onReset} className="rounded-pill border border-ink/20 bg-card px-3 py-1.5 text-sm font-semibold text-ink">
          {copy.learn.dev.reset}
        </button>
        <button type="button" onClick={onSeed} className="rounded-pill border border-ink/20 bg-card px-3 py-1.5 text-sm font-semibold text-ink">
          {copy.learn.dev.seed}
        </button>
      </div>
    </section>
  );
}

type Answer = { choseScam: boolean; correct: boolean };

function Quiz({
  items,
  quizLang,
  copy,
  lang,
  onAnswered,
  onFinished,
  best,
}: {
  items: QuizItem[];
  /** Language of the messages in the round (may differ from the UI language after an accepted fallback). */
  quizLang: QuizLanguage;
  copy: Copy;
  lang: UiLanguage;
  onAnswered: (item: QuizItem, correct: boolean) => void;
  onFinished: (score: number, total: number) => void;
  best: { score: number; total: number } | null;
}) {
  // First round is deterministic per language (rehearsable); "Play again" reshuffles within it.
  const [round, setRound] = useState<QuizItem[]>(() => buildRound(items, quizLang));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  const L = copy.learn;

  // Keep the viewport steady: scroll only as far as needed, so the question
  // stays on screen next to its explanation. Focus follows without jumping.
  useEffect(() => {
    if (!answer) return;
    nextRef.current?.focus({ preventScroll: true });
    nextRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [answer]);

  useEffect(() => {
    if (!moved.current) return; // not on first render
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (finished) playAgainRef.current?.focus({ preventScroll: true });
  }, [index, finished]);

  if (round.length === 0) return null;

  if (finished) {
    return (
      <section ref={cardRef} className="flex scroll-mt-4 flex-col gap-4 rounded-card bg-ink p-6 text-on-ink" aria-live="polite">
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-on-ink/60 uppercase">{L.scoreLabel}</p>
        <p className="font-serif text-[3.5rem] leading-none font-medium tabular-nums">
          {score} <span className="text-on-ink/50">/ {round.length}</span>
        </p>
        <div className="flex flex-col gap-1">
          <p className="text-[1.0625rem] font-medium">{L.scoreLine(score, round.length)}</p>
          <p className="text-[0.9375rem] leading-relaxed text-on-ink/75">{L.scoreComment(score, round.length)}</p>
        </div>
        {best && <p className="text-sm text-on-ink/60">{L.best(best.score, best.total)}</p>}
        <button
          ref={playAgainRef}
          type="button"
          onClick={() => {
            setRound(buildRound(items, quizLang, Math.random));
            setIndex(0);
            setScore(0);
            setAnswer(null);
            setFinished(false);
          }}
          className="mt-1 flex min-h-14 items-center justify-center rounded-card bg-on-ink px-5 font-semibold text-ink"
        >
          {L.playAgain}
        </button>
      </section>
    );
  }

  const item = round[index];
  const right = score;
  const choose = (choseScam: boolean) => {
    if (answer) return;
    const correct = choseScam === item.isScam;
    setAnswer({ choseScam, correct });
    if (correct) setScore((s) => s + 1);
    onAnswered(item, correct);
  };
  const next = () => {
    moved.current = true;
    if (index + 1 < round.length) {
      setIndex(index + 1);
      setAnswer(null);
    } else {
      setFinished(true);
      onFinished(score, round.length);
    }
  };

  return (
    <section ref={cardRef} className="flex scroll-mt-4 flex-col gap-5 rounded-card bg-ink p-6 text-on-ink" aria-labelledby="quiz-label">
      <p id="quiz-label" className="text-[0.6875rem] font-semibold tracking-[0.14em] text-on-ink/60 uppercase">
        {L.quizLabel}
      </p>
      <blockquote
        key={item.id}
        lang={item.languageMix === "en" ? "en" : item.languageMix.startsWith("mfe") ? "mfe" : undefined}
        className="font-serif text-[1.3125rem] leading-snug [overflow-wrap:anywhere]"
      >
        &ldquo;{item.text}&rdquo;
      </blockquote>

      <div className="grid grid-cols-2 gap-3">
        {([true, false] as const).map((isScamButton) => {
          const chosen = answer?.choseScam === isScamButton;
          return (
            <button
              key={String(isScamButton)}
              type="button"
              onClick={() => choose(isScamButton)}
              disabled={!!answer}
              aria-pressed={chosen}
              className={`flex min-h-14 items-center justify-center rounded-card px-4 text-[1.0625rem] font-semibold text-white transition-opacity ${
                isScamButton ? "bg-danger" : "bg-safe"
              } ${answer && !chosen ? "opacity-35" : ""} ${chosen ? "ring-2 ring-white ring-offset-2 ring-offset-ink" : ""}`}
            >
              {isScamButton ? L.scam : L.genuine}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-on-ink/70" aria-live="polite">
        {L.progress(index + 1, round.length, right)}
      </p>

      {answer && <Reveal item={item} answer={answer} copy={copy} lang={lang} />}

      {answer && (
        <button
          ref={nextRef}
          type="button"
          onClick={next}
          className="flex min-h-14 items-center justify-center rounded-card bg-on-ink px-5 font-semibold text-ink"
        >
          {index + 1 < round.length ? L.next : L.seeScore}
        </button>
      )}
    </section>
  );
}

/** Why it's a scam (result-screen signal titles) or why it's genuine (result-screen SAFE ticks). */
function Reveal({ item, answer, copy, lang }: { item: QuizItem; answer: Answer; copy: Copy; lang: UiLanguage }) {
  const L = copy.learn;
  const reasons = item.isScam
    ? item.reasons.slice(0, 4).map((k) => copy.result.signalTitles[k])
    : safeChecks([], item.text, redact(item.text).redactions).map((k) => copy.result.checks[k]);
  const showMeaning = lang !== "kreol" && item.languageMix !== "en" && item.englishMeaning;

  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl bg-white/10 p-4">
      <p className="text-[1.0625rem] font-semibold">
        <span className={answer.correct ? "text-[#9fdcbf]" : "text-[#f4b1ab]"}>{answer.correct ? L.correct : L.incorrect}</span>{" "}
        {item.isScam ? L.isScam : L.isGenuine}
      </p>
      {reasons.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-on-ink/60 uppercase">{L.whyLabel}</p>
          <ul className="flex flex-col gap-1.5">
            {reasons.map((r) => (
              <li key={r} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug">
                {item.isScam ? (
                  <span aria-hidden="true" className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-[#f4b1ab]" />
                ) : (
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-[#9fdcbf]" strokeWidth={2.5} />
                )}
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showMeaning && (
        <p className="text-sm leading-relaxed text-on-ink/70">
          <span className="font-semibold text-on-ink/85">{L.inEnglish}:</span> {item.englishMeaning}
        </p>
      )}
    </div>
  );
}

const TAG_TONE: Record<TrendCard["category"], string> = {
  parcel_fee: "bg-caution-soft text-caution",
  fake_relative: "bg-danger-soft text-danger",
  investment: "bg-muted-surface text-ink-soft",
};

/**
 * No report counts here on purpose: data/sender-reputation-seed/ has no data
 * yet, and a fraud screen must not show numbers we can't source. When seed
 * data mapped to these categories lands, add the count from it.
 */
function Trends({ trends, copy }: { trends: TrendCard[]; copy: Copy }) {
  const L = copy.learn;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="trends-label">
      <h2 id="trends-label" className="font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-muted uppercase">
        {L.trendsTitle}
      </h2>
      <ul className="flex flex-col gap-3">
        {trends.map((t) => (
          <li key={t.category} className="card flex flex-col gap-3 p-5">
            <span className={`w-fit rounded-pill px-2.5 py-1 text-[0.6875rem] font-semibold tracking-[0.1em] uppercase ${TAG_TONE[t.category]}`}>
              {L.trends[t.category].tag}
            </span>
            {t.example && (
              <p className="font-serif text-[1.0625rem] leading-snug text-ink [overflow-wrap:anywhere]">&ldquo;{t.example.text}&rdquo;</p>
            )}
            <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{L.trends[t.category].body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
