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
      <header className="flex items-start justify-between gap-4">
        <h1>{copy.learn.headline}</h1>
        {streakShown >= STREAK_PILL_MIN && (
          <span className="micro mt-2 shrink-0 bg-caution-soft px-2.5 py-1 whitespace-nowrap text-caution-ink">
            {copy.learn.streak(streakShown)}
          </span>
        )}
      </header>

      {/* Wait for the saved language so a wrong-language question never flashes. */}
      {!ready ? (
        <div className="h-72 bg-surface-dark" aria-hidden="true" />
      ) : !quizLang ? (
        <LanguageNote pool={pool} copy={copy} onAccept={() => pool.fallback && setAcceptedFallback(pool.fallback)} />
      ) : (
        <div className="flex flex-col gap-3">
          {quizLang !== lang && (
            <p className="micro w-fit bg-muted-surface px-2 py-1.5 text-ink-soft">
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
        <p className="-mt-5 flex items-center gap-2 text-[0.8125rem] font-medium text-ink-soft" aria-live="polite">
          {doneToday ? (
            <>
              <CheckIcon className="size-4 shrink-0 text-accent-ink" strokeWidth={2.5} />
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
    <section className="flex flex-col gap-4 bg-surface-dark px-5 py-6 text-on-ink" aria-labelledby="quiz-label">
      <p id="quiz-label" className="micro text-on-ink/60">
        {L.quizLabel}
      </p>
      <p className="font-heading text-[1.5rem] leading-tight font-semibold">{L.fewItems(L.languageName[pool.lang])}</p>
      {pool.fallback && (
        <>
          <button
            type="button"
            onClick={onAccept}
            className="pressable font-heading flex min-h-14 items-center justify-center bg-on-ink px-5 text-[1.0625rem] font-semibold tracking-[0.06em] text-surface-dark uppercase hover:opacity-90"
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
    <section className="flex flex-col gap-2.5 border border-dashed border-line-strong p-4" aria-label={copy.learn.dev.title}>
      <p className="micro text-ink-muted">{copy.learn.dev.title}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReset}
          className="pressable micro min-h-10 border border-line-strong bg-card px-3 text-ink hover:bg-muted-surface"
        >
          {copy.learn.dev.reset}
        </button>
        <button
          type="button"
          onClick={onSeed}
          className="pressable micro min-h-10 border border-line-strong bg-card px-3 text-ink hover:bg-muted-surface"
        >
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
      <section ref={cardRef} className="flex scroll-mt-4 flex-col gap-4 bg-surface-dark px-5 py-6 text-on-ink" aria-live="polite">
        <p className="micro text-on-ink/60">{L.scoreLabel}</p>
        <p className="font-heading text-[3.5rem] leading-none font-medium tabular-nums">
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
          className="pressable font-heading mt-1 flex min-h-14 items-center justify-center bg-on-ink px-5 text-[1.0625rem] font-semibold tracking-[0.06em] text-surface-dark uppercase hover:opacity-90"
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
    <section ref={cardRef} className="flex scroll-mt-4 flex-col gap-5 bg-surface-dark px-5 py-6 text-on-ink" aria-labelledby="quiz-label">
      <p id="quiz-label" className="micro text-on-ink/60">
        {L.quizLabel}
      </p>
      {/* A verbatim scam-or-genuine sample — same monospaced, rule-marked
          treatment as a quoted scam sample elsewhere (see TrendsContent),
          so it reads as quoted evidence rather than the app talking. */}
      <blockquote
        key={item.id}
        lang={item.languageMix === "en" ? "en" : item.languageMix.startsWith("mfe") ? "mfe" : undefined}
        className="data border-l-2 border-l-white/20 bg-white/5 px-3.5 py-3 text-[0.9375rem] leading-relaxed text-on-ink [overflow-wrap:anywhere]"
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
              className={`pressable font-heading flex min-h-14 items-center justify-center px-4 text-[1.0625rem] font-semibold tracking-[0.04em] text-white uppercase transition-opacity ${
                isScamButton ? "bg-danger" : "bg-safe"
              } ${answer && !chosen ? "opacity-35" : ""} ${chosen ? "ring-2 ring-white ring-offset-2 ring-offset-surface-dark" : ""}`}
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
          className="pressable font-heading flex min-h-14 items-center justify-center bg-on-ink px-5 text-[1.0625rem] font-semibold tracking-[0.06em] text-surface-dark uppercase hover:opacity-90"
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
    <div role="status" className="flex flex-col gap-3 bg-white/10 p-4">
      <p className="text-[1.0625rem] font-semibold">
        {/* Correct/incorrect reuses the same accent/danger tones as the
            Genuine/Scam choice buttons above, rather than a separate
            green/pink pair, so the feedback colour ties directly back to
            the choice the player made. */}
        <span className={answer.correct ? "text-accent" : "text-danger"}>{answer.correct ? L.correct : L.incorrect}</span>{" "}
        {item.isScam ? L.isScam : L.isGenuine}
      </p>
      {reasons.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="micro text-on-ink/60">{L.whyLabel}</p>
          <ul className="flex flex-col gap-1.5">
            {reasons.map((r) => (
              <li key={r} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug">
                {item.isScam ? (
                  <span aria-hidden="true" className="mt-[0.45em] size-1.5 shrink-0 bg-danger" />
                ) : (
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.5} />
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
  parcel_fee: "bg-caution-soft text-caution-ink",
  fake_relative: "bg-danger-soft text-danger-ink",
  investment: "bg-muted-surface text-ink-muted",
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
      <h2 id="trends-label" className="micro text-ink-muted">
        {L.trendsTitle}
      </h2>
      <ul className="flex flex-col gap-3">
        {trends.map((t) => (
          <li key={t.category} className="card flex flex-col gap-3 p-5">
            <span className={`micro w-fit px-1.5 py-1 ${TAG_TONE[t.category]}`}>{L.trends[t.category].tag}</span>
            {t.example && (
              <p className="data border-l-2 border-l-card-border bg-muted-surface px-3 py-2.5 leading-relaxed text-ink-soft [overflow-wrap:anywhere]">
                &ldquo;{t.example.text}&rdquo;
              </p>
            )}
            <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{L.trends[t.category].body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
