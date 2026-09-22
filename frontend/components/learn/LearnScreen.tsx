"use client";

import { useEffect, useRef, useState } from "react";
import { buildRound, localDay, nextStreak, STREAK_PILL_MIN, type QuizItem, type TrendCard } from "@/lib/learn-content";
import { redact } from "@/lib/redact";
import { safeChecks } from "@/lib/result";
import { getLearnStats, saveLearnStats, type LearnStats } from "@/lib/storage";
import type { Copy, UiLanguage } from "@/lib/i18n";
import { useLanguage } from "../LanguageProvider";
import { CheckIcon } from "../icons";

/**
 * Learn tab. Fully client-side over build-time corpus data: no API call.
 * Explanations reuse the result screen's exact wording (copy.result.*), so
 * a player recognises the same phrases when they check a real message.
 */
export default function LearnScreen({ items, trends }: { items: QuizItem[]; trends: TrendCard[] }) {
  const { lang, copy } = useLanguage();
  // null until mounted: localStorage isn't available during server render.
  const [stats, setStats] = useState<LearnStats | null>(null);

  useEffect(() => setStats(getLearnStats()), []);

  const update = (next: LearnStats) => {
    setStats(next);
    saveLearnStats(next);
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4 pt-2">
        <h1>{copy.learn.headline}</h1>
        {stats && stats.streak >= STREAK_PILL_MIN && (
          <span className="mt-2 shrink-0 rounded-pill bg-caution-soft px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-caution">
            {copy.learn.streak(stats.streak)}
          </span>
        )}
      </header>

      <Quiz
        items={items}
        copy={copy}
        lang={lang}
        onAnswered={() => {
          const current = getLearnStats();
          const today = localDay();
          if (current.lastDay !== today) update({ ...current, streak: nextStreak(current, today), lastDay: today });
        }}
        onFinished={(score, total) => {
          const current = getLearnStats();
          const prev = current.best;
          if (!prev || score / total > prev.score / prev.total || (score / total === prev.score / prev.total && total > prev.total)) {
            update({ ...current, best: { score, total } });
          }
        }}
        best={stats?.best ?? null}
      />
      <p className="-mt-5 px-1 text-[0.8125rem] leading-snug text-ink-muted">{copy.learn.syntheticNote}</p>

      <Trends trends={trends} copy={copy} />
    </div>
  );
}

type Answer = { choseScam: boolean; correct: boolean };

function Quiz({
  items,
  copy,
  lang,
  onAnswered,
  onFinished,
  best,
}: {
  items: QuizItem[];
  copy: Copy;
  lang: UiLanguage;
  onAnswered: () => void;
  onFinished: (score: number, total: number) => void;
  best: { score: number; total: number } | null;
}) {
  // First round is deterministic (same on server and client, rehearsable); "Play again" reshuffles.
  const [round, setRound] = useState<QuizItem[]>(() => buildRound(items));
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
            setRound(buildRound(items, Math.random));
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
    onAnswered();
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
