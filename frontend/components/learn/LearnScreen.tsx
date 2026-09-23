"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildRound,
  languagePool,
  localDay,
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
import { ChartIcon, CheckIcon, PersonIcon, WarningIcon } from "../icons";
import Celebration from "./Celebration";
import ScreenTitle from "../ScreenTitle";
import StreakCards from "./StreakCards";

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

  return (
    <>
      <ScreenTitle tabKey="learn" />
      {/*
        * Phone: one column, in the order drawn. Desktop: the quiz on the left,
        * today's progress and the reference list on the right, so the width
        * carries a second column instead of stretching the question.
        */}
      <div className="gutter screen-grid flex flex-col gap-4 pt-4 lg:grid">
        <div className="flex flex-col gap-4">

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

        </div>

        <div className="flex flex-col gap-4">
          {state && ready && quizLang && (
            <div aria-live="polite">
              <StreakCards
                answered={state.today.answered}
                streak={visibleStreak(state, today)}
                copy={copy}
              />
            </div>
          )}

          <Trends trends={trends} copy={copy} />

          <p className="px-1 text-[0.9375rem] leading-5 text-ink-muted">{copy.learn.syntheticNote}</p>
        </div>

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
    </>
  );
}

/** Too few practice messages in this language: say so, and offer another set (never swap silently). */
function LanguageNote({ pool, copy, onAccept }: { pool: LanguagePool; copy: Copy; onAccept: () => void }) {
  const L = copy.learn;
  return (
    <section className="hero flex flex-col gap-3 px-[22px] pt-[22px] pb-5" aria-labelledby="quiz-label">
      <p id="quiz-label" className="text-[0.9375rem] font-semibold text-white/70">
        {L.quizLabel}
      </p>
      <p className="text-[1.375rem] leading-[1.8125rem] font-semibold text-white">{L.fewItems(L.languageName[pool.lang])}</p>
      {pool.fallback && (
        <>
          <button
            type="button"
            onClick={onAccept}
            className="pill pressable w-full bg-white text-[#111113]"
          >
            {L.offerOther(L.languageName[pool.fallback])}
          </button>
          {pool.fallback === "kreol" && <p className="text-[0.9375rem] leading-5 text-white/[0.62]">{L.kreolMixNote}</p>}
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
      <section ref={cardRef} className="hero flex scroll-mt-4 flex-col gap-3 px-[22px] pt-[22px] pb-5" aria-live="polite">
        <p className="text-[0.9375rem] font-semibold text-white/70">{L.scoreLabel}</p>
        <p className="data text-[3.125rem] leading-none font-bold text-white">
          {score} <span className="text-[1.25rem] font-medium text-white/50">/ {round.length}</span>
        </p>
        <div className="flex flex-col gap-1">
          <p className="text-[1.0625rem] font-medium">{L.scoreLine(score, round.length)}</p>
          <p className="text-[0.9375rem] leading-relaxed text-white/[0.72]">{L.scoreComment(score, round.length)}</p>
        </div>
        {best && <p className="text-sm text-white/[0.62]">{L.best(best.score, best.total)}</p>}
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
          className="pill pressable mt-1 w-full bg-white text-[#111113]"
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
    <section ref={cardRef} className="hero flex scroll-mt-4 flex-col gap-3 px-[22px] pt-[22px] pb-5" aria-labelledby="quiz-label">
      <div className="flex items-center justify-between gap-3">
        <p id="quiz-label" className="text-[0.9375rem] font-semibold text-white/70">
          {L.quizLabel}
        </p>
        <span className="data text-[0.9375rem] text-white/55">
          {index + 1} / {round.length}
        </span>
      </div>
      {/* A verbatim scam-or-genuine sample — same monospaced, rule-marked
          treatment as a quoted scam sample elsewhere (see TrendsContent),
          so it reads as quoted evidence rather than the app talking. */}
      <blockquote
        key={item.id}
        lang={item.languageMix === "en" ? "en" : item.languageMix.startsWith("mfe") ? "mfe" : undefined}
        className="mt-1 text-[1.375rem] leading-[1.8125rem] font-semibold text-white [overflow-wrap:anywhere]"
      >
        &ldquo;{item.text}&rdquo;
      </blockquote>

      <div className="mt-2 grid grid-cols-2 gap-2.5">
        {([true, false] as const).map((isScamButton) => {
          const chosen = answer?.choseScam === isScamButton;
          return (
            <button
              key={String(isScamButton)}
              type="button"
              onClick={() => choose(isScamButton)}
              disabled={!!answer}
              aria-pressed={chosen}
              className={`pill pressable transition-opacity ${
                isScamButton ? "bg-white text-[#111113]" : "bg-white/[0.14] text-white"
              } ${answer && !chosen ? "opacity-35" : ""} ${chosen ? "ring-2 ring-white/70" : ""}`}
            >
              {isScamButton ? L.scam : L.genuine}
            </button>
          );
        })}
      </div>

      <p className="text-[0.9375rem] text-white/[0.62]" aria-live="polite">
        {L.progress(index + 1, round.length, right)}
      </p>

      {answer && <Reveal item={item} answer={answer} copy={copy} lang={lang} />}

      {answer && (
        <button
          ref={nextRef}
          type="button"
          onClick={next}
          className="pill pressable w-full bg-white text-[#111113]"
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
    <div role="status" className="flex flex-col gap-3 rounded-2xl bg-white/10 p-4">
      <p className="text-[1.0625rem] font-semibold">
        {/* Correct/incorrect reuses the same accent/danger tones as the
            Genuine/Scam choice buttons above, rather than a separate
            green/pink pair, so the feedback colour ties directly back to
            the choice the player made. */}
        <span className={answer.correct ? "text-safe" : "text-danger"}>{answer.correct ? L.correct : L.incorrect}</span>{" "}
        {item.isScam ? L.isScam : L.isGenuine}
      </p>
      {reasons.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="micro text-white/[0.62]">{L.whyLabel}</p>
          <ul className="flex flex-col gap-1.5">
            {reasons.map((r) => (
              <li key={r} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug">
                {item.isScam ? (
                  <span aria-hidden="true" className="mt-[0.45em] size-1.5 shrink-0 bg-danger" />
                ) : (
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-safe" strokeWidth={2.5} />
                )}
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showMeaning && (
        <p className="text-sm leading-relaxed text-white/70">
          <span className="font-semibold text-white/85">{L.inEnglish}:</span> {item.englishMeaning}
        </p>
      )}
    </div>
  );
}

/** Tint and glyph per pattern, so the three rows read apart at a glance. */
const TAG_TONE: Record<TrendCard["category"], { chip: string; Icon: typeof WarningIcon }> = {
  parcel_fee: { chip: "bg-caution-soft text-caution-ink", Icon: WarningIcon },
  fake_relative: { chip: "bg-danger-soft text-danger-ink", Icon: PersonIcon },
  investment: { chip: "bg-safe-soft text-safe-ink", Icon: ChartIcon },
};

/**
 * No report counts here on purpose: data/sender-reputation-seed/ has no data
 * yet, and a fraud screen must not show numbers we can't source. When seed
 * data mapped to these categories lands, add the count from it.
 */
function Trends({ trends, copy }: { trends: TrendCard[]; copy: Copy }) {
  const L = copy.learn;
  return (
    <section className="sheet" aria-labelledby="trends-label">
      <div className="px-5 pt-4 pb-1">
        <h2 id="trends-label" className="micro text-ink-muted">
          {L.trendsTitle}
        </h2>
      </div>
      <ul className="flex flex-col px-5 pb-2 [&>li+li]:border-t [&>li+li]:border-card-border">
        {trends.map((t) => (
          <li key={t.category} className="flex flex-col gap-2 py-3.5">
            <div className="flex items-center gap-3">
              <span className={`flex size-[34px] shrink-0 items-center justify-center rounded-full ${TAG_TONE[t.category].chip}`}>
                {(() => {
                  const Glyph = TAG_TONE[t.category].Icon;
                  return <Glyph className="size-[17px]" strokeWidth={2} />;
                })()}
              </span>
              <span className="flex-1 text-[1.0625rem] font-medium text-ink">{L.trends[t.category].tag}</span>
            </div>
            {t.example && (
              <p className="rounded-2xl bg-muted-surface px-3.5 py-3 text-[0.9375rem] leading-5 text-ink-soft [overflow-wrap:anywhere]">
                &ldquo;{t.example.text}&rdquo;
              </p>
            )}
            <p className="text-[0.9375rem] leading-5 text-ink-muted">{L.trends[t.category].body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
